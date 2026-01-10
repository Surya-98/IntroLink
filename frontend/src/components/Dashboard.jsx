import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useWorkflow } from '../context/WorkflowContext'
import JobCard from './JobCard'
import ContactCard from './ContactCard'

export default function Dashboard({ jobs: propJobs, contacts: propContacts, onNavigateToAgent }) {
  const [jobs, setJobs] = useState(propJobs || [])
  const [contacts, setContacts] = useState(propContacts || [])
  const [receipts, setReceipts] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState('workflows')

  const { activeWorkflowId, isWorkflowRunning, resumeWorkflow } = useWorkflow()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [jobsRes, contactsRes, receiptsRes, workflowsRes] = await Promise.all([
        fetch('/api/jobs').then(r => r.json()),
        fetch('/api/contacts').then(r => r.json()),
        fetch('/api/receipts').then(r => r.json()),
        fetch('/api/agent/workflows?limit=50').then(r => r.json())
      ])
      
      setJobs(jobsRes.jobs || [])
      setContacts(contactsRes.contacts || [])
      setReceipts(receiptsRes.receipts || [])
      setWorkflows(workflowsRes.workflows || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewWorkflow = async (workflowId) => {
    await resumeWorkflow(workflowId)
    onNavigateToAgent?.()
  }

  const totalSpent = receipts.reduce((sum, r) => sum + (r.amount_paid_usd || 0), 0)
  const totalWorkflowSpent = workflows.reduce((sum, w) => sum + (w.total_cost_usd || 0), 0)

  const stats = [
    { label: 'Workflows', value: workflows.length, icon: WorkflowIcon, color: 'signal' },
    { label: 'Jobs Found', value: jobs.length, icon: JobIcon, color: 'volt' },
    { label: 'Contacts Found', value: contacts.length, icon: PeopleIcon, color: 'pulse' },
    { label: 'Total Spent', value: `$${(totalSpent + totalWorkflowSpent).toFixed(4)}`, icon: CostIcon, color: 'ink' },
  ]

  const getStatusBadge = (status) => {
    const badges = {
      'pending': 'tag-gray',
      'parsing_resume': 'tag-purple',
      'searching_jobs': 'tag-blue',
      'finding_contacts': 'tag-purple',
      'drafting_emails': 'tag-volt',
      'completed': 'tag-green',
      'failed': 'tag-red',
      'cancelled': 'tag-gray'
    }
    return badges[status] || 'tag-gray'
  }

  const getStatusLabel = (status) => {
    const labels = {
      'pending': 'Pending',
      'parsing_resume': 'Parsing Resume',
      'searching_jobs': 'Searching Jobs',
      'finding_contacts': 'Finding Contacts',
      'drafting_emails': 'Drafting Emails',
      'completed': 'Completed',
      'failed': 'Failed',
      'cancelled': 'Cancelled'
    }
    return labels[status] || status
  }

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
          Track your workflows, job searches, contacts, and spending with full transparency.
        </p>
      </motion.div>

      {/* Active Workflow Banner */}
      {isWorkflowRunning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-volt-500/10 border border-volt-500/30 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-volt-400 rounded-full animate-pulse" />
            <span className="text-volt-400 font-medium">Agent workflow is running</span>
          </div>
          <button
            onClick={onNavigateToAgent}
            className="btn-primary text-sm"
          >
            View Progress →
          </button>
        </motion.div>
      )}

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
        {['workflows', 'jobs', 'contacts', 'receipts'].map((view) => (
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
        {/* Workflows View */}
        {activeView === 'workflows' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <WorkflowIcon className="w-5 h-5 text-signal-400" />
                Agent Workflows
              </h3>
              <button
                onClick={fetchData}
                className="btn-ghost text-sm"
              >
                <RefreshIcon className="w-4 h-4" />
                Refresh
              </button>
            </div>
            
            {loading ? (
              <LoadingCards count={4} />
            ) : workflows.length > 0 ? (
              <div className="space-y-3">
                {workflows.map((workflow, i) => (
                  <WorkflowCard 
                    key={workflow._id || i} 
                    workflow={workflow}
                    isActive={workflow._id === activeWorkflowId}
                    onView={() => handleViewWorkflow(workflow._id)}
                    getStatusBadge={getStatusBadge}
                    getStatusLabel={getStatusLabel}
                  />
                ))}
              </div>
            ) : (
              <EmptyState message="No workflows yet. Start an agent workflow to see it here." />
            )}
          </div>
        )}

        {activeView === 'jobs' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <JobIcon className="w-5 h-5 text-volt-400" />
              All Jobs
            </h3>
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
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <PeopleIcon className="w-5 h-5 text-pulse-400" />
              All Contacts
            </h3>
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
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <CostIcon className="w-5 h-5 text-ink-400" />
              Transaction History
            </h3>
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

function WorkflowCard({ workflow, isActive, onView, getStatusBadge, getStatusLabel }) {
  const isRunning = workflow.status && !['completed', 'failed', 'cancelled'].includes(workflow.status)
  
  return (
    <motion.div
      whileHover={{ scale: 1.005 }}
      className={`p-5 rounded-xl bg-ink-950 border transition-all cursor-pointer ${
        isActive ? 'border-volt-500/50' : 'border-ink-800 hover:border-ink-700'
      }`}
      onClick={onView}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span className={`${getStatusBadge(workflow.status)} text-xs`}>
              {getStatusLabel(workflow.status)}
            </span>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-volt-400">
                <span className="w-2 h-2 bg-volt-400 rounded-full animate-pulse" />
                Running
              </span>
            )}
            {isActive && !isRunning && (
              <span className="text-xs text-ink-500">Currently viewing</span>
            )}
          </div>
          
          <div className="text-white font-medium">
            {workflow.target_roles?.join(', ') || 'No roles specified'}
          </div>
          
          {workflow.target_companies?.length > 0 && (
            <div className="text-sm text-ink-400">
              Companies: {workflow.target_companies.join(', ')}
            </div>
          )}

          <div className="flex items-center gap-4 text-sm text-ink-500 mt-2">
            <span>{workflow.progress?.total_jobs_found || 0} jobs</span>
            <span>{workflow.progress?.total_contacts_found || 0} contacts</span>
            <span>{workflow.progress?.total_emails_drafted || 0} emails</span>
            {workflow.total_cost_usd > 0 && (
              <span className="font-mono text-volt-400">${workflow.total_cost_usd.toFixed(4)}</span>
            )}
          </div>
        </div>

        <div className="text-right space-y-2">
          <div className="text-xs text-ink-500">
            {new Date(workflow.created_at).toLocaleDateString()}
          </div>
          <div className="text-xs text-ink-500">
            {new Date(workflow.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <ChevronRightIcon className="w-5 h-5 text-ink-500 ml-auto" />
        </div>
      </div>

      {/* Progress bar for running workflows */}
      {isRunning && workflow.progress && (
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-ink-400">
            <span>{workflow.progress.current_step}</span>
            <span>{workflow.progress.roles_completed || 0} / {workflow.progress.total_roles || 0} roles</span>
          </div>
          <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-volt-500 to-pulse-500"
              initial={{ width: 0 }}
              animate={{ 
                width: `${((workflow.progress.roles_completed || 0) / (workflow.progress.total_roles || 1)) * 100}%` 
              }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}
    </motion.div>
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

function WorkflowIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
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

function CostIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}

function RefreshIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
