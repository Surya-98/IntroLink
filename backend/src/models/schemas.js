import mongoose from 'mongoose';

// Offers collection - all quotes received (even rejected ones)
const offerSchema = new mongoose.Schema({
  tool_id: { type: String, required: true },
  tool_name: { type: String, required: true },
  provider: { type: String, required: true },
  price_usd: { type: Number, required: true },
  latency_estimate_ms: { type: Number },
  reliability_score: { type: Number, min: 0, max: 1 },
  quote_expires_at: { type: Date },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  request_params: { type: mongoose.Schema.Types.Mixed },
  created_at: { type: Date, default: Date.now }
});

// Receipts collection - paid headers + settlement details
const receiptSchema = new mongoose.Schema({
  offer_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
  tool_id: { type: String, required: true },
  tool_name: { type: String, required: true },
  provider: { type: String, required: true },
  amount_paid_usd: { type: Number, required: true },
  payment_method: { type: String, default: 'x402' },
  transaction_id: { type: String, required: true },
  x402_headers: { type: mongoose.Schema.Types.Mixed },
  response_data: { type: mongoose.Schema.Types.Mixed },
  execution_time_ms: { type: Number },
  created_at: { type: Date, default: Date.now }
});

// Contacts collection - found people
const contactSchema = new mongoose.Schema({
  name: { type: String },
  title: { type: String },
  company: { type: String },
  linkedin_url: { type: String },
  email: { type: String },
  source: { type: String, default: 'exa-people-search' },
  source_url: { type: String },
  search_query: { type: String },
  job_id: { type: String },
  cost_usd: { type: Number },
  receipt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Receipt' },
  workflow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
  
  // Enrichment fields (from Happenstance)
  phone: { type: String },
  location: { type: String },
  bio: { type: String },
  additional_emails: [{ type: String }],
  twitter_url: { type: String },
  social_profiles: { type: mongoose.Schema.Types.Mixed },
  company_details: { type: mongoose.Schema.Types.Mixed },
  enrichment_source: { type: String },
  enrichment_timestamp: { type: Date },
  enrichment_error: { type: String },
  
  created_at: { type: Date, default: Date.now }
});

// Jobs collection - LinkedIn job listings
const jobSchema = new mongoose.Schema({
  // Basic job info
  job_id: { type: String, index: true },
  title: { type: String, required: true },
  description: { type: String },
  description_snippet: { type: String },
  
  // Company info
  company_name: { type: String },
  company_url: { type: String },
  company_logo: { type: String },
  company_size: { type: String },
  company_industry: { type: String },
  
  // Location & work arrangement
  location: { type: String },
  work_arrangement: { type: String }, // remote, hybrid, on-site
  
  // Job details
  employment_type: { type: String }, // full-time, part-time, contract
  seniority_level: { type: String }, // entry, mid-senior, director, etc.
  
  // Salary info
  salary_min: { type: Number },
  salary_max: { type: Number },
  salary_currency: { type: String, default: 'USD' },
  salary_period: { type: String, default: 'yearly' },
  
  // Application info
  apply_url: { type: String },
  linkedin_url: { type: String },
  easy_apply: { type: Boolean, default: false },
  
  // Dates
  posted_date: { type: Date },
  
  // AI enrichments
  years_experience_required: { type: Number },
  visa_sponsorship: { type: Boolean },
  skills: [{ type: String }],
  
  // Recruiter info
  recruiter_name: { type: String },
  recruiter_title: { type: String },
  recruiter_linkedin: { type: String },
  
  // Search & cost tracking
  search_keywords: { type: String },
  source: { type: String, default: 'apify-linkedin-jobs' },
  cost_usd: { type: Number },
  receipt_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Receipt' },
  workflow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow' },
  
  fetched_at: { type: Date },
  created_at: { type: Date, default: Date.now }
});

