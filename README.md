# IntroLink

A job search helper tool that drafts and sends cold emails to relevant people from job postings.

## 🎯 Key Feature: x402 Payment Protocol

IntroLink implements the **x402 Payment Protocol** - a price-shopping mechanism for AI agent actions:

1. **Quote Sweep** - Request quotes from multiple providers (get 402 Payment Required)
2. **Compare Offers** - Evaluate by price/latency/reliability
3. **Pay Winner** - Execute only with the best provider
4. **Track Receipts** - Full cost provenance for every action

This is genuinely different from "cost-aware" systems - it's **price-shopping for actions**.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     x402 Orchestrator                        │
├─────────────────────────────────────────────────────────────┤
│  Quote Sweep → Compare Offers → Pay Winner → Track Receipt   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Job Feed     │     │ People Finder │     │   Message     │
│    Tool       │     │    Tool       │     │  Composer     │
│  (per-query)  │     │ (Apify Exa)   │     │   (AI)        │
└───────────────┘     └───────────────┘     └───────────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Apify API Token (for real people search)

### Installation

```bash
cd backend
npm install
```

### Configuration

Create a `.env` file in the backend directory:

```env
# Apify API Token for Exa People Search
# Get your token from: https://console.apify.com/account/integrations
APIFY_TOKEN=your_apify_token_here

# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/introlink

# Server Port
PORT=3001
```

### Run the Test

```bash
# Test the people finder with mock data (no API key needed)
node src/test-people-finder.js

# Or with real Apify integration
APIFY_TOKEN=your_token node src/test-people-finder.js
```

### Start the API Server

```bash
npm start
# or for development
npm run dev
```

## 📡 API Endpoints

### Get Quote (402 Payment Required)
```bash
POST /api/people-finder/quote
{
  "company": "Stripe",
  "role": "Software Engineer",
  "numResults": 5
}
# Returns: 402 with pricing info
```

### Sweep Quotes from All Providers
```bash
POST /api/people-finder/sweep
{
  "company": "Stripe",
  "role": "Software Engineer"
}
# Returns: All provider quotes for comparison
```

### Pay and Execute
```bash
POST /api/pay/:offerId
# Returns: Result + receipt with transaction details
```

### Full Flow (Sweep → Pay → Execute)
```bash
POST /api/people-finder/search
{
  "company": "Stripe",
  "role": "Software Engineer",
  "numResults": 5,
  "strategy": "cheapest"  // cheapest | fastest | reliable | balanced
}
# Returns: Contacts + receipt + quote comparison
```

### View Data
```bash
GET /api/offers    # All quotes (including rejected)
GET /api/receipts  # Paid transactions
GET /api/contacts  # Found people with cost provenance
```

## 💰 Cost Provenance

Every contact shows exactly what was paid:

```json
{
  "contact": "Sarah Chen",
  "provenance": {
    "source": "apify-exa",
    "cost_usd": 0.005,
    "query_used": "\"Stripe\" (recruiter OR \"talent acquisition\")",
    "receipt": {
      "transaction_id": "tx_abc123",
      "total_paid": 0.015,
      "provider": "apify-exa"
    }
  }
}
```

## 🗄 MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `offers` | All quotes received (even rejected ones) |
| `receipts` | Paid headers + settlement details |
| `contacts` | Found people + sources + costs |

## 🔧 People Finder Tool

The People Finder uses **Apify's Exa AI People Search** actor to find:
- Recruiters
- Hiring managers
- Engineering managers
- Talent acquisition specialists

### Apify Actor
- ID: `fantastic-jobs~exa-ai-people-search`
- Pricing: ~$0.015 per search
- Returns: LinkedIn profiles, titles, company affiliations

## 📝 Example Output

```
🔍 IntroLink People Finder Test

💰 Step 1: Sweeping quotes from all providers...

   📦 apify-exa
      Price: $0.0200
      Latency: 3000ms
      Reliability: 92%
      402 Headers:
         X-Payment-Required: true
         X-Price-USD: 0.02

   📦 mock-provider
      Price: $0.0100
      Latency: 500ms
      Reliability: 99%

🎯 Step 2: Selecting best offer (strategy: cheapest)...
   Selected: mock-provider at $0.0100

💳 Step 3: Paying and executing...
   ✅ Success!
   📧 Receipt:
      Transaction ID: tx_abc123
      Amount Paid: $0.0100

👥 Found Contacts (with cost provenance):

   1. Sarah Chen
      Title: Senior Technical Recruiter
      Company: Stripe
      LinkedIn: https://linkedin.com/in/sarah-chen-recruiter
      💵 Cost: $0.0033 (via mock-provider)
```

## 🎨 Why This is Different

This isn't just another job search tool. The x402 protocol means:

1. **Agents can shop for the best deal** on every action
2. **Full transparency** on what each piece of data cost
3. **Receipts prove** the agent made economical choices
4. **Multiple providers compete** for each task

Perfect for demonstrating AI agent payment systems in the real world.
