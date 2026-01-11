import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';
import { PeopleFinderTool, MockPeopleFinderTool } from './services/peopleFinder.js';
import { JobFinderTool, MockJobFinderTool } from './services/jobFinder.js';
import { HappenstanceEnricher, MockHappenstanceEnricher } from './services/happenstanceEnricher.js';
import { TombaEnricher, MockTombaEnricher } from './services/tombaEnricher.js';
import { EmailSenderService, MockEmailSenderService } from './services/emailSender.js';
import { getOrchestrator } from './services/agentOrchestrator.js';
import { Receipt, Contact, Job, Workflow, Email, Resume } from './models/schemas.js';

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
    }
  }
});

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for resume uploads

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const HAPPENSTANCE_API_KEY = process.env.HAPPENSTANCE_API_KEY;
const TOMBA_API_KEY = process.env.TOMBA_API_KEY;
const TOMBA_API_SECRET = process.env.TOMBA_API_SECRET;

// Global service instances for reuse
let peopleFinder = null;
let jobFinder = null;
let happenstanceEnricher = null;
let tombaEnricher = null;
let emailSender = null;

// Validate required environment variables
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required. Please set it in your .env file.');
  console.error('   Get your MongoDB Atlas connection string from: https://cloud.mongodb.com');
  process.exit(1);
}

