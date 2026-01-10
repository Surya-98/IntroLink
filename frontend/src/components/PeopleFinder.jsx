import { useState } from 'react'
import ContactCard from './ContactCard'

export default function PeopleFinder({ onContactsFound }) {
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')
  const [numResults, setNumResults] = useState(5)
  const [loading, setLoading] = useState(false)
  const [contacts, setContacts] = useState([])
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState(null)
  const [useCustomQuery, setUseCustomQuery] = useState(false)

  const handleSearch = async () => {
    if (!useCustomQuery && !company.trim()) {
      setError('Please enter a company name')
      return
    }
    if (useCustomQuery && !query.trim()) {
      setError('Please enter a search query')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        numResults,
        strategy: 'cheapest'
      }

      if (useCustomQuery) {
        params.query = query.trim()
      } else {
        if (company.trim()) params.company = company.trim()
        if (role.trim()) params.role = role.trim()
      }

      const response = await fetch('/api/people-finder/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })

      // Handle empty or invalid JSON responses
      const text = await response.text()
      let data
      try {
        data = text ? JSON.parse(text) : {}
      } catch (parseError) {
        console.error('Failed to parse response:', text)
        throw new Error('Server returned an invalid response. Please try again.')
      }

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      setContacts(data.contacts || [])
      setReceipt(data.receipt)
      if (onContactsFound && data.contacts) {
        onContactsFound(data.contacts)
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
          Connect with <span className="gradient-text">Key People</span>
        </h1>
        <p className="text-ink-400 text-lg max-w-2xl mx-auto">
          Find recruiters, hiring managers, and decision-makers using AI-powered search.
        </p>
      </div>

      {/* Search Box */}
      <div className="border-gradient p-6">
        <div className="space-y-4">
          {/* Search Mode Toggle */}
          <div className="flex items-center gap-4 p-1 bg-ink-900/50 rounded-xl w-fit">
            <button
              onClick={() => setUseCustomQuery(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                !useCustomQuery 
                  ? 'bg-pulse-500 text-white' 
                  : 'text-ink-400 hover:text-white'
              }`}
            >
              Company Search
            </button>
            <button
              onClick={() => setUseCustomQuery(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                useCustomQuery 
                  ? 'bg-pulse-500 text-white' 
                  : 'text-ink-400 hover:text-white'
              }`}
            >
              Custom Query
            </button>
          </div>

          {!useCustomQuery ? (
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-ink-400 mb-2">Company Name</label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Google, Stripe, Meta..."
                  className="input-dark w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-ink-400 mb-2">Target Role (Optional)</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Software Engineer, Product Manager..."
                  className="input-dark w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-ink-400 mb-2">Results</label>
                <input
                  type="number"
                  value={numResults}
                  onChange={(e) => setNumResults(Math.max(5, Math.min(20, parseInt(e.target.value) || 5)))}
                  min="5"
                  max="20"
                  className="input-dark w-full"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-ink-400 mb-2">Custom Search Query</label>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Engineering recruiter at Series A startups in SF..."
                  className="input-dark w-full"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <div className="w-32">
                <label className="block text-sm font-medium text-ink-400 mb-2">Results</label>
                <input
                  type="number"
                  value={numResults}
                  onChange={(e) => setNumResults(Math.max(5, Math.min(20, parseInt(e.target.value) || 5)))}
                  min="5"
                  max="20"
                  className="input-dark w-full"
                />
              </div>
            </div>
          )}

          {/* Helper Text */}
          <div className="flex items-start gap-2 p-3 bg-ink-900/30 rounded-xl">
            <svg className="w-5 h-5 text-pulse-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-sm text-ink-400">
              {!useCustomQuery 
                ? "We'll find recruiters, talent acquisition partners, and hiring managers at the specified company who can help with your target role."
                : "Use natural language to describe who you're looking for. Our AI will find relevant professionals matching your criteria."
              }
            </p>
          </div>

          {/* Search Button */}
          <div className="flex items-center justify-between pt-4">
            <div className="text-sm text-ink-500">
              Estimated cost: <span className="text-pulse-400 font-mono">~$0.015</span> per search
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || (!useCustomQuery && !company.trim()) || (useCustomQuery && !query.trim())}
              className="btn inline-flex items-center gap-2 bg-pulse-500 text-white hover:bg-pulse-400 px-6 py-3 rounded-xl font-medium transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  Searching...
                </>
              ) : (
                <>
                  <PeopleIcon />
                  Find People
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
        <div className="flex items-center justify-between p-4 bg-pulse-500/5 border border-pulse-500/20 rounded-xl">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-pulse-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-pulse-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-white">Search Complete</div>
              <div className="text-xs text-ink-400">
                Provider: <span className="text-ink-300">{receipt.provider}</span> • 
                Cost: <span className="text-pulse-400 font-mono">${receipt.amount_paid_usd?.toFixed(4)}</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-ink-400">
            {contacts.length} contacts found
          </div>
        </div>
      )}

      {/* Results */}
      {contacts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-white">
              People Found
            </h2>
            <span className="text-sm text-ink-400">{contacts.length} contacts</span>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {contacts.map((contact, index) => (
              <div key={contact.linkedin_url || index}>
                <ContactCard contact={contact} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && contacts.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-ink-900 flex items-center justify-center">
            <svg className="w-8 h-8 text-ink-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
              <circle cx="19" cy="7" r="3" />
              <path d="M21 21v-2a3 3 0 00-2-2.83" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-ink-300 mb-2">Find Key Contacts</h3>
          <p className="text-ink-500 max-w-sm mx-auto">
            Search for recruiters, hiring managers, and other key contacts at companies you're interested in.
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

function PeopleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 11l2 2 4-4" />
    </svg>
  )
}
