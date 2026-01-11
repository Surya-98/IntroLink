import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
import mammoth from 'mammoth';

// Import schemas
const { Schema } = mongoose;

// ============================================
// Mongoose Schemas (inline for serverless)
// ============================================

const receiptSchema = new Schema({
  tool_id: { type: String, required: true },
  tool_name: { type: String, required: true },
  provider: { type: String, required: true },
  amount_paid_usd: { type: Number, required: true },
  transaction_id: { type: String, required: true },
  response_data: { type: Schema.Types.Mixed },
  execution_time_ms: { type: Number },
  created_at: { type: Date, default: Date.now }
});

const contactSchema = new Schema({
  name: { type: String, required: true },
  title: String,
  company: String,
  email: String,
  email_source: String,
  email_confidence: Number,
  phone: String,
  linkedin_url: String,
  twitter_url: String,
  location: String,
  source: String,
  search_query: String,
  cost_usd: Number,
  receipt_id: { type: Schema.Types.ObjectId, ref: 'Receipt' },
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow' },
  job_id: { type: Schema.Types.ObjectId, ref: 'Job' },
  enrichment_source: String,
  enrichment_timestamp: Date,
  additional_emails: [String],
  social_profiles: Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now }
});

const jobSchema = new Schema({
  title: { type: String, required: true },
  company_name: String,
  company_linkedin_url: String,
  location: String,
  work_arrangement: String,
  seniority_level: String,
  employment_type: String,
  job_url: { type: String, required: true },
  posted_date: String,
  applicants: String,
  description: String,
  salary: String,
  easy_apply: Boolean,
  source: String,
  search_keywords: String,
  cost_usd: Number,
  receipt_id: { type: Schema.Types.ObjectId, ref: 'Receipt' },
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow' },
  created_at: { type: Date, default: Date.now }
});

const workflowSchema = new Schema({
  status: { 
    type: String, 
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  target_roles: [String],
  target_companies: [String],
  target_locations: [String],
  preferences: Schema.Types.Mixed,
  resume_id: { type: Schema.Types.ObjectId, ref: 'Resume' },
  progress: {
    current_step: String,
    steps_completed: [String],
    total_jobs_found: { type: Number, default: 0 },
    total_contacts_found: { type: Number, default: 0 },
    total_emails_drafted: { type: Number, default: 0 }
  },
  total_cost_usd: { type: Number, default: 0 },
  cost_breakdown: Schema.Types.Mixed,
  errors: [Schema.Types.Mixed],
  started_at: Date,
  completed_at: Date,
  created_at: { type: Date, default: Date.now }
});

const emailSchema = new Schema({
  workflow_id: { type: Schema.Types.ObjectId, ref: 'Workflow' },
  job_id: { type: Schema.Types.ObjectId, ref: 'Job' },
  contact_id: { type: Schema.Types.ObjectId, ref: 'Contact' },
  recipient_name: String,
  recipient_company: String,
  recipient_email: String,
  subject: String,
  body: String,
  status: {
    type: String,
    enum: ['draft', 'reviewed', 'sent', 'responded'],
    default: 'draft'
  },
  sent_at: Date,
  send_result: Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now }
});

const resumeSchema = new Schema({
  raw_text: { type: String, required: true },
  name: String,
  email: String,
  phone: String,
  location: String,
  current_title: String,
  current_company: String,
  summary: String,
  skills: [String],
  experience: [Schema.Types.Mixed],
  education: [Schema.Types.Mixed],
  years_of_experience: Number,
  created_at: { type: Date, default: Date.now }
});

// Get or create models
const Receipt = mongoose.models.Receipt || mongoose.model('Receipt', receiptSchema);
const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);
const Workflow = mongoose.models.Workflow || mongoose.model('Workflow', workflowSchema);
const Email = mongoose.models.Email || mongoose.model('Email', emailSchema);
const Resume = mongoose.models.Resume || mongoose.model('Resume', resumeSchema);

// ============================================
// Express App Setup
// ============================================

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

// MongoDB connection caching for serverless
let cachedConnection = null;

async function connectDB() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  cachedConnection = await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  return cachedConnection;
}

// Middleware to ensure DB connection
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error('DB connection error:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// ============================================
// API Routes
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

app.post('/api/resume/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { buffer, mimetype, originalname } = req.file;
    let text = '';

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

    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!text) {
      return res.status(400).json({ error: 'Could not extract text from file.' });
    }

    res.json({
      text,
      filename: originalname,
      characters: text.length
    });
  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to parse resume' });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const { keywords, location, company, workArrangement, limit = 100 } = req.query;

    const filter = {};
    if (keywords) filter.search_keywords = new RegExp(keywords, 'i');
    if (location) filter.location = new RegExp(location, 'i');
    if (company) filter.company_name = new RegExp(company, 'i');
    if (workArrangement) filter.work_arrangement = workArrangement;

    const jobs = await Job.find(filter)
      .sort({ created_at: -1 })
      .limit(parseInt(limit));
    
    res.json({ jobs, total: jobs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ created_at: -1 }).limit(100);
    res.json({ contacts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/receipts', async (req, res) => {
  try {
    const receipts = await Receipt.find().sort({ created_at: -1 }).limit(50);
    res.json({ receipts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

app.get('/api/agent/workflows', async (req, res) => {
  try {
    const { limit = 20, skip = 0, status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const [workflows, total] = await Promise.all([
      Workflow.find(filter)
        .sort({ created_at: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .populate('resume_id', 'name current_title'),
      Workflow.countDocuments(filter)
    ]);
    
    res.json({ workflows, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent/status/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const workflow = await Workflow.findById(workflowId).populate('resume_id');
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

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

    const [jobsCount, contactsCount, emailsCount] = await Promise.all([
      Job.countDocuments({ workflow_id: workflowId }),
      Contact.countDocuments({ workflow_id: workflowId }),
      Email.countDocuments({ workflow_id: workflowId })
    ]);

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
      recent: {
        jobs: recentJobs,
        contacts: recentContacts,
        emails: recentEmails
      },
      activity_feed: activityFeed
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent/results/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const workflow = await Workflow.findById(workflowId).populate('resume_id');
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

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
    console.error('Results error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agent/emails/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    const emails = await Email.find({ workflow_id: workflowId })
      .populate('job_id', 'title company_name location')
      .populate('contact_id', 'name title company linkedin_url')
      .sort({ created_at: -1 });

    res.json({ total: emails.length, emails });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Note: Heavy operations like /api/agent/start require the full backend
// They won't work in this serverless version due to timeout limits
app.post('/api/agent/start', async (req, res) => {
  res.status(501).json({ 
    error: 'Agent workflow not available in serverless mode. Please run the full backend locally for this feature.',
    hint: 'cd backend && npm start'
  });
});

app.post('/api/job-finder/search', async (req, res) => {
  res.status(501).json({ 
    error: 'Job search not available in serverless mode. Please run the full backend locally for this feature.',
    hint: 'cd backend && npm start'
  });
});

app.post('/api/people-finder/search', async (req, res) => {
  res.status(501).json({ 
    error: 'People search not available in serverless mode. Please run the full backend locally for this feature.',
    hint: 'cd backend && npm start'
  });
});

app.post('/api/email/send', async (req, res) => {
  res.status(501).json({ 
    error: 'Email sending not available in serverless mode. Please run the full backend locally for this feature.',
    hint: 'cd backend && npm start'
  });
});

// Catch-all for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Export for Vercel
export default app;

