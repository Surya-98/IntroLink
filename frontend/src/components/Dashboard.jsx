import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import JobCard from './JobCard'
import ContactCard from './ContactCard'

export default function Dashboard({ jobs: propJobs, contacts: propContacts }) {
  const [jobs, setJobs] = useState(propJobs || [])
  const [contacts, setContacts] = useState(propContacts || [])
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('overview')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [jobsRes, contactsRes, receiptsRes] = await Promise.all([
        fetch('/api/jobs').then(r => r.json()),
        fetch('/api/contacts').then(r => r.json()),
        fetch('/api/receipts').then(r => r.json())
      ])
      
      setJobs(jobsRes.jobs || [])
      setContacts(contactsRes.contacts || [])
      setReceipts(receiptsRes.receipts || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const totalSpent = receipts.reduce((sum, r) => sum + (r.amount_paid_usd || 0), 0)

  const stats = [
    { label: 'Jobs Found', value: jobs.length, icon: JobIcon, color: 'volt' },
    { label: 'Contacts Found', value: contacts.length, icon: PeopleIcon, color: 'pulse' },
    { label: 'Total Searches', value: receipts.length, icon: SearchIcon, color: 'ink' },
    { label: 'Total Spent', value: `$${totalSpent.toFixed(4)}`, icon: CostIcon, color: 'signal' },
  ]

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div 
        className="text-center space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-4xl md:text-5xl font-bold text-white">
          Your <span className="gradient-text">Dashboard</span>
        </h1>
        <p className="text-ink-400 text-lg max-w-2xl mx-auto">
          Track your job searches, contacts, and spending with full transparency.
        </p>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`p-6 rounded-2xl bg-ink-950 border border-ink-800 card-hover`}
          >
            <div className={`w-10 h-10 rounded-xl bg-${stat.color}-500/10 flex items-center justify-center mb-4`}>
              <stat.icon className={`w-5 h-5 text-${stat.color}-400`} />
            </div>
            <div className="text-2xl font-display font-bold text-white mb-1">
              {loading ? '...' : stat.value}
            </div>
            <div className="text-sm text-ink-400">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 p-1 bg-ink-900/50 rounded-xl w-fit">
        {['overview', 'jobs', 'contacts', 'receipts'].map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
              activeView === view 
                ? 'bg-ink-700 text-white' 
                : 'text-ink-400 hover:text-white'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {activeView === 'overview' && (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Recent Jobs */}
            <div className="space-y-4">
              <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <JobIcon className="w-5 h-5 text-volt-400" />
                Recent Jobs
              </h3>
              {loading ? (
                <LoadingCards count={3} />
              ) : jobs.length > 0 ? (
                <div className="space-y-3">
                  {jobs.slice(0, 5).map((job, i) => (
                    <JobCard key={job._id || i} job={job} compact />
                  ))}
                </div>
              ) : (
                <EmptyState message="No jobs found yet" />
              )}
            </div>

            {/* Recent Contacts */}
            <div className="space-y-4">
              <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <PeopleIcon className="w-5 h-5 text-pulse-400" />
                Recent Contacts
              </h3>
              {loading ? (
                <LoadingCards count={3} />
              ) : contacts.length > 0 ? (
                <div className="space-y-3">
                  {contacts.slice(0, 5).map((contact, i) => (
                    <ContactCard key={contact._id || i} contact={contact} compact />
                  ))}
                </div>
              ) : (
                <EmptyState message="No contacts found yet" />
              )}
            </div>
          </div>
        )}

        {activeView === 'jobs' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingCards count={6} />
            ) : jobs.length > 0 ? (
              <div className="grid gap-4">
                {jobs.map((job, i) => (
                  <JobCard key={job._id || i} job={job} />
                ))}
              </div>
            ) : (
              <EmptyState message="No jobs saved yet. Search for jobs to see them here." />
            )}
          </div>
        )}

        {activeView === 'contacts' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingCards count={6} />
            ) : contacts.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {contacts.map((contact, i) => (
                  <ContactCard key={contact._id || i} contact={contact} />
                ))}
              </div>
            ) : (
              <EmptyState message="No contacts saved yet. Search for people to see them here." />
            )}
          </div>
        )}

        {activeView === 'receipts' && (
          <div className="space-y-4">
            {loading ? (
              <LoadingCards count={4} />
            ) : receipts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm text-ink-400 border-b border-ink-800">
                      <th className="pb-3 font-medium">Transaction ID</th>
                      <th className="pb-3 font-medium">Provider</th>
                      <th className="pb-3 font-medium">Tool</th>
                      <th className="pb-3 font-medium">Amount</th>
                      <th className="pb-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipts.map((receipt, i) => (
                      <tr
                        key={receipt._id || i}
                        className="border-b border-ink-900 text-sm"
                      >
                        <td className="py-4 font-mono text-xs text-ink-300">
                          {receipt.transaction_id?.slice(0, 16)}...
                        </td>
                        <td className="py-4 text-ink-300">{receipt.provider}</td>
                        <td className="py-4 text-white">{receipt.tool_name}</td>
                        <td className="py-4 font-mono text-volt-400">
                          ${receipt.amount_paid_usd?.toFixed(4)}
                        </td>
                        <td className="py-4 text-ink-400">
                          {new Date(receipt.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No receipts yet. Complete a search to see transaction history." />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingCards({ count }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-ink-900 shimmer" />
      ))}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-12 px-6 rounded-2xl bg-ink-950 border border-ink-800">
      <p className="text-ink-500">{message}</p>
    </div>
  )
}

function JobIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
    </svg>
  )
}

function PeopleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  )
}

function CostIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}

