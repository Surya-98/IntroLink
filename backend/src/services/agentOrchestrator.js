import { EventEmitter } from 'events';
import { Resume, Workflow, Email, Job, Contact, Receipt } from '../models/schemas.js';
import { ResumeParserService } from './resumeParser.js';
import { EmailDrafterService } from './emailDrafter.js';
import { LinkedInDrafterService } from './linkedinDrafter.js';
import { TombaEnricher, MockTombaEnricher } from './tombaEnricher.js';
import { JobFinderTool, MockJobFinderTool } from './jobFinder.js';
import { PeopleFinderTool, MockPeopleFinderTool } from './peopleFinder.js';

/**
 * Agent Orchestrator - Coordinates the agentic job search workflow
 * 
 * Pipeline:
 * 1. Parse resume → extract skills, experience, etc.
 * 2. For each target role:
 *    a. Search for jobs matching the role
 *    b. For each job found:
 *       i.   Find relevant contacts (recruiters/hiring managers)
 *       ii.  Enrich contacts with email (Tomba)
 *       iii. Draft personalized messages IN PARALLEL:
 *            - Email
 *            - LinkedIn InMail
 *            - LinkedIn Connection Request
 * 3. Store all results in the database
 * 
 * The orchestrator emits events for progress tracking:
 * - 'progress' - workflow progress updates
 * - 'job_found' - new job found
 * - 'contact_found' - new contact found
 * - 'contact_enriched' - contact email found via Tomba
 * - 'email_drafted' - new email drafted (includes LinkedIn messages)
 * - 'error' - error occurred
 * - 'complete' - workflow completed
 */
