import { EventEmitter } from 'events';
import { Resume, Workflow, Email, Job, Contact } from '../models/schemas.js';
import { ResumeParserService } from './resumeParser.js';
import { EmailDrafterService } from './emailDrafter.js';
import { x402 } from './x402Protocol.js';

/**
 * Agent Orchestrator - Coordinates the agentic job search workflow
 * 
 * Pipeline:
 * 1. Parse resume → extract skills, experience, etc.
 * 2. For each target role:
 *    a. Search for jobs matching the role
 *    b. For each job found:
 *       i.  Find relevant contacts (recruiters/hiring managers)
 *       ii. Draft personalized email for each contact
 * 3. Store all results in the database
 * 
 * The orchestrator emits events for progress tracking:
 * - 'progress' - workflow progress updates
 * - 'job_found' - new job found
 * - 'contact_found' - new contact found
 * - 'email_drafted' - new email drafted
 * - 'error' - error occurred
 * - 'complete' - workflow completed
 */
export class AgentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.resumeParser = new ResumeParserService();
    this.emailDrafter = new EmailDrafterService();
    
    // Default configuration
    this.config = {
      maxJobsPerRole: options.maxJobsPerRole || 10,
      maxContactsPerJob: options.maxContactsPerJob || 3,
      jobSearchStrategy: options.jobSearchStrategy || 'cheapest',
      peopleSearchStrategy: options.peopleSearchStrategy || 'cheapest',
      delayBetweenSearches: options.delayBetweenSearches || 1000, // ms
      ...options
    };

    // Active workflows being processed
    this.activeWorkflows = new Map();
  }

  /**
   * Start a new agentic workflow
   * @param {Object} params - Workflow parameters
   * @param {string} params.resumeText - Raw resume text
   * @param {string[]} params.targetRoles - List of job titles/roles to search for
   * @param {string[]} params.targetLocations - List of locations to search in
   * @param {Object} params.preferences - Search preferences
   * @returns {Promise<Object>} - Workflow object with ID
   */
  async startWorkflow(params) {
    const { resumeText, targetRoles, targetCompanies = [], targetLocations = [], preferences = {} } = params;

    if (!resumeText || !targetRoles?.length) {
      throw new Error('Resume text and at least one target role are required');
    }

    console.log(`[Agent] Starting workflow for ${targetRoles.length} roles${targetCompanies.length ? ` at ${targetCompanies.length} companies` : ''}`);

    // Create workflow record
    const workflow = await Workflow.create({
      target_roles: targetRoles,
      target_companies: targetCompanies,
      target_locations: targetLocations,
      preferences: {
        work_arrangement: preferences.workArrangement,
        seniority_level: preferences.seniorityLevel,
        max_jobs_per_role: preferences.maxJobsPerRole || this.config.maxJobsPerRole,
        max_contacts_per_job: preferences.maxContactsPerJob || this.config.maxContactsPerJob
      },
      status: 'pending',
      progress: {
        total_roles: targetRoles.length,
        roles_completed: 0,
        current_step: 'initialized'
      },
      started_at: new Date()
    });

    // Track active workflow
    this.activeWorkflows.set(workflow._id.toString(), {
      workflow,
      aborted: false
    });

    // Execute workflow asynchronously
    this.executeWorkflow(workflow._id.toString(), resumeText, targetRoles, targetCompanies, targetLocations, preferences)
      .catch(error => {
        console.error(`[Agent] Workflow ${workflow._id} failed:`, error);
        this.emit('error', { workflowId: workflow._id, error: error.message });
      });

    return {
      workflowId: workflow._id,
      status: 'started',
      message: 'Workflow started. Use the status endpoint to track progress.'
    };
  }

  /**
   * Execute the full workflow pipeline
   */
  async executeWorkflow(workflowId, resumeText, targetRoles, targetCompanies, targetLocations, preferences) {
    const workflowState = this.activeWorkflows.get(workflowId);
    if (!workflowState) {
      throw new Error('Workflow not found');
    }

    try {
      // ============================================
      // Step 1: Parse Resume
      // ============================================
      await this.updateWorkflowStatus(workflowId, 'parsing_resume', 'Parsing resume...');
      
      const parseResult = await this.resumeParser.parseResume(resumeText);
      if (!parseResult.success) {
        throw new Error('Failed to parse resume');
      }

      // Save resume to database
      const resume = await Resume.create({
        raw_text: resumeText,
        ...parseResult.data
      });

      // Link resume to workflow
      await Workflow.findByIdAndUpdate(workflowId, {
        resume_id: resume._id
      });

      console.log(`[Agent] Resume parsed for: ${resume.name}`);
      this.emit('progress', { 
        workflowId, 
        step: 'resume_parsed', 
        data: { name: resume.name, skills: resume.skills?.slice(0, 5) }
      });

      // ============================================
      // Step 2: For each role, search jobs and contacts
      // ============================================
      const allJobs = [];
      const allContacts = [];
      const allEmails = [];
      let totalCost = parseResult.metadata?.cost_usd || 0;
      const costBreakdown = { job_search: 0, people_search: 0, email_generation: 0 };

      for (let roleIndex = 0; roleIndex < targetRoles.length; roleIndex++) {
        const role = targetRoles[roleIndex];
        
        // Check if workflow was aborted
        if (this.activeWorkflows.get(workflowId)?.aborted) {
          console.log(`[Agent] Workflow ${workflowId} was cancelled`);
          await this.updateWorkflowStatus(workflowId, 'cancelled', 'Workflow cancelled by user');
          return;
        }

        await this.updateWorkflowStatus(workflowId, 'searching_jobs', `Searching jobs for: ${role}`, role);
        console.log(`[Agent] Searching jobs for role: ${role} (${roleIndex + 1}/${targetRoles.length})`);

        // ----------------------------------------
        // Step 2a: Search for jobs
        // ----------------------------------------
        const jobsForRole = await this.searchJobsForRole(
          role, 
          targetCompanies,
          targetLocations, 
          preferences,
          workflowId
        );

        costBreakdown.job_search += jobsForRole.cost || 0;
        totalCost += jobsForRole.cost || 0;

        console.log(`[Agent] Found ${jobsForRole.jobs.length} jobs for ${role}`);

        // Process each job
        for (let jobIndex = 0; jobIndex < jobsForRole.jobs.length; jobIndex++) {
          const job = jobsForRole.jobs[jobIndex];
          
          // Check abort flag
          if (this.activeWorkflows.get(workflowId)?.aborted) {
            break;
          }

          // Save job with workflow reference
          job.workflow_id = workflowId;
          const savedJob = await Job.create(job);
          allJobs.push(savedJob);

          this.emit('job_found', { workflowId, job: savedJob });

          // ----------------------------------------
          // Step 2b: Find contacts for this job
          // ----------------------------------------
          await this.updateWorkflowStatus(
            workflowId, 
            'finding_contacts', 
            `Finding contacts at ${job.company_name} for ${job.title}`
          );

          const contactsResult = await this.findContactsForJob(
            job, 
            preferences,
            workflowId
          );

          costBreakdown.people_search += contactsResult.cost || 0;
          totalCost += contactsResult.cost || 0;

          // Process each contact
          for (const contact of contactsResult.contacts) {
            // Check abort flag
            if (this.activeWorkflows.get(workflowId)?.aborted) {
              break;
            }

            // Save contact with workflow reference
            contact.workflow_id = workflowId;
            contact.job_id = savedJob._id;
            const savedContact = await Contact.create(contact);
            allContacts.push(savedContact);

            this.emit('contact_found', { workflowId, contact: savedContact });

            // ----------------------------------------
            // Step 2c: Draft personalized email
            // ----------------------------------------
            await this.updateWorkflowStatus(
              workflowId, 
              'drafting_emails', 
              `Drafting email for ${contact.name} at ${contact.company}`
            );

            try {
              const emailResult = await this.emailDrafter.generateEmail({
                resume: parseResult.data,
                job: savedJob,
                contact: savedContact
              });

              if (emailResult.success) {
                const savedEmail = await Email.create({
                  workflow_id: workflowId,
                  job_id: savedJob._id,
                  contact_id: savedContact._id,
                  recipient_name: savedContact.name,
                  recipient_email: savedContact.email,
                  recipient_title: savedContact.title,
                  recipient_company: savedContact.company,
                  subject: emailResult.subject,
                  body: emailResult.body,
                  model_used: emailResult.metadata.model,
                  prompt_tokens: emailResult.metadata.prompt_tokens,
                  completion_tokens: emailResult.metadata.completion_tokens,
                  generation_cost_usd: emailResult.metadata.cost_usd,
                  job_context: {
                    title: savedJob.title,
                    company: savedJob.company_name,
                    description_snippet: savedJob.description_snippet
                  },
                  resume_context: {
                    name: resume.name,
                    current_title: resume.current_title,
                    skills: resume.skills?.slice(0, 5),
                    summary: resume.summary
                  }
                });

                allEmails.push(savedEmail);
                costBreakdown.email_generation += emailResult.metadata.cost_usd || 0;
                totalCost += emailResult.metadata.cost_usd || 0;

                this.emit('email_drafted', { workflowId, email: savedEmail });
              }
            } catch (emailError) {
              console.error(`[Agent] Failed to draft email for ${contact.name}:`, emailError.message);
              await this.logWorkflowError(workflowId, 'email_generation', emailError.message);
            }

            // Delay between operations
            await this.delay(this.config.delayBetweenSearches / 2);
          }

          // Delay between jobs
          await this.delay(this.config.delayBetweenSearches);
        }

        // Update role completion progress
        await Workflow.findByIdAndUpdate(workflowId, {
          'progress.roles_completed': roleIndex + 1,
          'progress.total_jobs_found': allJobs.length,
          'progress.total_contacts_found': allContacts.length,
          'progress.total_emails_drafted': allEmails.length,
          total_cost_usd: totalCost,
          cost_breakdown: costBreakdown
        });

        // Delay between roles
        await this.delay(this.config.delayBetweenSearches * 2);
      }

      // ============================================
      // Step 3: Complete workflow
      // ============================================
      await Workflow.findByIdAndUpdate(workflowId, {
        status: 'completed',
        'progress.current_step': 'completed',
        jobs: allJobs.map(j => j._id),
        contacts: allContacts.map(c => c._id),
        emails: allEmails.map(e => e._id),
        total_cost_usd: totalCost,
        cost_breakdown: costBreakdown,
        completed_at: new Date()
      });

      console.log(`[Agent] Workflow ${workflowId} completed successfully`);
      console.log(`[Agent] Results: ${allJobs.length} jobs, ${allContacts.length} contacts, ${allEmails.length} emails`);
      console.log(`[Agent] Total cost: $${totalCost.toFixed(4)}`);

      this.emit('complete', {
        workflowId,
        summary: {
          jobs_found: allJobs.length,
          contacts_found: allContacts.length,
          emails_drafted: allEmails.length,
          total_cost_usd: totalCost,
          cost_breakdown: costBreakdown
        }
      });

      // Clean up active workflow
      this.activeWorkflows.delete(workflowId);

      return {
        success: true,
        workflowId,
        jobs: allJobs,
        contacts: allContacts,
        emails: allEmails,
        totalCost
      };

    } catch (error) {
      console.error(`[Agent] Workflow error:`, error);
      
      await Workflow.findByIdAndUpdate(workflowId, {
        status: 'failed',
        'progress.current_step': 'failed',
        $push: {
          errors: {
            step: 'workflow_execution',
            message: error.message,
            timestamp: new Date()
          }
        }
      });

      this.activeWorkflows.delete(workflowId);
      throw error;
    }
  }

  /**
   * Search for jobs matching a specific role
   */
  async searchJobsForRole(role, companies, locations, preferences, workflowId) {
    const jobs = [];
    let totalCost = 0;
    const searchLocations = locations.length > 0 ? locations : [null];
    const searchCompanies = companies.length > 0 ? companies : [null];

    // Search across all company/location combinations
    for (const company of searchCompanies) {
      for (const location of searchLocations) {
        try {
          const searchParams = {
            keywords: role,
            company: company,
            location: location,
            limit: preferences.maxJobsPerRole || this.config.maxJobsPerRole,
            workArrangement: preferences.workArrangement,
            seniorityLevel: preferences.seniorityLevel,
            datePosted: preferences.datePosted || 'past-week'
          };

        const result = await x402.executeWithQuoteSweep(
          'job_search',
          searchParams,
          this.config.jobSearchStrategy
        );

          if (result.success && result.result?.jobs) {
            jobs.push(...result.result.jobs);
            totalCost += result.receipt?.amount_paid_usd || 0;
          }

        } catch (error) {
          console.error(`[Agent] Job search error for ${role}${company ? ` at ${company}` : ''} in ${location}:`, error.message);
          await this.logWorkflowError(workflowId, 'job_search', error.message);
        }

        await this.delay(this.config.delayBetweenSearches);
      }
    }

    // Deduplicate jobs by job_id
    const uniqueJobs = this.deduplicateJobs(jobs);
    
    return {
      jobs: uniqueJobs.slice(0, preferences.maxJobsPerRole || this.config.maxJobsPerRole),
      cost: totalCost
    };
  }

  /**
   * Find relevant contacts for a job
   */
  async findContactsForJob(job, preferences, workflowId) {
    try {
      const searchParams = {
        company: job.company_name,
        role: job.title,
        numResults: preferences.maxContactsPerJob || this.config.maxContactsPerJob
      };

      const result = await x402.executeWithQuoteSweep(
        'people_search',
        searchParams,
        this.config.peopleSearchStrategy
      );

      if (result.success && result.result?.contacts) {
        return {
          contacts: result.result.contacts,
          cost: result.receipt?.amount_paid_usd || 0
        };
      }

      return { contacts: [], cost: 0 };

    } catch (error) {
      console.error(`[Agent] People search error for ${job.company_name}:`, error.message);
      await this.logWorkflowError(workflowId, 'people_search', error.message);
      return { contacts: [], cost: 0 };
    }
  }

  /**
   * Update workflow status
   */
  async updateWorkflowStatus(workflowId, status, currentStep, currentRole = null) {
    const update = {
      status,
      'progress.current_step': currentStep
    };
    
    if (currentRole) {
      update['progress.current_role'] = currentRole;
    }

    await Workflow.findByIdAndUpdate(workflowId, update);
    
    this.emit('progress', { workflowId, status, step: currentStep, role: currentRole });
  }

  /**
   * Log an error to the workflow
   */
  async logWorkflowError(workflowId, step, message) {
    await Workflow.findByIdAndUpdate(workflowId, {
      $push: {
        errors: { step, message, timestamp: new Date() }
      }
    });
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId) {
    const workflow = await Workflow.findById(workflowId)
      .populate('resume_id')
      .populate({
        path: 'jobs',
        options: { limit: 50 }
      })
      .populate({
        path: 'contacts',
        options: { limit: 50 }
      })
      .populate({
        path: 'emails',
        options: { limit: 50 }
      });

    if (!workflow) {
      return null;
    }

    return workflow;
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(workflowId) {
    const workflowState = this.activeWorkflows.get(workflowId);
    
    if (workflowState) {
      workflowState.aborted = true;
      await this.updateWorkflowStatus(workflowId, 'cancelled', 'Cancellation requested');
      return { success: true, message: 'Workflow cancellation requested' };
    }

    // Check if workflow exists but isn't active
    const workflow = await Workflow.findById(workflowId);
    if (workflow) {
      if (['completed', 'failed', 'cancelled'].includes(workflow.status)) {
        return { success: false, message: 'Workflow is already finished' };
      }
      
      await Workflow.findByIdAndUpdate(workflowId, { status: 'cancelled' });
      return { success: true, message: 'Workflow cancelled' };
    }

    return { success: false, message: 'Workflow not found' };
  }

  /**
   * List all workflows
   */
  async listWorkflows(options = {}) {
    const { limit = 20, skip = 0, status } = options;
    
    const filter = {};
    if (status) filter.status = status;

    const workflows = await Workflow.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('resume_id', 'name current_title');

    const total = await Workflow.countDocuments(filter);

    return { workflows, total };
  }

  /**
   * Deduplicate jobs by job_id
   */
  deduplicateJobs(jobs) {
    const seen = new Set();
    return jobs.filter(job => {
      const key = job.job_id || `${job.title}-${job.company_name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Helper delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let orchestratorInstance = null;

export function getOrchestrator(options) {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator(options);
  }
  return orchestratorInstance;
}

export default AgentOrchestrator;

