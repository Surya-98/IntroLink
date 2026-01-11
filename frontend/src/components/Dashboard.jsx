import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkflow } from '../context/WorkflowContext'
import { useTheme } from '../context/ThemeContext'
import JobCard from './JobCard'
import ContactCard from './ContactCard'

export default function Dashboard({ jobs: propJobs, contacts: propContacts, onNavigateToAgent }) {
  const { isDark } = useTheme()
  const [jobs, setJobs] = useState(propJobs || [])
  const [contacts, setContacts] = useState(propContacts || [])
  const [receipts, setReceipts] = useState([])
  const [workflows, setWorkflows] = useState([])
  const [stats, setStats] = useState({ jobs: 0, contacts: 0, receipts: 0, totalSpent: 0 })
  
  // Separate loading states for lazy loading
  const [loadingWorkflows, setLoadingWorkflows] = useState(true)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [loadedSections, setLoadedSections] = useState({ workflows: false, jobs: false, contacts: false, receipts: false })
  
  const [activeView, setActiveView] = useState('workflows')
  
  // Workflow detail view states
  const [selectedWorkflow, setSelectedWorkflow] = useState(null)
  const [workflowDetails, setWorkflowDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailView, setDetailView] = useState('overview') // 'overview', 'job', 'contact'
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)

  const { activeWorkflowId, isWorkflowRunning, resumeWorkflow } = useWorkflow()

  // Fetch workflows on mount (default view)
  useEffect(() => {
    fetchWorkflows()
    fetchStats()
  }, [])

  // Lazy load data when view changes
  useEffect(() => {
    if (activeView === 'jobs' && !loadedSections.jobs) {
      fetchJobs()
    } else if (activeView === 'contacts' && !loadedSections.contacts) {
      fetchContacts()
    } else if (activeView === 'receipts' && !loadedSections.receipts) {
      fetchReceipts()
    }
  }, [activeView, loadedSections])

  const fetchStats = async () => {
    try {
      // Fetch just counts for stats - much faster
      const res = await fetch('/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchWorkflows = async () => {
    setLoadingWorkflows(true)
    try {
      const res = await fetch('/api/agent/workflows?limit=20')
      const data = await res.json()
      setWorkflows(data.workflows || [])
      setLoadedSections(prev => ({ ...prev, workflows: true }))
    } catch (error) {
      console.error('Failed to fetch workflows:', error)
    } finally {
      setLoadingWorkflows(false)
    }
  }

  const fetchJobs = async () => {
    setLoadingJobs(true)
    try {
      const res = await fetch('/api/jobs?limit=50')
      const data = await res.json()
      setJobs(data.jobs || [])
      setLoadedSections(prev => ({ ...prev, jobs: true }))
    } catch (error) {
      console.error('Failed to fetch jobs:', error)
    } finally {
      setLoadingJobs(false)
    }
  }

  const fetchContacts = async () => {
    setLoadingContacts(true)
    try {
      const res = await fetch('/api/contacts?limit=50')
      const data = await res.json()
      setContacts(data.contacts || [])
      setLoadedSections(prev => ({ ...prev, contacts: true }))
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const fetchReceipts = async () => {
    setLoadingReceipts(true)
    try {
      const res = await fetch('/api/receipts?limit=30')
      const data = await res.json()
      setReceipts(data.receipts || [])
      setLoadedSections(prev => ({ ...prev, receipts: true }))
    } catch (error) {
      console.error('Failed to fetch receipts:', error)
    } finally {
      setLoadingReceipts(false)
    }
  }

  const refreshCurrentView = useCallback(() => {
    if (activeView === 'workflows') fetchWorkflows()
    else if (activeView === 'jobs') fetchJobs()
    else if (activeView === 'contacts') fetchContacts()
    else if (activeView === 'receipts') fetchReceipts()
    fetchStats()
  }, [activeView])

  const fetchWorkflowDetails = async (workflowId) => {
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/agent/results/${workflowId}`)
      if (res.ok) {
        const data = await res.json()
        setWorkflowDetails(data)
      }
    } catch (error) {
      console.error('Failed to fetch workflow details:', error)
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleViewWorkflow = async (workflow) => {
    setSelectedWorkflow(workflow)
    setDetailView('overview')
    setSelectedJob(null)
    setSelectedContact(null)
    await fetchWorkflowDetails(workflow._id)
  }

  const handleBackToList = () => {
    setSelectedWorkflow(null)
    setWorkflowDetails(null)
    setDetailView('overview')
    setSelectedJob(null)
    setSelectedContact(null)
  }

  const handleSelectJob = (job) => {
    setSelectedJob(job)
    setDetailView('job')
    setSelectedContact(null)
  }

  const handleSelectContact = (contact) => {
    setSelectedContact(contact)
    setDetailView('contact')
  }

  const handleBackToOverview = () => {
    setDetailView('overview')
    setSelectedJob(null)
    setSelectedContact(null)
  }

  const handleBackToJob = () => {
    setDetailView('job')
    setSelectedContact(null)
  }

  const totalWorkflowSpent = workflows.reduce((sum, w) => sum + (w.total_cost_usd || 0), 0)

  const statItems = [
    { label: 'Workflows', value: workflows.length || stats.workflows || 0, icon: WorkflowIcon, color: 'signal' },
    { label: 'Jobs Found', value: stats.jobs || jobs.length || 0, icon: JobIcon, color: 'volt' },
    { label: 'Contacts Found', value: stats.contacts || contacts.length || 0, icon: PeopleIcon, color: 'pulse' },
    { label: 'Total Spent', value: `$${(stats.totalSpent || totalWorkflowSpent).toFixed(4)}`, icon: CostIcon, color: 'ink' },
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
        className="text-center space-y-4 relative"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Subtle background glow */}
        <div className="absolute inset-0 -z-10">
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[200px] bg-gradient-to-r ${isDark ? 'from-volt-500/10 via-pulse-500/5 to-signal-500/10' : 'from-volt-500/20 via-pulse-500/10 to-signal-500/20'} rounded-full blur-3xl`} />
        </div>
        
        <h1 className={`font-display text-4xl md:text-5xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Your <span className="gradient-text">Dashboard</span>
        </h1>
        <p className={`text-lg max-w-2xl mx-auto ${isDark ? 'text-ink-400' : 'text-slate-500'}`}>
          Track your workflows, job searches, contacts, and spending with full transparency.
        </p>
      </motion.div>

      {/* Active Workflow Banner */}
      {isWorkflowRunning && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative p-5 rounded-2xl bg-gradient-to-r from-volt-500/10 via-volt-500/5 to-pulse-500/10 border border-volt-500/30 flex items-center justify-between overflow-hidden"
        >
          {/* Animated background */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-volt-500/5 to-transparent animate-shimmer" />
          
          <div className="relative flex items-center gap-4">
            <div className="relative">
              <div className="w-10 h-10 bg-volt-500/20 rounded-xl flex items-center justify-center">
                <WorkflowIcon className="w-5 h-5 text-volt-400" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-volt-400 rounded-full animate-pulse" />
            </div>
            <div>
              <span className="text-white font-semibold block">Agent Workflow Running</span>
              <span className="text-volt-400/70 text-sm">Your job search is in progress</span>
            </div>
          </div>
          <motion.button
            onClick={onNavigateToAgent}
            className="relative btn-primary text-sm"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            View Progress
            <ChevronRightIcon className="w-4 h-4" />
          </motion.button>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statItems.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={`group relative p-6 rounded-2xl overflow-hidden transition-colors ${
              isDark 
                ? 'bg-gradient-to-br from-ink-950 to-ink-900 border border-ink-800/50' 
                : 'bg-white border border-slate-200 shadow-sm'
            }`}
          >
            {/* Subtle gradient glow on hover */}
            <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-${stat.color}-500/10 to-transparent`} />
            
            <div className="relative z-10">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-${stat.color}-500/20 to-${stat.color}-500/5 flex items-center justify-center mb-4 ring-1 ring-${stat.color}-500/20`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-500`} />
              </div>
              <motion.div 
                className={`text-3xl font-display font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}
                key={stat.value}
                initial={{ scale: 0.9, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                {stat.value}
              </motion.div>
              <div className={`text-sm font-medium ${isDark ? 'text-ink-400' : 'text-slate-500'}`}>{stat.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* View Toggle */}
      <div className={`flex items-center gap-1 p-1.5 backdrop-blur-sm rounded-2xl w-fit transition-colors ${
        isDark 
          ? 'bg-ink-900/80 border border-ink-800/50' 
          : 'bg-slate-100 border border-slate-200'
      }`}>
        {[
          { id: 'workflows', icon: WorkflowIcon, label: 'Workflows' },
          { id: 'jobs', icon: JobIcon, label: 'Jobs' },
          { id: 'contacts', icon: PeopleIcon, label: 'Contacts' },
          { id: 'receipts', icon: CostIcon, label: 'Receipts' }
        ].map((view) => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              activeView === view.id 
                ? 'text-ink-950' 
                : isDark ? 'text-ink-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {activeView === view.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-gradient-to-r from-volt-400 to-volt-500 rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              <view.icon className="w-4 h-4" />
              {view.label}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {/* Workflows View */}
        {activeView === 'workflows' && (
          <AnimatePresence mode="wait">
            {selectedWorkflow ? (
              <WorkflowDetailView
                key="detail"
                workflow={selectedWorkflow}
                details={workflowDetails}
                loading={loadingDetails}
                detailView={detailView}
                selectedJob={selectedJob}
                selectedContact={selectedContact}
                onBack={handleBackToList}
                onBackToOverview={handleBackToOverview}
                onBackToJob={handleBackToJob}
                onSelectJob={handleSelectJob}
                onSelectContact={handleSelectContact}
                onRefresh={() => fetchWorkflowDetails(selectedWorkflow._id)}
                getStatusBadge={getStatusBadge}
                getStatusLabel={getStatusLabel}
                isDark={isDark}
              />
            ) : (
              <motion.div 
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                    <WorkflowIcon className="w-5 h-5 text-signal-400" />
                    Agent Workflows
                  </h3>
                  <button
                    onClick={refreshCurrentView}
                    className="btn-ghost text-sm"
                  >
                    <RefreshIcon className="w-4 h-4" />
                    Refresh
                  </button>
                </div>
                
                {loadingWorkflows ? (
                  <LoadingCards count={4} isDark={isDark} />
                ) : workflows.length > 0 ? (
                  <div className="space-y-3">
                    {workflows.map((workflow, i) => (
                      <WorkflowCard 
                        key={workflow._id || i} 
                        workflow={workflow}
                        isActive={workflow._id === activeWorkflowId}
                        onView={() => handleViewWorkflow(workflow)}
                        getStatusBadge={getStatusBadge}
                        getStatusLabel={getStatusLabel}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState message="Start an agent workflow to see your job search campaigns here." icon={WorkflowIcon} isDark={isDark} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {activeView === 'jobs' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <JobIcon className="w-5 h-5 text-volt-400" />
              All Jobs
            </h3>
            {loadingJobs ? (
              <LoadingCards count={6} isDark={isDark} />
            ) : jobs.length > 0 ? (
              <div className="grid gap-4">
                {jobs.map((job, i) => (
                  <JobCard key={job._id || i} job={job} />
                ))}
              </div>
            ) : (
              <EmptyState message="Search for jobs to see them here." icon={JobIcon} isDark={isDark} />
            )}
          </div>
        )}

        {activeView === 'contacts' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <PeopleIcon className="w-5 h-5 text-pulse-400" />
              All Contacts
            </h3>
            {loadingContacts ? (
              <LoadingCards count={6} isDark={isDark} />
            ) : contacts.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-4">
                {contacts.map((contact, i) => (
                  <ContactCard key={contact._id || i} contact={contact} />
                ))}
              </div>
            ) : (
              <EmptyState message="Search for people to see them here." icon={PeopleIcon} isDark={isDark} />
            )}
          </div>
        )}

        {activeView === 'receipts' && (
          <div className="space-y-4">
            <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <CostIcon className="w-5 h-5 text-ink-400" />
              Transaction History
            </h3>
            {loadingReceipts ? (
              <LoadingCards count={4} isDark={isDark} />
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
              <EmptyState message="Complete a search to see transaction history." icon={CostIcon} isDark={isDark} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WorkflowCard({ workflow, isActive, onView, getStatusBadge, getStatusLabel, isDark }) {
  const isRunning = workflow.status && !['completed', 'failed', 'cancelled'].includes(workflow.status)
  
  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.995 }}
      className={`group relative p-6 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
        isActive 
          ? isDark
            ? 'bg-gradient-to-br from-volt-500/10 to-ink-950 border-2 border-volt-500/50 shadow-lg shadow-volt-500/10'
            : 'bg-gradient-to-br from-volt-500/5 to-white border-2 border-volt-500/50 shadow-lg shadow-volt-500/10'
          : isDark 
            ? 'bg-gradient-to-br from-ink-900 to-ink-950 border border-ink-800 hover:border-ink-700'
            : 'bg-white border border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
      onClick={onView}
    >
      {/* Animated background for running workflows */}
      {isRunning && (
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-volt-500/5 to-transparent animate-shimmer" />
        </div>
      )}

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`${getStatusBadge(workflow.status)} text-xs font-semibold`}>
                {isRunning && <span className="inline-block w-2 h-2 bg-current rounded-full mr-1.5 animate-pulse" />}
                {getStatusLabel(workflow.status)}
              </span>
              {isActive && !isRunning && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'text-volt-400/70 bg-volt-500/10' : 'text-green-700 bg-green-50'}`}>
                  Active
                </span>
              )}
            </div>
            
            <h3 className={`text-lg font-display font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {workflow.target_roles?.join(', ') || 'Job Search'}
            </h3>
            
            {workflow.target_companies?.length > 0 && (
              <p className={`text-sm flex items-center gap-1.5 ${isDark ? 'text-ink-400' : 'text-slate-500'}`}>
                <BuildingIcon className="w-3.5 h-3.5" />
                {workflow.target_companies.slice(0, 3).join(', ')}
                {workflow.target_companies.length > 3 && ` +${workflow.target_companies.length - 3}`}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className={`text-xs px-2 py-1 rounded-lg ${isDark ? 'text-ink-500 bg-ink-900/50' : 'text-slate-500 bg-slate-100'}`}>
              {new Date(workflow.created_at).toLocaleDateString('en-US', { 
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
              })}
            </div>
            <motion.div 
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                isDark 
                  ? 'bg-ink-800/50 group-hover:bg-volt-500/20' 
                  : 'bg-slate-100 group-hover:bg-volt-500/20'
              }`}
              whileHover={{ scale: 1.1 }}
            >
              <ChevronRightIcon className={`w-5 h-5 group-hover:text-volt-500 transition-colors ${isDark ? 'text-ink-400' : 'text-slate-400'}`} />
            </motion.div>
          </div>
        </div>

        {/* Stats Row */}
        <div className={`flex items-center gap-6 pt-4 border-t ${isDark ? 'border-ink-800/50' : 'border-slate-100'}`}>
          <MiniStat icon={JobIcon} value={workflow.progress?.total_jobs_found || 0} label="Jobs" color="volt" isDark={isDark} />
          <MiniStat icon={PeopleIcon} value={workflow.progress?.total_contacts_found || 0} label="Contacts" color="pulse" isDark={isDark} />
          <MiniStat icon={MailIcon} value={workflow.progress?.total_emails_drafted || 0} label="Emails" color="signal" isDark={isDark} />
          {workflow.total_cost_usd > 0 && (
            <div className="ml-auto">
              <span className={`text-sm font-mono px-3 py-1.5 rounded-lg ${
                isDark ? 'text-volt-400 bg-volt-500/10' : 'text-green-700 bg-green-50'
              }`}>
                ${workflow.total_cost_usd.toFixed(4)}
              </span>
            </div>
          )}
        </div>

        {/* Progress bar for running workflows */}
        {isRunning && workflow.progress && (
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className={`flex items-center gap-1.5 ${isDark ? 'text-ink-400' : 'text-slate-500'}`}>
                <span className="w-1.5 h-1.5 bg-volt-400 rounded-full animate-pulse" />
                {workflow.progress.current_step}
              </span>
              <span className={isDark ? 'text-ink-500' : 'text-slate-400'}>
                {workflow.progress.roles_completed || 0} / {workflow.progress.total_roles || 0} roles
              </span>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-ink-800' : 'bg-slate-200'}`}>
              <motion.div
                className="h-full bg-gradient-to-r from-volt-500 via-volt-400 to-pulse-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ 
                  width: `${((workflow.progress.roles_completed || 0) / (workflow.progress.total_roles || 1)) * 100}%` 
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function MiniStat({ icon: Icon, value, label, color, isDark = true }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-lg bg-${color}-500/10 flex items-center justify-center`}>
        <Icon className={`w-4 h-4 text-${color}-500`} />
      </div>
      <div>
        <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</div>
        <div className={`text-xs ${isDark ? 'text-ink-500' : 'text-slate-500'}`}>{label}</div>
      </div>
    </div>
  )
}

function LoadingCards({ count, isDark = true }) {
  return (
    <div className="space-y-4">
      {[...Array(count)].map((_, i) => (
        <div 
          key={i} 
          className={`h-32 rounded-2xl overflow-hidden ${
            isDark 
              ? 'bg-gradient-to-br from-ink-900 to-ink-950 border border-ink-800/50' 
              : 'bg-slate-100 border border-slate-200'
          }`}
        >
          <div className="h-full w-full shimmer" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ message, icon: Icon = WorkflowIcon, isDark = true }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-16 px-8 rounded-3xl border-dashed ${
        isDark 
          ? 'bg-gradient-to-b from-ink-900/50 to-ink-950 border border-ink-800/50' 
          : 'bg-slate-50 border border-slate-200'
      }`}
    >
      <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
        isDark ? 'bg-ink-800/50' : 'bg-slate-200'
      }`}>
        <Icon className={`w-8 h-8 ${isDark ? 'text-ink-600' : 'text-slate-400'}`} />
      </div>
      <p className={`text-lg font-medium mb-2 ${isDark ? 'text-ink-400' : 'text-slate-600'}`}>Nothing here yet</p>
      <p className={`text-sm max-w-xs mx-auto ${isDark ? 'text-ink-500' : 'text-slate-500'}`}>{message}</p>
    </motion.div>
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

function BuildingIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
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

function ChevronLeftIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function MailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 7L2 7" />
    </svg>
  )
}

function CopyIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}

function CheckIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

function LinkedInIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  )
}

function WorkflowDetailView({ 
  workflow, 
  details, 
  loading, 
  detailView,
  selectedJob,
  selectedContact,
  onBack, 
  onBackToOverview,
  onBackToJob,
  onSelectJob,
  onSelectContact,
  onRefresh,
  getStatusBadge, 
  getStatusLabel,
  isDark = true
}) {
  const [copiedSubject, setCopiedSubject] = useState(false)
  const [copiedBody, setCopiedBody] = useState(false)

  const copyToClipboard = async (text, type) => {
    await navigator.clipboard.writeText(text)
    if (type === 'subject') {
      setCopiedSubject(true)
      setTimeout(() => setCopiedSubject(false), 2000)
    } else {
      setCopiedBody(true)
      setTimeout(() => setCopiedBody(false), 2000)
    }
  }

  // Get jobs from details
  const jobs = details?.jobs || []
  
  // Get contacts for selected job
  const jobContacts = selectedJob 
    ? (details?.contacts || []).filter(c => c.job_id === selectedJob._id || c.job_id?.toString() === selectedJob._id?.toString())
    : []

  // Get email for selected contact
  const contactEmail = selectedContact 
    ? (details?.emails || []).find(e => e.contact_id === selectedContact._id || e.contact_id?.toString() === selectedContact._id?.toString())
    : null

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-ink-400 hover:text-white transition-colors">
          Workflows
        </button>
        <ChevronRightIcon className="w-4 h-4 text-ink-600" />
        <button 
          onClick={onBackToOverview}
          className={`transition-colors ${detailView === 'overview' ? 'text-white' : 'text-ink-400 hover:text-white'}`}
        >
          {workflow.target_roles?.[0] || 'Workflow'}
        </button>
        {selectedJob && (
          <>
            <ChevronRightIcon className="w-4 h-4 text-ink-600" />
            <button 
              onClick={onBackToJob}
              className={`transition-colors ${detailView === 'job' ? 'text-white' : 'text-ink-400 hover:text-white'}`}
            >
              {selectedJob.company_name || 'Job'}
            </button>
          </>
        )}
        {selectedContact && (
          <>
            <ChevronRightIcon className="w-4 h-4 text-ink-600" />
            <span className="text-white">{selectedContact.name}</span>
          </>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <button 
          onClick={detailView === 'contact' ? onBackToJob : detailView === 'job' ? onBackToOverview : onBack}
          className="flex items-center gap-2 text-ink-400 hover:text-white transition-colors"
        >
          <ChevronLeftIcon className="w-5 h-5" />
          Back
        </button>
        <button onClick={onRefresh} className="btn-ghost text-sm">
          <RefreshIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {loading ? (
        <LoadingCards count={4} isDark={isDark} />
      ) : detailView === 'overview' ? (
        /* Overview - Show Workflow Summary and Jobs */
        <div className="space-y-6">
          {/* Workflow Summary Card */}
          <div className="p-6 rounded-xl bg-ink-950 border border-ink-800">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className={`${getStatusBadge(workflow.status)} text-xs`}>
                  {getStatusLabel(workflow.status)}
                </span>
                <h2 className="text-xl font-display font-bold text-white mt-2">
                  {workflow.target_roles?.join(', ') || 'Job Search Workflow'}
                </h2>
                {workflow.target_companies?.length > 0 && (
                  <p className="text-ink-400 mt-1">
                    Companies: {workflow.target_companies.join(', ')}
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-ink-500">
                <div>{new Date(workflow.created_at).toLocaleDateString()}</div>
                <div>{new Date(workflow.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-ink-800">
              <div className="text-center">
                <div className="text-2xl font-bold text-volt-400">{jobs.length}</div>
                <div className="text-xs text-ink-500">Jobs Found</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pulse-400">{details?.contacts?.length || 0}</div>
                <div className="text-xs text-ink-500">Contacts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-signal-400">{details?.emails?.length || 0}</div>
                <div className="text-xs text-ink-500">Emails Drafted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold font-mono text-white">
                  ${(workflow.total_cost_usd || 0).toFixed(4)}
                </div>
                <div className="text-xs text-ink-500">Total Cost</div>
              </div>
            </div>
          </div>

          {/* Jobs List */}
          <div>
            <h3 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <JobIcon className="w-5 h-5 text-volt-400" />
              Jobs Found ({jobs.length})
            </h3>
            {jobs.length > 0 ? (
              <div className="grid gap-3">
                {jobs.map((job, i) => {
                  const jobContactCount = (details?.contacts || []).filter(
                    c => c.job_id === job._id || c.job_id?.toString() === job._id?.toString()
                  ).length
                  const jobEmailCount = (details?.emails || []).filter(e => {
                    const contact = (details?.contacts || []).find(
                      c => c._id === e.contact_id || c._id?.toString() === e.contact_id?.toString()
                    )
                    return contact && (contact.job_id === job._id || contact.job_id?.toString() === job._id?.toString())
                  }).length

                  return (
                    <motion.div
                      key={job._id || i}
                      whileHover={{ scale: 1.005 }}
                      onClick={() => onSelectJob(job)}
                      className="p-4 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-white">{job.title}</div>
                          <div className="text-sm text-volt-400">{job.company_name}</div>
                          {job.location && (
                            <div className="text-xs text-ink-500 mt-1">{job.location}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm text-ink-400">{jobContactCount} contacts</div>
                            <div className="text-xs text-ink-500">{jobEmailCount} emails</div>
                          </div>
                          <ChevronRightIcon className="w-5 h-5 text-ink-500" />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              <EmptyState message="No jobs were found in this workflow." icon={JobIcon} isDark={isDark} />
            )}
          </div>
        </div>
      ) : detailView === 'job' ? (
        /* Job View - Show Job Details and Contacts */
        <div className="space-y-6">
          {/* Job Summary */}
          <div className="p-6 rounded-xl bg-ink-950 border border-ink-800">
            <h2 className="text-xl font-display font-bold text-white">{selectedJob?.title}</h2>
            <div className="text-volt-400 mt-1">{selectedJob?.company_name}</div>
            {selectedJob?.location && (
              <div className="text-sm text-ink-400 mt-1">{selectedJob?.location}</div>
            )}
            {selectedJob?.url && (
              <a 
                href={selectedJob.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm text-signal-400 hover:underline"
              >
                View Job Posting →
              </a>
            )}
          </div>

          {/* Contacts List */}
          <div>
            <h3 className="font-display text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <PeopleIcon className="w-5 h-5 text-pulse-400" />
              Contacts ({jobContacts.length})
            </h3>
            {jobContacts.length > 0 ? (
              <div className="grid gap-3">
                {jobContacts.map((contact, i) => {
                  const hasEmail = (details?.emails || []).some(
                    e => e.contact_id === contact._id || e.contact_id?.toString() === contact._id?.toString()
                  )

                  return (
                    <motion.div
                      key={contact._id || i}
                      whileHover={{ scale: 1.005 }}
                      onClick={() => onSelectContact(contact)}
                      className="p-4 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-white">{contact.name}</div>
                          <div className="text-sm text-ink-400">{contact.role || contact.title}</div>
                          {contact.email && (
                            <div className="text-xs text-signal-400 mt-1">{contact.email}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {hasEmail && (
                            <span className="tag-green text-xs flex items-center gap-1">
                              <MailIcon className="w-3 h-3" />
                              Email Ready
                            </span>
                          )}
                          <ChevronRightIcon className="w-5 h-5 text-ink-500" />
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              <EmptyState message="No contacts were found for this job." icon={PeopleIcon} isDark={isDark} />
            )}
          </div>
        </div>
      ) : (
        /* Contact View - Show Contact Details and Email */
        <div className="space-y-6">
          {/* Contact Info Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-ink-900 to-ink-950 border border-ink-800">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pulse-500/20 to-signal-500/20 flex items-center justify-center text-xl font-bold text-white">
                  {selectedContact?.name?.charAt(0) || '?'}
                </div>
                <div>
                  <h2 className="text-xl font-display font-bold text-white">{selectedContact?.name}</h2>
                  <div className="text-ink-400 mt-0.5">{selectedContact?.role || selectedContact?.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <BuildingIcon className="w-3.5 h-3.5 text-volt-400" />
                    <span className="text-sm text-volt-400">{selectedJob?.company_name}</span>
                  </div>
                  {selectedContact?.email && (
                    <div className="flex items-center gap-2 mt-2">
                      <MailIcon className="w-3.5 h-3.5 text-ink-500" />
                      <span className="text-sm text-ink-400">{selectedContact.email}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {selectedContact?.linkedin_url && (
                  <motion.a 
                    href={selectedContact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary text-sm"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <LinkedInIcon className="w-4 h-4" />
                    LinkedIn
                  </motion.a>
                )}
              </div>
            </div>
          </div>

          {/* Drafted Email */}
          {contactEmail ? (
            <div className="space-y-4">
              <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-signal-500/10 flex items-center justify-center">
                  <MailIcon className="w-4 h-4 text-signal-400" />
                </div>
                Drafted Email
              </h3>
              
              <div className="rounded-2xl bg-gradient-to-br from-ink-900 to-ink-950 border border-ink-800 overflow-hidden">
                {/* Subject */}
                <div className="p-5 border-b border-ink-800/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-ink-500 uppercase tracking-wider font-medium">Subject</span>
                    <motion.button 
                      onClick={() => copyToClipboard(contactEmail.subject, 'subject')}
                      className="p-2 rounded-lg hover:bg-ink-800 transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      {copiedSubject ? (
                        <CheckIcon className="w-4 h-4 text-volt-400" />
                      ) : (
                        <CopyIcon className="w-4 h-4 text-ink-400" />
                      )}
                    </motion.button>
                  </div>
                  <div className="text-white font-medium text-lg">{contactEmail.subject}</div>
                </div>

                {/* Body */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-ink-500 uppercase tracking-wider font-medium">Message</span>
                    <motion.button 
                      onClick={() => copyToClipboard(contactEmail.body, 'body')}
                      className="p-2 rounded-lg hover:bg-ink-800 transition-colors"
                      whileTap={{ scale: 0.95 }}
                    >
                      {copiedBody ? (
                        <CheckIcon className="w-4 h-4 text-volt-400" />
                      ) : (
                        <CopyIcon className="w-4 h-4 text-ink-400" />
                      )}
                    </motion.button>
                  </div>
                  <div className="text-ink-300 whitespace-pre-wrap leading-relaxed bg-ink-950/50 rounded-xl p-4 border border-ink-800/30 text-sm">
                    {contactEmail.body}
                  </div>
                </div>

                {/* Actions */}
                <div className="p-5 pt-0 flex gap-3">
                  {selectedContact?.email && (
                    <motion.a
                      href={`mailto:${selectedContact.email}?subject=${encodeURIComponent(contactEmail.subject)}&body=${encodeURIComponent(contactEmail.body)}`}
                      className="flex-1 btn-primary justify-center py-3"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <MailIcon className="w-5 h-5" />
                      Open in Email Client
                    </motion.a>
                  )}
                  <motion.button
                    onClick={() => {
                      copyToClipboard(`Subject: ${contactEmail.subject}\n\n${contactEmail.body}`, 'body')
                    }}
                    className="btn-secondary px-5"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <CopyIcon className="w-5 h-5" />
                    Copy All
                  </motion.button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="No email has been drafted for this contact yet." icon={MailIcon} isDark={isDark} />
          )}
        </div>
      )}
    </motion.div>
  )
}
