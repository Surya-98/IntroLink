# IntroLink: Your AI-Powered Job Search Agent 🚀

*Stop manually cold emailing. Let AI find the right people and craft the perfect message.*

---

## The Problem: Job Searching is Broken

If you've been through a job search recently, you know the pain:

1. **Endless scrolling** through job boards
2. **Manually researching** companies and finding the right contacts
3. **Hunting for emails** of recruiters and hiring managers
4. **Writing personalized emails** over and over (and over again)
5. **Tracking everything** in a messy spreadsheet

What if you could automate the entire outreach process while keeping it personalized and authentic?

**Enter IntroLink.**

---

## What is IntroLink?

IntroLink is an **AI-powered job search agent** that automates the tedious parts of your job hunt. Upload your resume, tell it what roles you're looking for, and watch as it:

- 🔍 **Finds relevant job postings** from LinkedIn
- 👥 **Discovers the right contacts** (recruiters, hiring managers, engineering leads)
- 📧 **Finds their email addresses** automatically
- ✉️ **Drafts personalized outreach messages** tailored to your background

All in one automated workflow.

---

## How It Works

### The Agent Workflow

IntroLink operates as an intelligent agent that orchestrates multiple tools and APIs to accomplish your goal:

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

### Step 1: Upload Your Resume

Simply drag and drop your resume (PDF, DOCX, or TXT). IntroLink extracts the text and uses it to personalize every message it drafts.

### Step 2: Define Your Target

Tell IntroLink what you're looking for:
- **Target Roles**: "Software Engineer", "Backend Developer", "Full Stack Engineer"
- **Target Companies**: "Stripe", "Google", "Airbnb" (optional)
- **Locations**: "San Francisco", "Remote", "New York"
- **Preferences**: Work arrangement, seniority level, etc.

### Step 3: Watch the Agent Work

IntroLink's agent orchestrator takes over:

1. **Searches LinkedIn** for jobs matching your criteria
2. **For each job found**, it identifies relevant contacts at that company
3. **Enriches contacts** with verified email addresses via Tomba
4. **Drafts three types of messages** using AI:
   - Professional email
   - LinkedIn InMail
   - LinkedIn connection request

All messages are personalized based on your resume and the specific job/company context.

### Step 4: Review and Send

Every drafted message lands in your dashboard, ready for review. You can:
- Edit and personalize further
- Send directly (if SMTP is configured)
- Export for manual sending
- Track sent/responded status

---

## Key Features

### 🤖 Intelligent Agent Orchestration

The heart of IntroLink is its **Agent Orchestrator** - a sophisticated pipeline that coordinates multiple services:

- Handles rate limiting and delays between API calls
- Deduplicates jobs across searches
- Tracks costs at every step
- Provides real-time progress updates
- Supports cancellation mid-workflow

### 💼 LinkedIn Job Search

Find jobs with granular filters:
- Keywords and job titles
- Location (including remote options)
- Work arrangement (on-site, hybrid, remote)
- Seniority level (entry, mid, senior, executive)
- Posted date (today, this week, this month)
- Easy Apply only

### 👥 Smart Contact Discovery

IntroLink finds the right people to reach out to:
- Recruiters and talent acquisition specialists
- Hiring managers
- Engineering managers and team leads
- Employees in relevant roles

### 📧 Email Enrichment

Automatically discovers email addresses via:
- **Tomba** - LinkedIn profile to email lookup
- **Happenstance** - Name + company enrichment

### ✨ AI-Powered Message Drafting

Using **Fireworks AI**, IntroLink generates:

**1. Professional Emails**
```
Subject: Interest in [Role] at [Company]

Hi [Name],

I came across the [Role] position at [Company] and was 
immediately drawn to [specific detail about job/company]...

[Personalized connection to resume/experience]

[Call to action]

Best,
[Your name]
```

**2. LinkedIn InMails** (with subject line, within character limits)

**3. LinkedIn Connection Requests** (within 300 character limit)

Each message references your actual experience and the specific job context - no generic templates.

### 💰 Cost Transparency

Every operation shows exactly what you paid:

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

IntroLink tracks costs per:
- Job search
- People search
- Email enrichment
- AI message generation

### 📊 Beautiful Dashboard

The modern React frontend gives you:
- Real-time workflow progress
- Activity feed showing jobs/contacts/emails as they're found
- Searchable job and contact lists
- Email preview and editing
- Cost summaries

---

## Technical Architecture

### Backend (Node.js + Express)

```
backend/
├── src/
│   ├── index.js              # Express API server
│   ├── models/
│   │   └── schemas.js        # MongoDB schemas
│   └── services/
│       ├── agentOrchestrator.js   # Workflow coordinator
│       ├── jobFinder.js           # LinkedIn job search
│       ├── peopleFinder.js        # Contact discovery
│       ├── tombaEnricher.js       # Email lookup
│       ├── emailDrafter.js        # AI email generation
│       ├── linkedinDrafter.js     # LinkedIn message generation
│       └── emailSender.js         # SMTP email sending
```

