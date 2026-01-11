# IntroLink

A job search helper tool that drafts and sends cold emails to relevant people from job postings.

## 🎯 Key Features

IntroLink is an **AI-powered job outreach agent** that automates the job search process:

1. **Job Search** - Find relevant job postings from LinkedIn
2. **Contact Discovery** - Identify recruiters and hiring managers at target companies
3. **Email Enrichment** - Find contact email addresses
4. **Personalized Outreach** - Draft tailored cold emails based on your resume

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestrator                        │
├─────────────────────────────────────────────────────────────┤
│  Resume Parse → Job Search → Find Contacts → Draft Emails    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  Job Finder   │     │ People Finder │     │   Message     │
│  (LinkedIn)   │     │   (Apify)     │     │  Composer     │
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

### Start the API Server

```bash
npm start
# or for development
npm run dev
```

## 📡 API Endpoints

### Get Quote for People Search
```bash
POST /api/people-finder/quote
{
  "company": "Stripe",
  "role": "Software Engineer",
  "numResults": 5
}
# Returns: Pricing info
```

### Execute People Search
```bash
POST /api/people-finder/search
{
  "company": "Stripe",
  "role": "Software Engineer",
  "numResults": 5,
  "enrichContacts": true
}
# Returns: Contacts + receipt
```

### Get Quote for Job Search
```bash
POST /api/job-finder/quote
{
  "keywords": "Software Engineer",
  "location": "San Francisco"
}
# Returns: Pricing info
```

### Execute Job Search
```bash
POST /api/job-finder/search
{
  "keywords": "Software Engineer",
  "location": "San Francisco",
  "limit": 25
}
# Returns: Jobs + receipt
```

### Start Agent Workflow
```bash
POST /api/agent/start
{
  "resumeText": "Your resume text here...",
  "targetRoles": ["Software Engineer", "Backend Developer"],
  "targetCompanies": ["Stripe", "Google"],
  "targetLocations": ["San Francisco", "Remote"]
}
# Returns: Workflow ID
```

### View Data
```bash
GET /api/jobs          # All jobs
GET /api/receipts      # Transaction receipts
GET /api/contacts      # Found people
GET /api/agent/workflows  # All workflows
```

## 💰 Cost Tracking

Every contact shows what was paid:

```json
{
  "contact": "Sarah Chen",
  "provenance": {
    "source": "apify-exa",
    "cost_usd": 0.005,
    "query_used": "\"Stripe\" (recruiter OR \"talent acquisition\")"
  }
}
```

## 🗄 MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `receipts` | Transaction records |
| `contacts` | Found people + sources + costs |
| `jobs` | LinkedIn job listings |
| `workflows` | Agent workflow runs |
| `emails` | Drafted outreach messages |

## 🔧 Tools & Services

### People Finder
Uses **Apify's Exa AI People Search** to find:
- Recruiters
- Hiring managers
- Engineering managers
- Talent acquisition specialists

### Job Finder
Uses **Apify's LinkedIn Job Search** to find:
- Job listings by keywords
- Filter by location, seniority, work arrangement
- Company-specific searches

### Email Enrichment
Uses **Tomba** for:
- LinkedIn profile email lookup
- Email verification

## 📝 Example Output

```
🔍 IntroLink Agent Workflow

📄 Step 1: Processing resume...
   ✅ Resume stored

💼 Step 2: Searching jobs...
   Found 15 jobs for "Software Engineer"

👥 Step 3: Finding contacts...
   Found 3 contacts at Stripe
   Found 2 contacts at Google

✉️ Step 4: Drafting emails...
   Drafted 5 personalized emails

📊 Summary:
   Jobs Found: 15
   Contacts Found: 5
   Emails Drafted: 5
   Total Cost: $0.15
```

## 🎨 Frontend

The frontend provides a modern dashboard for:
- Uploading resumes
- Configuring job search preferences
- Viewing job results
- Managing contacts
- Reviewing drafted emails

### Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

## 📄 License

MIT
