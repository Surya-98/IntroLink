import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { x402 } from './services/x402Protocol.js';
import { PeopleFinderTool, MockPeopleFinderTool } from './services/peopleFinder.js';
import { Offer, Receipt, Contact } from './models/schemas.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/introlink';
const APIFY_TOKEN = process.env.APIFY_TOKEN;

// Initialize tools
const initializeTools = () => {
  // Register real Apify-based People Finder if token available
  if (APIFY_TOKEN) {
    const realPeopleFinder = new PeopleFinderTool(APIFY_TOKEN);
    x402.registerProvider('people-finder-exa', realPeopleFinder);
    console.log('✓ Registered real People Finder (Apify Exa)');
  }
  
  // Always register mock provider for testing/comparison
  const mockPeopleFinder = new MockPeopleFinderTool();
  x402.registerProvider('people-finder-mock', mockPeopleFinder);
  console.log('✓ Registered mock People Finder');
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
 */
app.post('/api/people-finder/search', async (req, res) => {
  try {
    const { 
      query, 
      company, 
      role, 
      numResults = 5,
      strategy = 'cheapest' // cheapest, fastest, reliable, balanced
    } = req.body;

    console.log(`[API] People search request: company="${company}", role="${role}"`);

    const result = await x402.executeWithQuoteSweep(
      'people_search',
      { query, company, role, numResults },
      strategy
    );

    // Save contacts to database
    if (result.success && result.result.contacts) {
      const costPerContact = result.receipt.amount_paid_usd / result.result.contacts.length;
      
      for (const contact of result.result.contacts) {
        await Contact.create({
          ...contact,
          source: result.receipt.provider,
          search_query: result.result.query,
          cost_usd: costPerContact,
          receipt_id: result.receipt.id
        });
      }
    }

    res.json({
      message: 'Search completed',
      contacts: result.result.contacts,
      receipt: result.receipt,
      quote_sweep: result.quote_sweep,
      provenance: result.result.contacts?.map(c => ({
        contact: c.name,
        data_source: result.receipt.provider,
        cost_usd: result.receipt.amount_paid_usd / (result.result.contacts?.length || 1),
        query_used: result.result.query
      }))
    });
  } catch (error) {
    console.error('[API] Search error:', error);
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
// Start Server
// ============================================

const startServer = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Initialize tools
    initializeTools();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n🚀 IntroLink API running on http://localhost:${PORT}`);
      console.log(`\n📋 Available endpoints:`);
      console.log(`   POST /api/people-finder/quote   - Get a quote (402)`);
      console.log(`   POST /api/people-finder/sweep   - Sweep quotes from all providers`);
      console.log(`   POST /api/pay/:offerId          - Pay and execute`);
      console.log(`   POST /api/people-finder/search  - Full flow with quote sweep`);
      console.log(`   GET  /api/offers                - List all offers`);
      console.log(`   GET  /api/receipts              - List all receipts`);
      console.log(`   GET  /api/contacts              - List all contacts`);
      console.log(`\n💡 Set APIFY_TOKEN env var to use real Exa People Search`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