### Frontend (React + Vite + Tailwind)

```
frontend/
├── src/
│   ├── App.jsx
│   ├── components/
│   │   ├── AgentWorkflow.jsx     # Main workflow UI
│   │   ├── Dashboard.jsx         # Stats and overview
│   │   ├── JobFinder.jsx         # Manual job search
│   │   └── PeopleFinder.jsx      # Manual contact search
│   └── context/
│       ├── WorkflowContext.jsx   # State management
│       └── ThemeContext.jsx      # Dark/light mode
```

### Data Storage (MongoDB)

| Collection | Purpose |
|------------|---------|
| `workflows` | Agent workflow runs with progress |
| `resumes` | Parsed resume data |
| `jobs` | LinkedIn job listings |
| `contacts` | Found people + emails + sources |
| `emails` | Drafted messages (email + LinkedIn) |
| `receipts` | API transaction records |

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- API keys for external services

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/IntroLink.git

# Backend setup
cd IntroLink/backend
npm install
cp env.example .env
# Edit .env with your API keys

# Start backend
npm run dev

# Frontend setup (new terminal)
cd IntroLink/frontend
npm install
npm run dev
```

### Configuration

Create a `.env` file in the backend directory:

```env
# Required
MONGODB_URI=mongodb://localhost:27017/introlink

# For real job/people search (optional - uses mock data if not set)
APIFY_TOKEN=your_apify_token

# For AI-powered email drafting (required for message generation)
FIREWORKS_API_KEY=your_fireworks_key

# For email enrichment (optional)
TOMBA_API_KEY=your_tomba_key
TOMBA_API_SECRET=your_tomba_secret

# For sending emails (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=your_email@gmail.com
SENDER_NAME=Your Name
```

---

## Example Workflow Output

```
🔍 IntroLink Agent Workflow

📄 Step 1: Processing resume...
   ✅ Resume stored (4,523 characters)

💼 Step 2: Searching jobs...
   Found 15 jobs for "Software Engineer"
   ├── Senior Software Engineer at Stripe
   ├── Backend Engineer at Airbnb
   ├── Full Stack Developer at Figma
   └── ... 12 more

👥 Step 3: Finding contacts...
   Found 3 contacts at Stripe
   ├── Sarah Chen - Technical Recruiter
   ├── Mike Johnson - Engineering Manager
   └── Lisa Park - Talent Acquisition
   Found 2 contacts at Airbnb
   └── ... 

📧 Step 4: Enriching contacts...
   ✅ Found email for Sarah Chen: sarah@stripe.com
   ✅ Found email for Mike Johnson: mike.j@stripe.com

✉️ Step 5: Drafting messages...
   Drafted: Email + InMail + Connection Request for Sarah Chen
   Drafted: Email + InMail + Connection Request for Mike Johnson
   └── ... 

📊 Summary:
   Jobs Found: 15
   Contacts Found: 8
   Messages Drafted: 24 (8 emails + 8 InMails + 8 connection requests)
   Total Cost: $0.23
```

---

## Use Cases

### 🎯 Active Job Seekers

Automate your outreach to land more interviews. Instead of spending hours researching and writing emails, let IntroLink handle the grunt work while you focus on interview prep.

### 🌱 Career Changers

Breaking into a new industry? IntroLink helps you find and reach out to the right people, with messages that highlight transferable skills.

### 🎓 New Graduates

Entering the job market is overwhelming. IntroLink streamlines the process of finding entry-level roles and connecting with recruiters.

### 📈 Passive Candidates

Even if you're not actively looking, IntroLink can help you explore opportunities and build relationships with recruiters in your target companies.

---

## Privacy & Ethics

- **Your data stays local**: Resume and emails are stored in your own MongoDB instance
- **No spam**: Messages are designed for genuine, personalized outreach
- **Transparent**: Every API call and cost is logged and visible
- **You control sending**: Emails are drafted, not sent automatically (unless you configure SMTP)

---

## What's Next?

IntroLink is actively being developed. Planned features include:

- [ ] Chrome extension for one-click job imports
- [ ] CRM-style pipeline tracking
- [ ] Follow-up sequence automation
- [ ] Calendar integration for interview scheduling
- [ ] Analytics dashboard with response rate tracking
- [ ] Multi-user support with team features

---

## Contributing

IntroLink is open source! Contributions welcome:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## License

MIT License - Use it, modify it, make it your own.

---

## Try IntroLink Today

Stop spending hours on manual outreach. Let IntroLink's AI agent do the heavy lifting while you focus on what matters - landing your dream job.

**[Get Started →](https://github.com/yourusername/IntroLink)**

---

*Built with ❤️ for job seekers everywhere.*