// Initialize tools
const initializeTools = () => {
  // Initialize People Finder
  if (APIFY_TOKEN) {
    peopleFinder = new PeopleFinderTool(APIFY_TOKEN);
    console.log('✓ Initialized People Finder (Apify Exa)');
    
    // Initialize LinkedIn Job Finder
    jobFinder = new JobFinderTool(APIFY_TOKEN);
    console.log('✓ Initialized LinkedIn Job Finder (Apify)');
  } else {
    peopleFinder = new MockPeopleFinderTool();
    console.log('✓ Initialized mock People Finder');
    
    jobFinder = new MockJobFinderTool();
    console.log('✓ Initialized mock Job Finder');
  }

  // Initialize Happenstance enricher for person data enrichment
  if (HAPPENSTANCE_API_KEY) {
    happenstanceEnricher = new HappenstanceEnricher(HAPPENSTANCE_API_KEY);
    console.log('✓ Initialized Happenstance Enricher (real API)');
  } else {
    happenstanceEnricher = new MockHappenstanceEnricher();
    console.log('✓ Initialized mock Happenstance Enricher');
  }

  // Initialize Tomba enricher for LinkedIn email lookup
  if (TOMBA_API_KEY && TOMBA_API_SECRET) {
    tombaEnricher = new TombaEnricher(TOMBA_API_KEY, TOMBA_API_SECRET);
    console.log('✓ Initialized Tomba Enricher (real API)');
  } else {
    tombaEnricher = new MockTombaEnricher();
    console.log('✓ Initialized mock Tomba Enricher');
  }

  // Initialize email sender service
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    emailSender = new EmailSenderService();
    console.log('✓ Email Sender configured (SMTP)');
  } else {
    emailSender = new MockEmailSenderService();
    console.log('✓ Using mock Email Sender (SMTP not configured)');
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
 * Quick stats endpoint for dashboard - uses countDocuments for speed
 */
app.get('/api/stats', async (req, res) => {
  try {
    const [jobsCount, contactsCount, receiptsCount, workflowsCount, totalSpentResult] = await Promise.all([
      Job.countDocuments(),
      Contact.countDocuments(),
      Receipt.countDocuments(),
      Workflow.countDocuments(),
      Receipt.aggregate([{ $group: { _id: null, total: { $sum: '$amount_paid_usd' } } }])
    ]);

    const totalSpent = totalSpentResult[0]?.total || 0;

    res.json({
      jobs: jobsCount,
      contacts: contactsCount,
      receipts: receiptsCount,
      workflows: workflowsCount,
      totalSpent
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload and parse resume (PDF, DOCX, or TXT)
 */
app.post('/api/resume/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype, originalname } = req.file;
    let text = '';

    console.log(`[API] Processing resume upload: ${originalname} (${mimetype})`);

    // Parse based on file type
    if (mimetype === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (mimetype === 'text/plain') {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Clean up the text
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text) {
      return res.status(400).json({ error: 'Could not extract text from file. The file may be empty or corrupted.' });
    }

    console.log(`[API] Successfully extracted ${text.length} characters from resume`);

    res.json({
      text,
      filename: originalname,
      characters: text.length
    });
  } catch (error) {
    console.error('[API] Resume upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse resume' });
  }
});

/**
 * Get quote for people search
 */
app.post('/api/people-finder/quote', async (req, res) => {
  try {
    const { query, company, role, numResults = 5 } = req.body;

    const quote = await peopleFinder.getQuote({
      query,
      company,
      role,
      numResults
    });

    res.json({
      message: 'Quote retrieved',
      quote: {
        provider: peopleFinder.providerName,
        ...quote
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Full flow: execute people search
 * Optionally enrich contacts with Happenstance for email/personal info
 */
app.post('/api/people-finder/search', async (req, res) => {
  try {
    const { 
      query, 
      company, 
      role, 
      numResults = 5,
      enrichContacts = false // Set to true to enrich with Happenstance
    } = req.body;

    console.log(`[API] People search request: company="${company}", role="${role}", query="${query}", enrich=${enrichContacts}`);

    // Validate input
    if (!query && !company) {
      return res.status(400).json({ error: 'Please provide either a company name or a search query' });
    }

    const startTime = Date.now();
    const result = await peopleFinder.execute({ query, company, role, numResults });
    const executionTime = Date.now() - startTime;

    console.log(`[API] Search completed successfully. Found ${result?.contacts?.length || 0} contacts`);

    let contacts = result?.contacts || [];
    let enrichmentStats = null;
    const quote = await peopleFinder.getQuote({ query, company, role, numResults });

    // Create receipt record
    const receipt = await Receipt.create({
      tool_id: 'people-finder',
      tool_name: peopleFinder.name,
      provider: peopleFinder.providerName,
      amount_paid_usd: quote.price_usd,
      transaction_id: `tx_${Date.now()}`,
      response_data: result,
      execution_time_ms: executionTime
    });

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
    if (contacts.length > 0) {
      const costPerContact = quote.price_usd / contacts.length;
      
      for (const contact of contacts) {
        try {
          await Contact.create({
            ...contact,
            source: peopleFinder.providerName,
            search_query: result.query,
            cost_usd: costPerContact,
            receipt_id: receipt._id
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
      receipt: {
        id: receipt._id,
        transaction_id: receipt.transaction_id,
        amount_paid_usd: quote.price_usd,
        execution_time_ms: executionTime,
        provider: peopleFinder.providerName
      },
      provenance: contacts.map(c => ({
        contact: c.name,
        data_source: peopleFinder.providerName,
        cost_usd: quote.price_usd / (contacts.length || 1),
        query_used: result.query,
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
 * Get quote for job search
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
      limit = 25
    } = req.body;

    const quote = await jobFinder.getQuote({
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

    res.json({
      message: 'Quote retrieved',
      quote: {
        provider: jobFinder.providerName,
        ...quote
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Full job search flow
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
      limit = 25
    } = req.body;

    console.log(`[API] Job search request: keywords="${keywords}", location="${location}"`);

    const startTime = Date.now();
    const result = await jobFinder.execute({ 
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
    const executionTime = Date.now() - startTime;

    const quote = await jobFinder.getQuote({ keywords, location, limit });

    // Create receipt record
    const receipt = await Receipt.create({
      tool_id: 'job-finder',
      tool_name: jobFinder.name,
      provider: jobFinder.providerName,
      amount_paid_usd: quote.price_usd,
      transaction_id: `tx_${Date.now()}`,
      response_data: result,
      execution_time_ms: executionTime
    });

    // Save jobs to database
    if (result.jobs) {
      const costPerJob = quote.price_usd / result.jobs.length;
      
      for (const job of result.jobs) {
        await Job.create({
          ...job,
          source: jobFinder.providerName,
          cost_usd: costPerJob,
          receipt_id: receipt._id
        });
      }
    }

    res.json({
      message: 'Job search completed',
      jobs: result.jobs,
      total_found: result.jobs?.length || 0,
      receipt: {
        id: receipt._id,
        transaction_id: receipt.transaction_id,
        amount_paid_usd: quote.price_usd,
        execution_time_ms: executionTime,
        provider: jobFinder.providerName
      },
      search_params: result.searchParams
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
// Tomba Email Lookup Routes
// ============================================

/**
 * Find email from LinkedIn profile URL using Tomba
 */
app.post('/api/tomba/linkedin', async (req, res) => {
  try {
    const { url, linkedinUrl } = req.body;
    const linkedIn = url || linkedinUrl;

    if (!linkedIn) {
      return res.status(400).json({ error: 'LinkedIn URL is required' });
    }

    console.log(`[API] Tomba LinkedIn lookup: ${linkedIn}`);

    const result = await tombaEnricher.findEmailByLinkedIn(linkedIn);

    if (result.success) {
      // Optionally update contact in database if exists
      await Contact.updateMany(
        { linkedin_url: { $regex: linkedIn.split('/in/')[1]?.replace(/\/$/, ''), $options: 'i' } },
        { 
          email: result.email,
          email_source: 'tomba',
          email_confidence: result.confidence
        }
      );
    }

    res.json(result);
  } catch (error) {
    console.error('[API] Tomba LinkedIn lookup error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Find email by name and company domain
 */
app.post('/api/tomba/find', async (req, res) => {
  try {
    const { firstName, lastName, domain, first_name, last_name } = req.body;
    const fName = firstName || first_name;
    const lName = lastName || last_name;

    if (!fName || !lName || !domain) {
      return res.status(400).json({ error: 'firstName, lastName, and domain are required' });
    }

    console.log(`[API] Tomba email find: ${fName} ${lName} at ${domain}`);

    const result = await tombaEnricher.findEmailByNameDomain(fName, lName, domain);

    res.json(result);
  } catch (error) {
    console.error('[API] Tomba email find error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Verify an email address
 */
app.post('/api/tomba/verify', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    console.log(`[API] Tomba email verify: ${email}`);

    const result = await tombaEnricher.verifyEmail(email);

    res.json(result);
  } catch (error) {
    console.error('[API] Tomba email verify error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Enrich a contact with email using Tomba
 */
app.post('/api/tomba/enrich-contact', async (req, res) => {
  try {
    const { contactId, linkedinUrl } = req.body;

    if (!contactId && !linkedinUrl) {
      return res.status(400).json({ error: 'Either contactId or linkedinUrl is required' });
    }

    let linkedIn = linkedinUrl;
    let contact = null;

    // If contactId provided, get LinkedIn URL from contact
    if (contactId) {
      contact = await Contact.findById(contactId);
      if (!contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }
      linkedIn = contact.linkedin_url;
    }

    if (!linkedIn) {
      return res.status(400).json({ error: 'Contact has no LinkedIn URL' });
    }

    console.log(`[API] Tomba enrich contact: ${linkedIn}`);

    const result = await tombaEnricher.findEmailByLinkedIn(linkedIn);

    if (result.success && contact) {
      // Update contact in database
      await Contact.findByIdAndUpdate(contactId, {
        email: result.email,
        email_source: 'tomba',
        email_confidence: result.confidence
      });
    }

    res.json({
      success: result.success,
      email: result.email,
      email_type: result.email_type,
      confidence: result.confidence,
      contact_updated: !!contact
    });
  } catch (error) {
    console.error('[API] Tomba enrich contact error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Email Sending Routes
// ============================================

/**
 * Send an email
 */
app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, body, html, replyTo } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    console.log(`[API] Sending email to: ${to}`);

    const result = await emailSender.sendEmail({ to, subject, body, html, replyTo });

    if (result.success) {
      res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[API] Email send error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send a drafted email from the database
 */
app.post('/api/email/send-draft/:emailId', async (req, res) => {
  try {
    const { emailId } = req.params;
    const { replyTo } = req.body;

    console.log(`[API] Sending drafted email: ${emailId}`);

    // Get the email draft
    const emailDraft = await Email.findById(emailId).populate('contact_id');
    
    if (!emailDraft) {
      return res.status(404).json({ error: 'Email draft not found' });
    }

    // Get recipient email - either from draft or from associated contact
    let recipientEmail = emailDraft.recipient_email;
    
    if (!recipientEmail && emailDraft.contact_id?.email) {
      recipientEmail = emailDraft.contact_id.email;
    }

    if (!recipientEmail) {
      return res.status(400).json({ 
        error: 'No recipient email address available. Please enrich the contact first.',
        contact_id: emailDraft.contact_id?._id
      });
    }

    // Send the email
    const result = await emailSender.sendEmail({
      to: recipientEmail,
      subject: emailDraft.subject,
      body: emailDraft.body,
      replyTo
    });

    if (result.success) {
      // Update email status
      await Email.findByIdAndUpdate(emailId, {
        status: 'sent',
        sent_at: new Date(),
        recipient_email: recipientEmail,
        send_result: {
          message_id: result.messageId,
          response: result.response
        }
      });

      res.json({
        success: true,
        message: 'Email sent successfully',
        messageId: result.messageId,
        sentTo: recipientEmail
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('[API] Send draft error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send multiple emails in batch
 */
app.post('/api/email/send-batch', async (req, res) => {
  try {
    const { emails, delay = 1000 } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }

    console.log(`[API] Sending batch of ${emails.length} emails`);

    const results = await emailSender.sendBatch(emails, { delay });

    res.json({
      success: results.failed === 0,
      message: `Sent ${results.sent}/${results.total} emails`,
      ...results
    });
  } catch (error) {
    console.error('[API] Batch send error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Verify SMTP configuration
 */
app.post('/api/email/verify', async (req, res) => {
  try {
    const { testEmail } = req.body;

    console.log('[API] Verifying email configuration');

    const result = await emailSender.verifyConfiguration(testEmail);

    res.json(result);
  } catch (error) {
    console.error('[API] Email verify error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get email service status
 */
app.get('/api/email/status', (req, res) => {
  res.json({
    configured: emailSender.isAvailable(),
    provider: emailSender.isAvailable() ? 'smtp' : 'mock',
    fromEmail: emailSender.fromEmail || null
  });
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
 * Get workflow status and results with detailed intermediate data
 */
app.get('/api/agent/status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const orchestrator = getOrchestrator();
    
    const workflow = await orchestrator.getWorkflowStatus(workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    // Fetch recent items for live activity feed (most recent 5 of each)
    const [recentJobs, recentContacts, recentEmails] = await Promise.all([
      Job.find({ workflow_id: workflowId })
        .sort({ created_at: -1 })
        .limit(5)
        .select('title company_name location created_at')
        .lean(),
      Contact.find({ workflow_id: workflowId })
        .sort({ created_at: -1 })
        .limit(5)
        .select('name title company created_at')
        .lean(),
      Email.find({ workflow_id: workflowId })
        .sort({ created_at: -1 })
        .limit(5)
        .select('recipient_name recipient_company subject created_at')
        .lean()
    ]);

    // Get actual counts from database for accuracy
    const [jobsCount, contactsCount, emailsCount] = await Promise.all([
      Job.countDocuments({ workflow_id: workflowId }),
      Contact.countDocuments({ workflow_id: workflowId }),
      Email.countDocuments({ workflow_id: workflowId })
    ]);

    // Build activity feed from recent items
    const activityFeed = [
      ...recentJobs.map(j => ({
        type: 'job',
        title: `Found job: ${j.title}`,
        subtitle: j.company_name,
        timestamp: j.created_at
      })),
      ...recentContacts.map(c => ({
        type: 'contact',
        title: `Found contact: ${c.name}`,
        subtitle: `${c.title} at ${c.company}`,
        timestamp: c.created_at
      })),
      ...recentEmails.map(e => ({
        type: 'email',
        title: `Drafted email for ${e.recipient_name}`,
        subtitle: e.subject?.substring(0, 50) + (e.subject?.length > 50 ? '...' : ''),
        timestamp: e.created_at
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);

    res.json({
      workflow: {
        id: workflow._id,
        status: workflow.status,
        target_roles: workflow.target_roles,
        target_companies: workflow.target_companies,
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
        jobs_count: jobsCount,
        contacts_count: contactsCount,
        emails_count: emailsCount
      },
      // New detailed intermediate data
      recent: {
        jobs: recentJobs,
        contacts: recentContacts,
        emails: recentEmails
      },
      activity_feed: activityFeed
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
      console.log(`\n   Tomba Email Lookup:`);
      console.log(`   POST /api/tomba/linkedin        - Find email from LinkedIn URL`);
      console.log(`   POST /api/tomba/find            - Find email by name + domain`);
      console.log(`   POST /api/tomba/verify          - Verify email address`);
      console.log(`   POST /api/tomba/enrich-contact  - Enrich contact with email`);
      console.log(`\n   Email Sending:`);
      console.log(`   POST /api/email/send            - Send an email`);
      console.log(`   POST /api/email/send-draft/:id  - Send a drafted email`);
      console.log(`   POST /api/email/send-batch      - Send multiple emails`);
      console.log(`   POST /api/email/verify          - Verify SMTP configuration`);
      console.log(`   GET  /api/email/status          - Get email service status`);
      console.log(`\n   General:`);
      console.log(`   POST /api/pay/:offerId          - Pay and execute`);
      console.log(`   GET  /api/offers                - List all offers`);
      console.log(`   GET  /api/receipts              - List all receipts`);
      console.log(`   GET  /api/contacts              - List all contacts`);
      console.log(`   GET  /api/resumes               - List all resumes`);
      console.log(`\n💡 Set APIFY_TOKEN, FIREWORKS_API_KEY, HAPPENSTANCE_API_KEY, TOMBA_API_KEY/SECRET, and SMTP_* env vars for full functionality`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