export class AgentOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.resumeParser = new ResumeParserService();
    this.emailDrafter = new EmailDrafterService();
    this.linkedinDrafter = new LinkedInDrafterService();
    
    // Initialize providers
    this.initializeProviders();
    
    // Initialize Tomba email enricher
    this.initializeEnricher();
    
    // Default configuration
    this.config = {
      maxJobsPerRole: options.maxJobsPerRole || 10,
      maxContactsPerJob: options.maxContactsPerJob || 3,
      delayBetweenSearches: options.delayBetweenSearches || 1000, // ms
      enableEmailEnrichment: options.enableEmailEnrichment !== false, // enabled by default
      ...options
    };

    // Active workflows being processed
    this.activeWorkflows = new Map();

    // Add default error handler to prevent unhandled error crashes
    this.on('error', (data) => {
      console.error('[AgentOrchestrator] Error event:', data);
    });
  }

  /**
   * Initialize job and people finder providers
   */
  initializeProviders() {
    const apifyToken = process.env.APIFY_TOKEN;

    if (apifyToken) {
      this.jobFinder = new JobFinderTool(apifyToken);
      this.peopleFinder = new PeopleFinderTool(apifyToken);
      console.log('[Agent] Using real Apify providers');
    } else {
      this.jobFinder = new MockJobFinderTool();
      this.peopleFinder = new MockPeopleFinderTool();
      console.log('[Agent] Using mock providers (no APIFY_TOKEN)');
    }
  }

  /**
   * Initialize the Tomba email enricher
   */
  initializeEnricher() {
    const tombaKey = process.env.TOMBA_API_KEY;
    const tombaSecret = process.env.TOMBA_API_SECRET;

    if (tombaKey && tombaSecret) {
      this.emailEnricher = new TombaEnricher(tombaKey, tombaSecret);
      this.enricherType = 'tomba';
      console.log('[Agent] Using Tomba for email enrichment');
    } else {
      this.emailEnricher = new MockTombaEnricher();
      this.enricherType = 'mock';
      console.log('[Agent] No Tomba credentials found - using mock enricher');
    }
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
      // Step 1: Store Resume (skip parsing, use raw text)
      // ============================================
      await this.updateWorkflowStatus(workflowId, 'parsing_resume', 'Processing resume...');
      
      // Save resume with raw text only - no parsing needed
      const resume = await Resume.create({
        raw_text: resumeText,
        name: 'Job Seeker', // Placeholder - email drafter will use raw text
        skills: [],
        experience: [],
        education: []
      });

      // Link resume to workflow
      await Workflow.findByIdAndUpdate(workflowId, {
        resume_id: resume._id
      });

      console.log(`[Agent] Resume stored (using raw text for email drafting)`);
      this.emit('progress', { 
        workflowId, 
        step: 'resume_parsed', 
        data: { message: 'Resume stored successfully' }
      });

      // ============================================
      // Step 2: For each role, search jobs and contacts
      // ============================================
      const allJobs = [];
      const allContacts = [];
      const allEmails = [];
      let totalCost = 0;
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

          // Update progress immediately after job is saved
          await Workflow.findByIdAndUpdate(workflowId, {
            'progress.total_jobs_found': allJobs.length,
            total_cost_usd: totalCost,
            cost_breakdown: costBreakdown
          });

          this.emit('job_found', { workflowId, job: savedJob });
          console.log(`[Agent] Job ${allJobs.length} saved: ${savedJob.title} at ${savedJob.company_name}`);

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
            let savedContact = await Contact.create(contact);
            allContacts.push(savedContact);

            // Update progress immediately after contact is saved
            await Workflow.findByIdAndUpdate(workflowId, {
              'progress.total_contacts_found': allContacts.length,
              total_cost_usd: totalCost,
              cost_breakdown: costBreakdown
            });

            this.emit('contact_found', { workflowId, contact: savedContact });
            console.log(`[Agent] Contact ${allContacts.length} saved: ${savedContact.name}`);

            // ----------------------------------------
            // Step 2c: Enrich contact with email (Tomba) - requires LinkedIn URL
            // ----------------------------------------
            if (this.config.enableEmailEnrichment && !savedContact.email && savedContact.linkedin_url) {
              await this.updateWorkflowStatus(
                workflowId,
                'enriching_contact',
                `Finding email for ${contact.name} at ${contact.company}`
              );

              try {
                const enrichedContact = await this.enrichContactWithEmail(savedContact);
                
                if (enrichedContact.email) {
                  // Update contact in database with email
                  savedContact = await Contact.findByIdAndUpdate(
                    savedContact._id,
                    { 
                      email: enrichedContact.email,
                      email_confidence: enrichedContact.email_confidence,
                      email_source: enrichedContact.email_source
                    },
                    { new: true }
                  );
                  
                  // Track enrichment cost
                  costBreakdown.email_enrichment = (costBreakdown.email_enrichment || 0) + 0.01; // ~$0.01 per lookup
                  totalCost += 0.01;
                  
                  console.log(`[Agent] Found email for ${savedContact.name}: ${savedContact.email}`);
                  this.emit('contact_enriched', { workflowId, contact: savedContact });
                } else {
                  console.log(`[Agent] No email found for ${savedContact.name}`);
                }
              } catch (enrichError) {
                console.error(`[Agent] Email enrichment failed for ${contact.name}:`, enrichError.message);
                await this.logWorkflowError(workflowId, 'email_enrichment', enrichError.message);
              }
            } else if (!savedContact.linkedin_url && !savedContact.email) {
              console.log(`[Agent] No LinkedIn URL for ${savedContact.name} - no email found`);
            }

            // ----------------------------------------
            // Step 2d: Draft ALL messages in PARALLEL
            // - Email
            // - LinkedIn InMail
            // - LinkedIn Connection Request
            // ----------------------------------------
            await this.updateWorkflowStatus(
              workflowId, 
              'drafting_emails', 
              `Drafting messages for ${contact.name} at ${contact.company}`
            );

            try {
              const draftParams = {
                resumeText: resumeText,
                job: savedJob,
                contact: savedContact
              };

              // Run all three drafters in parallel for maximum efficiency
              console.log(`[Agent] Drafting Email + LinkedIn messages in parallel for ${savedContact.name}...`);
              
              const [emailResult, linkedinResult] = await Promise.all([
                this.emailDrafter.generateEmail(draftParams),
                this.linkedinDrafter.generateAll(draftParams)
              ]);

              // Calculate total generation cost
              let generationCost = 0;
              let linkedinCost = 0;

              if (emailResult.success) {
                generationCost += emailResult.metadata?.cost_usd || 0;
              }
              if (linkedinResult.inmail?.success) {
                linkedinCost += linkedinResult.inmail.metadata?.cost_usd || 0;
              }
              if (linkedinResult.connectionRequest?.success) {
                linkedinCost += linkedinResult.connectionRequest.metadata?.cost_usd || 0;
              }

              // Create email record with all message types
              const emailData = {
                workflow_id: workflowId,
                job_id: savedJob._id,
                contact_id: savedContact._id,
                recipient_name: savedContact.name,
                recipient_email: savedContact.email,
                recipient_title: savedContact.title,
                recipient_company: savedContact.company,
                job_context: {
                  title: savedJob.title,
                  company: savedJob.company_name,
                  description_snippet: savedJob.description_snippet
                },
                resume_context: {
                  raw_text_preview: resumeText.substring(0, 500)
                }
              };

              // Add email content if successful
              if (emailResult.success) {
                emailData.subject = emailResult.subject;
                emailData.body = emailResult.body;
                emailData.model_used = emailResult.metadata.model;
                emailData.prompt_tokens = emailResult.metadata.prompt_tokens;
                emailData.completion_tokens = emailResult.metadata.completion_tokens;
              }

              // Add LinkedIn InMail content if successful
              if (linkedinResult.inmail?.success) {
                emailData.linkedin_inmail = {
                  subject: linkedinResult.inmail.subject,
                  body: linkedinResult.inmail.body,
                  character_count: linkedinResult.inmail.characterCount
                };
              }

              // Add LinkedIn Connection Request content if successful
              if (linkedinResult.connectionRequest?.success) {
                emailData.linkedin_connection_request = {
                  message: linkedinResult.connectionRequest.message,
                  character_count: linkedinResult.connectionRequest.characterCount
                };
              }

              // Set total generation cost
              emailData.generation_cost_usd = generationCost + linkedinCost;

              const savedEmail = await Email.create(emailData);

              allEmails.push(savedEmail);
              costBreakdown.email_generation += generationCost;
              costBreakdown.linkedin_generation = (costBreakdown.linkedin_generation || 0) + linkedinCost;
              totalCost += generationCost + linkedinCost;

              // Update progress immediately after all messages are drafted
              await Workflow.findByIdAndUpdate(workflowId, {
                'progress.total_emails_drafted': allEmails.length,
                total_cost_usd: totalCost,
                cost_breakdown: costBreakdown
              });

              this.emit('email_drafted', { workflowId, email: savedEmail });
              
              // Log what was generated
              const generated = [];
              if (emailResult.success) generated.push('Email');
              if (linkedinResult.inmail?.success) generated.push('InMail');
              if (linkedinResult.connectionRequest?.success) generated.push('Connection Request');
              console.log(`[Agent] Messages drafted for ${savedContact.name}: ${generated.join(', ')}`);

            } catch (emailError) {
              console.error(`[Agent] Failed to draft messages for ${contact.name}:`, emailError.message);
              await this.logWorkflowError(workflowId, 'message_generation', emailError.message);
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

          const result = await this.jobFinder.execute(searchParams);
          const quote = await this.jobFinder.getQuote(searchParams);

          if (result?.jobs) {
            jobs.push(...result.jobs);
            totalCost += quote.price_usd || 0;
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

      const result = await this.peopleFinder.execute(searchParams);
      const quote = await this.peopleFinder.getQuote(searchParams);

      if (result?.contacts) {
        return {
          contacts: result.contacts,
          cost: quote.price_usd || 0
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
   * Enrich a contact with email address using Tomba (LinkedIn URL required)
   */
  async enrichContactWithEmail(contact) {
    if (!this.emailEnricher) {
      return contact;
    }

    // Only lookup email if LinkedIn URL is available
    if (!contact.linkedin_url) {
      console.log(`[Agent] No LinkedIn URL for ${contact.name} - skipping email lookup`);
      return contact;
    }

    console.log(`[Agent] Looking up email via LinkedIn: ${contact.linkedin_url}`);
    const result = await this.emailEnricher.findEmailByLinkedIn(contact.linkedin_url);
    
    if (result.success && result.email) {
      return {
        ...contact.toObject ? contact.toObject() : contact,
        email: result.email,
        email_confidence: result.confidence,
        email_source: 'tomba'
      };
    }

    console.log(`[Agent] No email found for ${contact.name}`);
    return contact;
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