// Resume schema - parsed resume data
const resumeSchema = new mongoose.Schema({
  // Raw content
  raw_text: { type: String },
  file_name: { type: String },
  
  // Parsed fields
  name: { type: String },
  email: { type: String },
  phone: { type: String },
  location: { type: String },
  linkedin_url: { type: String },
  portfolio_url: { type: String },
  
  // Professional summary
  summary: { type: String },
  
  // Skills
  skills: [{ type: String }],
  technical_skills: [{ type: String }],
  soft_skills: [{ type: String }],
  
  // Experience
  experience: [{
    company: { type: String },
    title: { type: String },
    location: { type: String },
    start_date: { type: String },
    end_date: { type: String },
    is_current: { type: Boolean },
    description: { type: String },
    highlights: [{ type: String }]
  }],
  
  // Education
  education: [{
    institution: { type: String },
    degree: { type: String },
    field: { type: String },
    graduation_date: { type: String },
    gpa: { type: String }
  }],
  
  // Certifications
  certifications: [{ type: String }],
  
  // Projects
  projects: [{
    name: { type: String },
    description: { type: String },
    technologies: [{ type: String }],
    url: { type: String }
  }],
  
  // Total years of experience (calculated)
  years_of_experience: { type: Number },
  
  // Current/most recent role info
  current_title: { type: String },
  current_company: { type: String },
  
  created_at: { type: Date, default: Date.now }
});

// Email draft schema - AI-generated personalized emails
const emailSchema = new mongoose.Schema({
  // References
  workflow_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
  job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  contact_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
  
  // Recipient info
  recipient_name: { type: String },
  recipient_email: { type: String },
  recipient_title: { type: String },
  recipient_company: { type: String },
  
  // Email content
  subject: { type: String },
  body: { type: String },
  
  // Generation metadata
  model_used: { type: String, default: 'accounts/fireworks/models/llama-v3p1-70b-instruct' },
  prompt_tokens: { type: Number },
  completion_tokens: { type: Number },
  generation_cost_usd: { type: Number },
  
  // Context used for generation
  job_context: {
    title: { type: String },
    company: { type: String },
    description_snippet: { type: String }
  },
  resume_context: {
    name: { type: String },
    current_title: { type: String },
    skills: [{ type: String }],
    summary: { type: String }
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'reviewed', 'sent', 'responded'],
    default: 'draft'
  },
  
  sent_at: { type: Date },
  created_at: { type: Date, default: Date.now }
});

// Workflow schema - orchestrates the entire agentic process
const workflowSchema = new mongoose.Schema({
  // User inputs
  resume_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
  target_roles: [{ type: String }],
  target_locations: [{ type: String }],
  preferences: {
    work_arrangement: { type: String }, // remote, hybrid, on-site
    seniority_level: { type: String },
    max_jobs_per_role: { type: Number, default: 10 },
    max_contacts_per_job: { type: Number, default: 3 }
  },
  
  // Workflow status
  status: {
    type: String,
    enum: ['pending', 'parsing_resume', 'searching_jobs', 'finding_contacts', 'drafting_emails', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Progress tracking
  progress: {
    total_roles: { type: Number, default: 0 },
    roles_completed: { type: Number, default: 0 },
    total_jobs_found: { type: Number, default: 0 },
    total_contacts_found: { type: Number, default: 0 },
    total_emails_drafted: { type: Number, default: 0 },
    current_step: { type: String },
    current_role: { type: String }
  },
  
  // Results aggregation
  jobs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
  emails: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Email' }],
  
  // Cost tracking
  total_cost_usd: { type: Number, default: 0 },
  cost_breakdown: {
    job_search: { type: Number, default: 0 },
    people_search: { type: Number, default: 0 },
    person_enrichment: { type: Number, default: 0 },
    email_generation: { type: Number, default: 0 }
  },
  
  // Error tracking
  errors: [{
    step: { type: String },
    message: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // Timestamps
  started_at: { type: Date },
  completed_at: { type: Date },
  created_at: { type: Date, default: Date.now }
});

export const Offer = mongoose.model('Offer', offerSchema);
export const Receipt = mongoose.model('Receipt', receiptSchema);
export const Contact = mongoose.model('Contact', contactSchema);
export const Job = mongoose.model('Job', jobSchema);
export const Resume = mongoose.model('Resume', resumeSchema);
export const Email = mongoose.model('Email', emailSchema);
export const Workflow = mongoose.model('Workflow', workflowSchema);
