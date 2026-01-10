import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { x402 } from './services/x402Protocol.js';
import { PeopleFinderTool, MockPeopleFinderTool } from './services/peopleFinder.js';
import { JobFinderTool, MockJobFinderTool } from './services/jobFinder.js';
import { HappenstanceEnricher, MockHappenstanceEnricher } from './services/happenstanceEnricher.js';
import { getOrchestrator } from './services/agentOrchestrator.js';
import { Offer, Receipt, Contact, Job, Workflow, Email, Resume } from './models/schemas.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for resume uploads

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const HAPPENSTANCE_API_KEY = process.env.HAPPENSTANCE_API_KEY;

// Global enricher instance for reuse
let happenstanceEnricher = null;

// Validate required environment variables
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required. Please set it in your .env file.');
  console.error('   Get your MongoDB Atlas connection string from: https://cloud.mongodb.com');
  process.exit(1);
}

// Initialize tools
const initializeTools = () => {
  // Register real Apify-based People Finder if token available
  if (APIFY_TOKEN) {
    const realPeopleFinder = new PeopleFinderTool(APIFY_TOKEN);
    x402.registerProvider('people-finder-exa', realPeopleFinder);
    console.log('✓ Registered real People Finder (Apify Exa)');
    
    // Register real LinkedIn Job Finder
    const realJobFinder = new JobFinderTool(APIFY_TOKEN);
    x402.registerProvider('job-finder-linkedin', realJobFinder);
    console.log('✓ Registered real LinkedIn Job Finder (Apify)');
  }
  
  // Always register mock provider for testing/comparison
  const mockPeopleFinder = new MockPeopleFinderTool();
  x402.registerProvider('people-finder-mock', mockPeopleFinder);
  console.log('✓ Registered mock People Finder');
  
  const mockJobFinder = new MockJobFinderTool();
  x402.registerProvider('job-finder-mock', mockJobFinder);
  console.log('✓ Registered mock Job Finder');

  // Register Happenstance enricher for person data enrichment
  if (HAPPENSTANCE_API_KEY) {
    happenstanceEnricher = new HappenstanceEnricher(HAPPENSTANCE_API_KEY);
    x402.registerProvider('happenstance-enricher', happenstanceEnricher);
    console.log('✓ Registered Happenstance Enricher (real API)');
  } else {
    happenstanceEnricher = new MockHappenstanceEnricher();
    x402.registerProvider('happenstance-enricher-mock', happenstanceEnricher);
    console.log('✓ Registered mock Happenstance Enricher');
  }
};

// ============================================
// API Routes
// ============================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get quote for people search (402 Payment Required simulation)
 */
