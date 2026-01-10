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
  created_at: { type: Date, default: Date.now }
});

export const Offer = mongoose.model('Offer', offerSchema);
export const Receipt = mongoose.model('Receipt', receiptSchema);
export const Contact = mongoose.model('Contact', contactSchema);

