import { useState } from 'react'
import JobCard from './JobCard'
import SearchFilters from './SearchFilters'

const workArrangements = ['All', 'Remote', 'Hybrid', 'On-site']
const seniorityLevels = ['All', 'Entry Level', 'Associate', 'Mid-Senior', 'Director', 'Executive']
const employmentTypes = ['All', 'Full-time', 'Part-time', 'Contract', 'Internship']

export default function JobFinder({ onJobsFound }) {
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('')
  const [company, setCompany] = useState('')
  const [workArrangement, setWorkArrangement] = useState('All')
  const [seniorityLevel, setSeniorityLevel] = useState('All')
  const [employmentType, setEmploymentType] = useState('All')
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [jobs, setJobs] = useState([])
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const handleSearch = async () => {
    if (!keywords.trim()) {
      setError('Please enter job keywords')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        keywords: keywords.trim(),
        limit,
        strategy: 'cheapest'
      }

      if (location.trim()) params.location = location.trim()
      if (company.trim()) params.company = company.trim()
      if (workArrangement !== 'All') params.workArrangement = workArrangement.toLowerCase()
      if (seniorityLevel !== 'All') {
        const seniorityMap = {
          'Entry Level': 'entry',
          'Associate': 'associate',
          'Mid-Senior': 'mid-senior',
          'Director': 'director',
          'Executive': 'executive'
        }
        params.seniorityLevel = seniorityMap[seniorityLevel]
      }
      if (employmentType !== 'All') params.employmentType = employmentType.toLowerCase()

      const response = await fetch('/api/job-finder/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      setJobs(data.jobs || [])
      setReceipt(data.receipt)
      if (onJobsFound && data.jobs) {
        onJobsFound(data.jobs)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white">
          Find Your Next <span className="gradient-text">Opportunity</span>
        </h1>
        <p className="text-ink-400 text-lg max-w-2xl mx-auto">
          Search LinkedIn jobs with AI-powered filtering. Pay only for the data you need via x402 protocol.
        </p>
      </div>

      {/* Search Box */}
      <div className="border-gradient p-6">
        <div className="space-y-4">
          {/* Main Search Row */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-400 mb-2">Job Title / Keywords</label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Software Engineer, Product Manager..."
                className="input-dark w-full"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-400 mb-2">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="San Francisco, Remote..."
                className="input-dark w-full"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-ink-400 mb-2">Company</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Google, Stripe, Any..."
                className="input-dark w-full"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          </div>

          {/* Toggle Filters */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-ink-400 hover:text-white transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
            {showFilters ? 'Hide Filters' : 'Show More Filters'}
          </button>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-ink-800 grid grid-cols-2 md:grid-cols-4 gap-4">
              <SearchFilters
                label="Work Arrangement"
                value={workArrangement}
                onChange={setWorkArrangement}
                options={workArrangements}
              />
              <SearchFilters
                label="Seniority Level"
                value={seniorityLevel}
                onChange={setSeniorityLevel}
                options={seniorityLevels}
              />
              <SearchFilters
                label="Employment Type"
                value={employmentType}
                onChange={setEmploymentType}
                options={employmentTypes}
              />
              <div>
                <label className="block text-sm font-medium text-ink-400 mb-2">Results Limit</label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.max(1, Math.min(100, parseInt(e.target.value) || 10)))}
                  min="1"
                  max="100"
                  className="input-dark w-full"
                />
              </div>
            </div>
          )}

          {/* Search Button */}
          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-ink-500">
              Estimated cost: <span className="text-volt-400 font-mono">~$0.02</span> per search
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !keywords.trim()}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  Searching...
                </>
              ) : (
                <>
                  <SearchIcon />
                  Search Jobs
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-signal-500/10 border border-signal-500/20 rounded-xl p-4 text-signal-400">
          {error}
        </div>
      )}

      {/* Receipt Info */}
      {receipt && (
        <div className="flex items-center justify-between p-4 bg-volt-500/5 border border-volt-500/20 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-volt-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-volt-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-white">Search Complete</div>
              <div className="text-xs text-ink-400">
                Provider: <span className="text-ink-300">{receipt.provider}</span> • 
                Cost: <span className="text-volt-400 font-mono">${receipt.amount_paid_usd?.toFixed(4)}</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-ink-400">
            {jobs.length} jobs found
          </div>
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-white">
              Job Results
            </h2>
            <span className="text-sm text-ink-400">{jobs.length} positions</span>
          </div>
          
          <div className="grid gap-4">
            {jobs.map((job, index) => (
              <div key={job.job_id || index}>
                <JobCard job={job} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && jobs.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-ink-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-ink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-ink-300 mb-2">Start Your Search</h3>
          <p className="text-ink-500 max-w-sm mx-auto">
            Enter job keywords and filters to find opportunities from LinkedIn's job listings.
          </p>
        </div>
      )}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}
