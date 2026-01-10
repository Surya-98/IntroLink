/**
 * Test script for People Finder Tool
 * 
 * Run: node src/test-people-finder.js
 * 
 * This tests the x402 payment flow:
 * 1. Request quotes from providers
 * 2. Compare and select best offer
 * 3. Pay and execute
 * 4. Show receipt with cost provenance
 */

import { x402 } from './services/x402Protocol.js';
import { PeopleFinderTool, MockPeopleFinderTool } from './services/peopleFinder.js';
import mongoose from 'mongoose';

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/introlink';
const APIFY_TOKEN = process.env.APIFY_TOKEN;

async function testPeopleFinder() {
  console.log('🔍 IntroLink People Finder Test\n');
  console.log('='.repeat(50));

  // Connect to MongoDB
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
  } catch (err) {
    console.log('⚠ MongoDB not available, running without persistence\n');
  }

  // Register providers
  if (APIFY_TOKEN) {
    const realProvider = new PeopleFinderTool(APIFY_TOKEN);
    x402.registerProvider('people-finder-exa', realProvider);
    console.log('✓ Registered: Apify Exa People Search (REAL)');
  } else {
    console.log('⚠ No APIFY_TOKEN - using mock provider only');
  }

  const mockProvider = new MockPeopleFinderTool();
  x402.registerProvider('people-finder-mock', mockProvider);
  console.log('✓ Registered: Mock People Search\n');

  // Test parameters
  const searchParams = {
    company: 'Stripe',
    role: 'Software Engineer',
    numResults: 3
  };

  console.log('📋 Search Parameters:');
  console.log(`   Company: ${searchParams.company}`);
  console.log(`   Role: ${searchParams.role}`);
  console.log(`   Results: ${searchParams.numResults}\n`);

  // Step 1: Sweep quotes
  console.log('💰 Step 1: Sweeping quotes from all providers...\n');
  
  try {
    const quotes = await x402.sweepQuotes('people_search', searchParams);
    
    console.log(`   Found ${quotes.length} provider(s):\n`);
    
    for (const quote of quotes) {
      console.log(`   📦 ${quote.provider}`);
      console.log(`      Price: $${quote.price_usd.toFixed(4)}`);
      console.log(`      Latency: ${quote.latency_estimate_ms}ms`);
      console.log(`      Reliability: ${(quote.reliability_score * 100).toFixed(0)}%`);
      console.log(`      Offer ID: ${quote.offer_id}`);
      console.log(`      402 Headers:`);
      Object.entries(quote.x402_response.headers).forEach(([k, v]) => {
        console.log(`         ${k}: ${v}`);
      });
      console.log('');
    }

    // Step 2: Select best offer
    console.log('🎯 Step 2: Selecting best offer (strategy: cheapest)...\n');
    
    const bestOffer = x402.selectBestOffer(quotes, 'cheapest');
    console.log(`   Selected: ${bestOffer.provider} at $${bestOffer.price_usd.toFixed(4)}\n`);

    // Step 3: Pay and execute
    console.log('💳 Step 3: Paying and executing...\n');
    
    const result = await x402.payAndExecute(bestOffer.offer_id);
    
    console.log(`   ✅ Success!\n`);
    console.log(`   📧 Receipt:`);
    console.log(`      Transaction ID: ${result.receipt.transaction_id}`);
    console.log(`      Amount Paid: $${result.receipt.amount_paid_usd.toFixed(4)}`);
    console.log(`      Execution Time: ${result.receipt.execution_time_ms}ms`);
    console.log(`      Provider: ${result.receipt.provider}\n`);

    // Step 4: Show results with provenance
    console.log('👥 Found Contacts (with cost provenance):\n');
    
    const contacts = result.result.contacts || [];
    const costPerContact = result.receipt.amount_paid_usd / contacts.length;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      console.log(`   ${i + 1}. ${contact.name}`);
      console.log(`      Title: ${contact.title}`);
      console.log(`      Company: ${contact.company}`);
      if (contact.linkedin_url) {
        console.log(`      LinkedIn: ${contact.linkedin_url}`);
      }
      console.log(`      💵 Cost: $${costPerContact.toFixed(4)} (via ${result.receipt.provider})`);
      console.log('');
    }

    console.log('='.repeat(50));
    console.log('\n✨ Test completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }

  // Disconnect
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  
  process.exit(0);
}

testPeopleFinder();