app.post('/api/people-finder/quote', async (req, res) => {
  try {
    const { query, company, role, numResults = 5, provider = 'people-finder-exa' } = req.body;

    const quote = await x402.requestQuote(provider, {
      query,
      company,
      role,
      numResults
    });

    // Return 402 Payment Required with quote info
    res.status(402).json({
      message: 'Payment Required',
      quote
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sweep quotes from all people search providers
 */
app.post('/api/people-finder/sweep', async (req, res) => {
  try {
    const { query, company, role, numResults = 5 } = req.body;

    const quotes = await x402.sweepQuotes('people_search', {
      query,
      company,
      role,
      numResults
    });

    res.json({
      message: 'Quotes collected',
      total_providers: quotes.length,
      quotes: quotes.map(q => ({
        offer_id: q.offer_id,
        provider: q.provider,
        price_usd: q.price_usd,
        latency_estimate_ms: q.latency_estimate_ms,
        reliability_score: q.reliability_score,
        x402_headers: q.x402_response.headers
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Pay for an offer and execute
 */
app.post('/api/pay/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;
    
    const result = await x402.payAndExecute(offerId);

    res.json({
      message: 'Payment successful',
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * Full flow: sweep quotes, pay best, execute
 * Optionally enrich contacts with Happenstance for email/personal info
 */
app.post('/api/people-finder/search', async (req, res) => {
  try {
    const { 
      query, 
      company, 
      role, 
      numResults = 5,
      strategy = 'cheapest', // cheapest, fastest, reliable, balanced
      enrichContacts = false // Set to true to enrich with Happenstance
    } = req.body;

    console.log(`[API] People search request: company="${company}", role="${role}", query="${query}", enrich=${enrichContacts}`);

    // Validate input
    if (!query && !company) {
      return res.status(400).json({ error: 'Please provide either a company name or a search query' });
    }

    const result = await x402.executeWithQuoteSweep(
      'people_search',
      { query, company, role, numResults },
      strategy
    );

    console.log(`[API] Search completed successfully. Found ${result.result?.contacts?.length || 0} contacts`);

    let contacts = result.result?.contacts || [];
    let enrichmentStats = null;

    // Enrich contacts with Happenstance if requested
    if (enrichContacts && contacts.length > 0 && happenstanceEnricher) {
      console.log(`[API] Enriching ${contacts.length} contacts with Happenstance...`);
      try {
        contacts = await happenstanceEnricher.enrichContacts(contacts, { parallel: true });
        enrichmentStats = {
          total: contacts.length,
          emails_found: contacts.filter(c => c.email).length,
          phones_found: contacts.filter(c => c.phone).length,
          enrichment_source: happenstanceEnricher.providerName
        };
        console.log(`[API] Enrichment complete. Emails found: ${enrichmentStats.emails_found}`);
      } catch (enrichError) {
        console.error('[API] Enrichment failed (continuing with unenriched contacts):', enrichError.message);
      }
    }

    // Save contacts to database
    if (result.success && contacts.length > 0) {
      const costPerContact = result.receipt.amount_paid_usd / contacts.length;
      
      for (const contact of contacts) {
        try {
          await Contact.create({
            ...contact,
            source: result.receipt.provider,
            search_query: result.result.query,
            cost_usd: costPerContact,
            receipt_id: result.receipt.id
          });
        } catch (dbError) {
          console.error('[API] Failed to save contact:', dbError.message);
        }
      }
    }

    res.json({
      message: 'Search completed',
      contacts,
      enrichment: enrichmentStats,
      receipt: result.receipt,
      quote_sweep: result.quote_sweep,
      provenance: contacts.map(c => ({
        contact: c.name,
        data_source: result.receipt.provider,
        cost_usd: result.receipt.amount_paid_usd / (contacts.length || 1),
        query_used: result.result.query,
        enrichment_source: c.enrichment_source || null,
        email_found: !!c.email
      }))
    });
  } catch (error) {
    console.error('[API] Search error:', error.message);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'An unexpected error occurred' });
  }
});

// ============================================
// Job Finder Routes (LinkedIn Job Search)
// ============================================

/**
 * Get quote for job search (402 Payment Required simulation)
 */
app.post('/api/job-finder/quote', async (req, res) => {
  try {
    const { 
      keywords, 
      location, 
      company,
      workArrangement,
      seniorityLevel,
      employmentType,
      easyApplyOnly,
      datePosted,
      limit = 25,
      provider = 'job-finder-linkedin'
    } = req.body;

    const quote = await x402.requestQuote(provider, {
      keywords,
      location,
      company,
      workArrangement,
      seniorityLevel,
      employmentType,
      easyApplyOnly,
      datePosted,
      limit
    });

    res.status(402).json({
      message: 'Payment Required',
      quote
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sweep quotes from all job search providers
 */
app.post('/api/job-finder/sweep', async (req, res) => {
  try {
    const { 
      keywords, 
      location, 
      company,
      workArrangement,
      seniorityLevel,
      limit = 25
    } = req.body;

    const quotes = await x402.sweepQuotes('job_search', {
      keywords,
      location,
      company,
      workArrangement,
      seniorityLevel,
      limit
    });

    res.json({
      message: 'Quotes collected',
      total_providers: quotes.length,
      quotes: quotes.map(q => ({
        offer_id: q.offer_id,
        provider: q.provider,
        price_usd: q.price_usd,
        latency_estimate_ms: q.latency_estimate_ms,
        reliability_score: q.reliability_score,
        x402_headers: q.x402_response.headers
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Full job search flow: sweep quotes, pay best, execute
 */
app.post('/api/job-finder/search', async (req, res) => {
  try {
    const { 
      keywords, 
      location, 
      company,
      workArrangement,
      seniorityLevel,
      employmentType,
      easyApplyOnly,
      datePosted,
      limit = 25,
      strategy = 'cheapest' // cheapest, fastest, reliable, balanced
    } = req.body;

    console.log(`[API] Job search request: keywords="${keywords}", location="${location}"`);

    const result = await x402.executeWithQuoteSweep(
      'job_search',
      { 
        keywords, 
        location, 
        company, 
        workArrangement,
        seniorityLevel,
        employmentType,
        easyApplyOnly,
        datePosted,
        limit 
      },
      strategy
    );

    // Save jobs to database
    if (result.success && result.result.jobs) {
      const costPerJob = result.receipt.amount_paid_usd / result.result.jobs.length;
      
      for (const job of result.result.jobs) {
        await Job.create({
          ...job,
          source: result.receipt.provider,
          cost_usd: costPerJob,
          receipt_id: result.receipt.id
        });
      }
    }

    res.json({
      message: 'Job search completed',
      jobs: result.result.jobs,
      total_found: result.result.jobs?.length || 0,
      receipt: result.receipt,
      quote_sweep: result.quote_sweep,
      search_params: result.result.searchParams
    });
  } catch (error) {
    console.error('[API] Job search error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all saved jobs
 */
app.get('/api/jobs', async (req, res) => {
  try {
    const { 
      keywords, 
      location, 
      company, 
      workArrangement,
      limit = 100 
    } = req.query;

    const filter = {};
    if (keywords) filter.search_keywords = new RegExp(keywords, 'i');
    if (location) filter.location = new RegExp(location, 'i');
    if (company) filter.company_name = new RegExp(company, 'i');
    if (workArrangement) filter.work_arrangement = workArrangement;

    const jobs = await Job.find(filter)
      .sort({ created_at: -1 })
      .limit(parseInt(limit));
    
    res.json({ 
      jobs,
      total: jobs.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get job by ID with cost provenance
 */
app.get('/api/jobs/:id/provenance', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id).populate('receipt_id');
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      job,
      provenance: {
        source: job.source,
        cost_usd: job.cost_usd,
        search_keywords: job.search_keywords,
        receipt: job.receipt_id ? {
          transaction_id: job.receipt_id.transaction_id,
          total_paid: job.receipt_id.amount_paid_usd,
          provider: job.receipt_id.provider,
          timestamp: job.receipt_id.created_at
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all offers (including rejected)
 */
app.get('/api/offers', async (req, res) => {
  try {
    const offers = await Offer.find().sort({ created_at: -1 }).limit(50);
    res.json({ offers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all receipts
 */
app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await Receipt.find().sort({ created_at: -1 }).limit(50);
    res.json({ receipts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all contacts
 */
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ created_at: -1 }).limit(100);
    res.json({ contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get contact with cost provenance
 */
app.get('/api/contacts/:id/provenance', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id).populate('receipt_id');
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      contact,
      provenance: {
        source: contact.source,
        cost_usd: contact.cost_usd,
        search_query: contact.search_query,
        receipt: contact.receipt_id ? {
          transaction_id: contact.receipt_id.transaction_id,
          total_paid: contact.receipt_id.amount_paid_usd,
          provider: contact.receipt_id.provider,
          timestamp: contact.receipt_id.created_at
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Happenstance Enrichment Routes
// ============================================

/**
 * Get quote for enriching contacts with Happenstance
 */
app.post('/api/enrich/quote', async (req, res) => {
  try {
    const { contacts } = req.body;
    
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of contacts to enrich' });
    }

    const quote = await happenstanceEnricher.getQuote({ contacts });

    res.status(402).json({
      message: 'Payment Required',
      quote
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Enrich a single contact with email and personal info
 */
app.post('/api/enrich/contact', async (req, res) => {
  try {
    const { contact, name, company, linkedinUrl } = req.body;

    // Build contact object from individual fields if not provided as object
    const contactToEnrich = contact || {
      name: name,
      company: company,
      linkedin_url: linkedinUrl
    };

    if (!contactToEnrich.name && !contactToEnrich.linkedin_url) {
      return res.status(400).json({ 
        error: 'Please provide either a contact object, name, or LinkedIn URL' 
      });
    }

    console.log(`[API] Enriching contact: ${contactToEnrich.name || contactToEnrich.linkedin_url}`);

    const enrichedContact = await happenstanceEnricher.enrichContact(contactToEnrich);

    // If contact has an ID, update in database
    if (contact && contact._id) {
      try {
        await Contact.findByIdAndUpdate(contact._id, {
          email: enrichedContact.email,
          phone: enrichedContact.phone,
          location: enrichedContact.location,
          enrichment_source: enrichedContact.enrichment_source,
          enrichment_timestamp: enrichedContact.enrichment_timestamp,
          additional_emails: enrichedContact.additional_emails,
          social_profiles: enrichedContact.social_profiles
        });
      } catch (dbError) {
        console.error('[API] Failed to update contact in DB:', dbError.message);
      }
    }

    res.json({
      message: 'Contact enriched successfully',
      contact: enrichedContact,
      enrichment: {
        email_found: !!enrichedContact.email,
        phone_found: !!enrichedContact.phone,
        source: enrichedContact.enrichment_source
      }
    });
  } catch (error) {
    console.error('[API] Enrichment error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Enrich multiple contacts in batch
 */
app.post('/api/enrich/batch', async (req, res) => {
  try {
    const { contacts, parallel = false } = req.body;

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of contacts to enrich' });
    }

    console.log(`[API] Batch enriching ${contacts.length} contacts`);

    const enrichedContacts = await happenstanceEnricher.enrichContacts(contacts, { parallel });

    // Update contacts in database
    for (const enriched of enrichedContacts) {
      if (enriched._id) {
        try {
          await Contact.findByIdAndUpdate(enriched._id, {
            email: enriched.email,
            phone: enriched.phone,
            location: enriched.location,
            enrichment_source: enriched.enrichment_source,
            enrichment_timestamp: enriched.enrichment_timestamp
          });
        } catch (dbError) {
          console.error('[API] Failed to update contact:', dbError.message);
        }
      }
    }

    const stats = {
      total: enrichedContacts.length,
      emails_found: enrichedContacts.filter(c => c.email).length,
      phones_found: enrichedContacts.filter(c => c.phone).length,
      failed: enrichedContacts.filter(c => c.enrichment_error).length
    };

    res.json({
      message: 'Batch enrichment completed',
      contacts: enrichedContacts,
      stats
    });
  } catch (error) {
    console.error('[API] Batch enrichment error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lookup person by LinkedIn URL
 */
app.post('/api/enrich/linkedin', async (req, res) => {
  try {
    const { linkedinUrl } = req.body;

    if (!linkedinUrl) {
      return res.status(400).json({ error: 'LinkedIn URL is required' });
    }

    console.log(`[API] LinkedIn lookup: ${linkedinUrl}`);

    const result = await happenstanceEnricher.lookupByLinkedIn(linkedinUrl);

    res.json({
      message: 'LinkedIn lookup completed',
      linkedin_url: linkedinUrl,
      ...result
    });
  } catch (error) {
    console.error('[API] LinkedIn lookup error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lookup person by name and company
 */
app.post('/api/enrich/lookup', async (req, res) => {
  try {
    const { name, company } = req.body;

    if (!name || !company) {
      return res.status(400).json({ error: 'Both name and company are required' });
    }

    console.log(`[API] Person lookup: ${name} at ${company}`);

    const result = await happenstanceEnricher.lookupByNameAndCompany(name, company);

    res.json({
      message: 'Person lookup completed',
      name,
      company,
      ...result
    });
  } catch (error) {
    console.error('[API] Person lookup error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Agentic Workflow Routes
// ============================================

/**
 * Start a new agentic workflow
 * 
 * This endpoint kicks off the full pipeline:
 * 1. Parse resume
 * 2. Search jobs for each target role
 * 3. Find contacts for each job
 * 4. Draft personalized emails for each contact
 */
app.post('/api/agent/start', async (req, res) => {
  try {
    const {
      resumeText,
      targetRoles,
      targetCompanies,
      targetLocations,
      preferences
    } = req.body;

    // Validate required fields
    if (!resumeText) {
      return res.status(400).json({ error: 'Resume text is required' });
    }

    if (!targetRoles || !Array.isArray(targetRoles) || targetRoles.length === 0) {
      return res.status(400).json({ error: 'At least one target role is required' });
    }

    // Check if Fireworks API key is configured
    if (!process.env.FIREWORKS_API_KEY) {
      return res.status(500).json({ 
        error: 'Fireworks API key not configured. Set FIREWORKS_API_KEY in your .env file.' 
      });
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.startWorkflow({
      resumeText,
      targetRoles,
      targetCompanies: targetCompanies || [],
      targetLocations: targetLocations || [],
      preferences: preferences || {}
    });

    res.json({
      message: 'Workflow started successfully',
      ...result
    });
  } catch (error) {
    console.error('[API] Agent start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get workflow status and results
 */
app.get('/api/agent/status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const orchestrator = getOrchestrator();
    
    const workflow = await orchestrator.getWorkflowStatus(workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({
      workflow: {
        id: workflow._id,
        status: workflow.status,
        target_roles: workflow.target_roles,
        target_locations: workflow.target_locations,
        preferences: workflow.preferences,
        progress: workflow.progress,
        total_cost_usd: workflow.total_cost_usd,
        cost_breakdown: workflow.cost_breakdown,
        errors: workflow.errors,
        started_at: workflow.started_at,
        completed_at: workflow.completed_at
      },
      resume: workflow.resume_id ? {
        name: workflow.resume_id.name,
        current_title: workflow.resume_id.current_title,
        current_company: workflow.resume_id.current_company,
        skills: workflow.resume_id.skills?.slice(0, 10)
      } : null,
      summary: {
        jobs_count: workflow.jobs?.length || workflow.progress?.total_jobs_found || 0,
        contacts_count: workflow.contacts?.length || workflow.progress?.total_contacts_found || 0,
        emails_count: workflow.emails?.length || workflow.progress?.total_emails_drafted || 0
      }
    });
  } catch (error) {
    console.error('[API] Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get full workflow results including jobs, contacts, and emails
 */
app.get('/api/agent/results/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const workflow = await Workflow.findById(workflowId)
      .populate('resume_id');
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Get all related data
    const [jobs, contacts, emails] = await Promise.all([
      Job.find({ workflow_id: workflowId }).sort({ created_at: -1 }),
      Contact.find({ workflow_id: workflowId }).sort({ created_at: -1 }),
      Email.find({ workflow_id: workflowId }).sort({ created_at: -1 })
    ]);

    res.json({
      workflow: {
        id: workflow._id,
        status: workflow.status,
        target_roles: workflow.target_roles,
        progress: workflow.progress,
        total_cost_usd: workflow.total_cost_usd,
        cost_breakdown: workflow.cost_breakdown
      },
      resume: workflow.resume_id,
      jobs,
      contacts,
      emails,
      stats: {
        total_jobs: jobs.length,
        total_contacts: contacts.length,
        total_emails: emails.length,
        unique_companies: [...new Set(jobs.map(j => j.company_name))].length
      }
    });
  } catch (error) {
    console.error('[API] Results error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel a running workflow
 */
app.post('/api/agent/cancel/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const orchestrator = getOrchestrator();
    
    const result = await orchestrator.cancelWorkflow(workflowId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all workflows
 */
app.get('/api/agent/workflows', async (req, res) => {
  try {
    const { limit = 20, skip = 0, status } = req.query;
    const orchestrator = getOrchestrator();
    
    const result = await orchestrator.listWorkflows({
      limit: parseInt(limit),
      skip: parseInt(skip),
      status
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all emails for a workflow
 */
app.get('/api/agent/emails/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const emails = await Email.find({ workflow_id: workflowId })
      .populate('job_id', 'title company_name location')
      .populate('contact_id', 'name title company linkedin_url')
      .sort({ created_at: -1 });

    res.json({
      total: emails.length,
      emails
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update email status (e.g., mark as sent)
 */
app.patch('/api/agent/emails/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const { status } = req.body;

    const validStatuses = ['draft', 'reviewed', 'sent', 'responded'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const update = { status };
    if (status === 'sent') {
      update.sent_at = new Date();
    }

    const email = await Email.findByIdAndUpdate(emailId, update, { new: true });
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json({ email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all saved resumes
 */
app.get('/api/resumes', async (req, res) => {
  try {
    const resumes = await Resume.find()
      .select('name current_title current_company skills years_of_experience created_at')
      .sort({ created_at: -1 })
      .limit(50);
    
    res.json({ resumes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get a specific resume by ID
 */
app.get('/api/resumes/:id', async (req, res) => {
  try {
    const resume = await Resume.findById(req.params.id);
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    res.json({ resume });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Start Server
// ============================================

const startServer = async () => {
  try {
    // Connect to MongoDB (works with both local and Atlas)
    await mongoose.connect(MONGODB_URI, {
      // These options work well with MongoDB Atlas
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✓ Connected to MongoDB');

    // Initialize tools
    initializeTools();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 IntroLink API running on http://localhost:${PORT}`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`\n   🤖 Agentic Workflow:`);
      console.log(`   POST /api/agent/start              - Start new workflow (resume + roles)`);
      console.log(`   GET  /api/agent/status/:id         - Get workflow status`);
      console.log(`   GET  /api/agent/results/:id        - Get full results (jobs, contacts, emails)`);
      console.log(`   POST /api/agent/cancel/:id         - Cancel running workflow`);
      console.log(`   GET  /api/agent/workflows          - List all workflows`);
      console.log(`   GET  /api/agent/emails/:workflowId - Get emails for workflow`);
      console.log(`   PATCH /api/agent/emails/:emailId   - Update email status`);
      console.log(`\n   People Finder:`);
      console.log(`   POST /api/people-finder/quote   - Get a quote (402)`);
      console.log(`   POST /api/people-finder/sweep   - Sweep quotes from all providers`);
      console.log(`   POST /api/people-finder/search  - Full flow with quote sweep`);
      console.log(`\n   Job Finder (LinkedIn):`);
      console.log(`   POST /api/job-finder/quote      - Get a job search quote (402)`);
      console.log(`   POST /api/job-finder/sweep      - Sweep quotes from job providers`);
      console.log(`   POST /api/job-finder/search     - Full job search flow`);
      console.log(`   GET  /api/jobs                  - List saved jobs (with filters)`);
      console.log(`   GET  /api/jobs/:id/provenance   - Get job with cost provenance`);
      console.log(`\n   Person Enrichment (Happenstance):`);
      console.log(`   POST /api/enrich/quote          - Get enrichment quote (402)`);
      console.log(`   POST /api/enrich/contact        - Enrich single contact with email/info`);
      console.log(`   POST /api/enrich/batch          - Enrich multiple contacts`);
      console.log(`   POST /api/enrich/linkedin       - Lookup by LinkedIn URL`);
      console.log(`   POST /api/enrich/lookup         - Lookup by name and company`);
      console.log(`\n   General:`);
      console.log(`   POST /api/pay/:offerId          - Pay and execute`);
      console.log(`   GET  /api/offers                - List all offers`);
      console.log(`   GET  /api/receipts              - List all receipts`);
      console.log(`   GET  /api/contacts              - List all contacts`);
      console.log(`   GET  /api/resumes               - List all resumes`);
      console.log(`\n💡 Set APIFY_TOKEN, FIREWORKS_API_KEY, and HAPPENSTANCE_API_KEY env vars for full functionality`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
