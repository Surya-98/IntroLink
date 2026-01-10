import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function AgentWorkflow() {
  const [resumeText, setResumeText] = useState('')
  const [targetRoles, setTargetRoles] = useState('')
  const [targetCompanies, setTargetCompanies] = useState('')
  const [targetLocations, setTargetLocations] = useState('')
  const [workArrangement, setWorkArrangement] = useState('')
  const [seniorityLevel, setSeniorityLevel] = useState('')
  const [maxJobsPerRole, setMaxJobsPerRole] = useState(5)
  const [maxContactsPerJob, setMaxContactsPerJob] = useState(3)
  
  const [workflowId, setWorkflowId] = useState(null)
  const [status, setStatus] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeResultTab, setActiveResultTab] = useState('emails')
  
  const pollIntervalRef = useRef(null)

  // Poll for workflow status
  useEffect(() => {
    if (workflowId && status?.workflow?.status !== 'completed' && status?.workflow?.status !== 'failed' && status?.workflow?.status !== 'cancelled') {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/agent/status/${workflowId}`)
          const data = await res.json()
          setStatus(data)
          
          if (['completed', 'failed', 'cancelled'].includes(data.workflow?.status)) {
            clearInterval(pollIntervalRef.current)
            // Fetch full results
            const resultsRes = await fetch(`/api/agent/results/${workflowId}`)
            const resultsData = await resultsRes.json()
            setResults(resultsData)
          }
        } catch (err) {
          console.error('Polling error:', err)
        }
      }, 2000)

      return () => clearInterval(pollIntervalRef.current)
    }
  }, [workflowId, status?.workflow?.status])

  const handleStartWorkflow = async () => {
    if (!resumeText.trim()) {
      setError('Please enter your resume text')
      return
    }

    const roles = targetRoles.split(',').map(r => r.trim()).filter(Boolean)
    if (roles.length === 0) {
      setError('Please enter at least one target role')
      return
    }

    setLoading(true)
    setError(null)
    setResults(null)
    setStatus(null)

    try {
      const locations = targetLocations.split(',').map(l => l.trim()).filter(Boolean)
      const companies = targetCompanies.split(',').map(c => c.trim()).filter(Boolean)
      
      const res = await fetch('/api/agent/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText,
          targetRoles: roles,
          targetCompanies: companies.length > 0 ? companies : undefined,
          targetLocations: locations.length > 0 ? locations : undefined,
          preferences: {
            workArrangement: workArrangement || undefined,
            seniorityLevel: seniorityLevel || undefined,
            maxJobsPerRole,
            maxContactsPerJob
          }
        })
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to start workflow')
      }

      setWorkflowId(data.workflowId)
      setStatus({ workflow: { status: 'pending', progress: { current_step: 'Starting...' } } })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelWorkflow = async () => {
    if (!workflowId) return
    
    try {
      await fetch(`/api/agent/cancel/${workflowId}`, { method: 'POST' })
    } catch (err) {
      console.error('Cancel error:', err)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-volt-400'
      case 'failed': return 'text-red-400'
      case 'cancelled': return 'text-ink-400'
      default: return 'text-pulse-400'
    }
  }

  const getStepLabel = (step) => {
    const labels = {
      'initialized': 'Initializing...',
      'parsing_resume': 'Parsing resume...',
      'searching_jobs': 'Searching for jobs...',
      'finding_contacts': 'Finding contacts...',
      'drafting_emails': 'Drafting personalized emails...',
      'completed': 'Completed!',
      'failed': 'Failed',
      'cancelled': 'Cancelled'
    }
    return labels[step] || step
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
          AI <span className="gradient-text">Outreach Agent</span>
        </h1>
        <p className="text-ink-400 text-lg max-w-2xl mx-auto">
          Upload your resume and target roles. Our AI agent will find jobs, identify key contacts, 
          and draft personalized outreach emails—all automatically.
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Input Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 space-y-6">
            <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
              <RocketIcon className="w-5 h-5 text-volt-400" />
              Configure Your Agent
            </h2>

            {/* Resume Input */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink-300">
                Your Resume <span className="text-red-400">*</span>
              </label>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste your resume text here..."
                rows={8}
                className="w-full input-dark resize-none font-mono text-sm"
                disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
              />
              <p className="text-xs text-ink-500">Paste your full resume text. The AI will extract relevant information.</p>
            </div>

            {/* Target Roles */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink-300">
                Target Roles <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={targetRoles}
                onChange={(e) => setTargetRoles(e.target.value)}
                placeholder="e.g., Senior Software Engineer, Staff Engineer, Tech Lead"
                className="w-full input-dark"
                disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
              />
              <p className="text-xs text-ink-500">Comma-separated list of job titles you're targeting</p>
            </div>

            {/* Target Companies */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink-300">
                Target Companies
              </label>
              <input
                type="text"
                value={targetCompanies}
                onChange={(e) => setTargetCompanies(e.target.value)}
                placeholder="e.g., Google, Meta, Stripe, OpenAI"
                className="w-full input-dark"
                disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
              />
              <p className="text-xs text-ink-500">Comma-separated list of companies (leave empty to search all)</p>
            </div>

            {/* Target Locations */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-ink-300">
                Preferred Locations
              </label>
              <input
                type="text"
                value={targetLocations}
                onChange={(e) => setTargetLocations(e.target.value)}
                placeholder="e.g., San Francisco, New York, Remote"
                className="w-full input-dark"
                disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
              />
            </div>

            {/* Preferences Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink-300">Work Arrangement</label>
                <select
                  value={workArrangement}
                  onChange={(e) => setWorkArrangement(e.target.value)}
                  className="w-full input-dark"
                  disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
                >
                  <option value="">Any</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="on-site">On-site</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink-300">Seniority Level</label>
                <select
                  value={seniorityLevel}
                  onChange={(e) => setSeniorityLevel(e.target.value)}
                  className="w-full input-dark"
                  disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
                >
                  <option value="">Any</option>
                  <option value="entry">Entry Level</option>
                  <option value="associate">Associate</option>
                  <option value="mid-senior">Mid-Senior</option>
                  <option value="director">Director</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
            </div>

            {/* Limits Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink-300">Jobs per Role</label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={maxJobsPerRole}
                  onChange={(e) => setMaxJobsPerRole(parseInt(e.target.value) || 5)}
                  className="w-full input-dark"
                  disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink-300">Contacts per Job</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={maxContactsPerJob}
                  onChange={(e) => setMaxContactsPerJob(parseInt(e.target.value) || 3)}
                  className="w-full input-dark"
                  disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
                />
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleStartWorkflow}
                disabled={loading || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
                className="btn-primary flex-1"
              >
                {loading ? (
                  <>
                    <LoadingSpinner />
                    Starting...
                  </>
                ) : (
                  <>
                    <RocketIcon className="w-4 h-4" />
                    Launch Agent
                  </>
                )}
              </button>
              
              {status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status) && (
                <button
                  onClick={handleCancelWorkflow}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Status & Progress */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Status Card */}
          {status && (
            <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                  <StatusIcon className="w-5 h-5 text-pulse-400" />
                  Workflow Status
                </h2>
                <span className={`text-sm font-medium capitalize ${getStatusColor(status.workflow?.status)}`}>
                  {status.workflow?.status}
                </span>
              </div>

              {/* Progress */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  {!['completed', 'failed', 'cancelled'].includes(status.workflow?.status) && (
                    <LoadingSpinner />
                  )}
                  <span className="text-ink-300">{getStepLabel(status.workflow?.progress?.current_step)}</span>
                </div>

                {status.workflow?.progress?.current_role && (
                  <div className="text-xs text-ink-500">
                    Current role: <span className="text-ink-300">{status.workflow.progress.current_role}</span>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>Roles Progress</span>
                    <span>{status.workflow?.progress?.roles_completed || 0} / {status.workflow?.progress?.total_roles || 0}</span>
                  </div>
                  <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-volt-500 to-pulse-500"
                      initial={{ width: 0 }}
                      animate={{ 
                        width: `${((status.workflow?.progress?.roles_completed || 0) / (status.workflow?.progress?.total_roles || 1)) * 100}%` 
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-ink-800">
                  <div>
                    <div className="text-2xl font-display font-bold text-white">
                      {status.summary?.jobs_count || status.workflow?.progress?.total_jobs_found || 0}
                    </div>
                    <div className="text-xs text-ink-400">Jobs Found</div>
                  </div>
                  <div>
                    <div className="text-2xl font-display font-bold text-white">
                      {status.summary?.contacts_count || status.workflow?.progress?.total_contacts_found || 0}
                    </div>
                    <div className="text-xs text-ink-400">Contacts</div>
                  </div>
                  <div>
                    <div className="text-2xl font-display font-bold text-white">
                      {status.summary?.emails_count || status.workflow?.progress?.total_emails_drafted || 0}
                    </div>
                    <div className="text-xs text-ink-400">Emails</div>
                  </div>
                </div>

                {/* Cost */}
                {status.workflow?.total_cost_usd > 0 && (
                  <div className="flex justify-between items-center pt-4 border-t border-ink-800">
                    <span className="text-sm text-ink-400">Total Cost</span>
                    <span className="font-mono text-volt-400">${status.workflow.total_cost_usd.toFixed(4)}</span>
                  </div>
                )}
              </div>

              {/* Resume Info */}
              {status.resume && (
                <div className="p-4 rounded-xl bg-ink-900/50 space-y-2">
                  <div className="text-xs text-ink-500 uppercase tracking-wide">Parsed Resume</div>
                  <div className="text-white font-medium">{status.resume.name}</div>
                  {status.resume.current_title && (
                    <div className="text-sm text-ink-400">{status.resume.current_title} at {status.resume.current_company}</div>
                  )}
                  {status.resume.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {status.resume.skills.slice(0, 6).map((skill, i) => (
                        <span key={i} className="tag-gray text-xs">{skill}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Placeholder */}
          {!status && (
            <div className="p-12 rounded-2xl bg-ink-950 border border-ink-800 border-dashed text-center">
              <RocketIcon className="w-12 h-12 text-ink-700 mx-auto mb-4" />
              <p className="text-ink-500">
                Configure and launch your agent to see progress here
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Results Section */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold text-white">Results</h2>
              <div className="flex items-center gap-2 p-1 bg-ink-900/50 rounded-xl">
                {['emails', 'jobs', 'contacts'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveResultTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                      activeResultTab === tab 
                        ? 'bg-ink-700 text-white' 
                        : 'text-ink-400 hover:text-white'
                    }`}
                  >
                    {tab} ({results[tab]?.length || 0})
                  </button>
                ))}
              </div>
            </div>

            {/* Emails */}
            {activeResultTab === 'emails' && (
              <div className="space-y-4">
                {results.emails?.length > 0 ? (
                  results.emails.map((email, i) => (
                    <EmailCard key={email._id || i} email={email} />
                  ))
                ) : (
                  <EmptyState message="No emails drafted yet" />
                )}
              </div>
            )}

            {/* Jobs */}
            {activeResultTab === 'jobs' && (
              <div className="grid gap-4">
                {results.jobs?.length > 0 ? (
                  results.jobs.map((job, i) => (
                    <JobResultCard key={job._id || i} job={job} />
                  ))
                ) : (
                  <EmptyState message="No jobs found" />
                )}
              </div>
            )}

            {/* Contacts */}
            {activeResultTab === 'contacts' && (
              <div className="grid md:grid-cols-2 gap-4">
                {results.contacts?.length > 0 ? (
                  results.contacts.map((contact, i) => (
                    <ContactResultCard key={contact._id || i} contact={contact} />
                  ))
                ) : (
                  <EmptyState message="No contacts found" />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmailCard({ email }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const fullEmail = `Subject: ${email.subject}\n\n${email.body}`
    navigator.clipboard.writeText(fullEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div
      layout
      className="p-6 rounded-2xl bg-ink-950 border border-ink-800 space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium">{email.recipient_name}</span>
            <span className="tag-purple text-xs">{email.recipient_title}</span>
          </div>
          <div className="text-sm text-ink-400">{email.recipient_company}</div>
          {email.job_context?.title && (
            <div className="text-xs text-ink-500">
              For: <span className="text-ink-300">{email.job_context.title}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="btn-ghost text-xs"
          >
            {copied ? (
              <>
                <CheckIcon className="w-4 h-4 text-volt-400" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-ghost text-xs"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1">
        <div className="text-xs text-ink-500 uppercase tracking-wide">Subject</div>
        <div className="text-white">{email.subject}</div>
      </div>

      {/* Body */}
      <div className="space-y-1">
        <div className="text-xs text-ink-500 uppercase tracking-wide">Body</div>
        <div className={`text-ink-300 text-sm whitespace-pre-wrap ${!expanded && 'line-clamp-4'}`}>
          {email.body}
        </div>
      </div>
    </motion.div>
  )
}

function JobResultCard({ job }) {
  return (
    <div className="p-5 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-white font-medium">{job.title}</div>
          <div className="text-sm text-ink-400">{job.company_name}</div>
          <div className="flex items-center gap-2 text-xs text-ink-500">
            {job.location && <span>{job.location}</span>}
            {job.work_arrangement && <span className="tag-green">{job.work_arrangement}</span>}
          </div>
        </div>
        {job.linkedin_url && (
          <a
            href={job.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs"
          >
            View →
          </a>
        )}
      </div>
    </div>
  )
}

function ContactResultCard({ contact }) {
  return (
    <div className="p-5 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-white font-medium">{contact.name}</div>
          <div className="text-sm text-ink-400">{contact.title}</div>
          <div className="text-xs text-ink-500">{contact.company}</div>
        </div>
        {contact.linkedin_url && (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost text-xs"
          >
            LinkedIn →
          </a>
        )}
      </div>
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

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-volt-400" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

function RocketIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  )
}

function StatusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
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
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

