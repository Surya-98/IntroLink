import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useWorkflow } from '../context/WorkflowContext'

export default function AgentWorkflow() {
  // Use workflow context for persistence across navigation
  const { 
    activeWorkflowId, 
    workflowStatus, 
    workflowResults, 
    isWorkflowRunning,
    startWorkflow: contextStartWorkflow,
    cancelWorkflow: contextCancelWorkflow,
    clearActiveWorkflow
  } = useWorkflow()

  // Load saved data from localStorage on init
  const [resumeText, setResumeText] = useState(() => localStorage.getItem('introlink_resume_text') || '')
  const [resumeFileName, setResumeFileName] = useState(() => localStorage.getItem('introlink_resume_filename') || '')
  const [uploadingResume, setUploadingResume] = useState(false)
  const [targetRoles, setTargetRoles] = useState(() => localStorage.getItem('introlink_target_roles') || '')
  const [targetCompanies, setTargetCompanies] = useState(() => localStorage.getItem('introlink_target_companies') || '')
  const [targetLocations, setTargetLocations] = useState(() => localStorage.getItem('introlink_target_locations') || '')
  const [workArrangement, setWorkArrangement] = useState(() => localStorage.getItem('introlink_work_arrangement') || '')
  const [seniorityLevel, setSeniorityLevel] = useState(() => localStorage.getItem('introlink_seniority_level') || '')
  const [maxJobsPerRole, setMaxJobsPerRole] = useState(() => parseInt(localStorage.getItem('introlink_max_jobs')) || 5)
  const [maxContactsPerJob, setMaxContactsPerJob] = useState(() => parseInt(localStorage.getItem('introlink_max_contacts')) || 3)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const fileInputRef = useRef(null)

  // Use context state
  const status = workflowStatus
  const results = workflowResults

  // Persist form data to localStorage
  useEffect(() => {
    localStorage.setItem('introlink_resume_text', resumeText)
  }, [resumeText])

  useEffect(() => {
    localStorage.setItem('introlink_resume_filename', resumeFileName)
  }, [resumeFileName])

  useEffect(() => {
    localStorage.setItem('introlink_target_roles', targetRoles)
  }, [targetRoles])

  useEffect(() => {
    localStorage.setItem('introlink_target_companies', targetCompanies)
  }, [targetCompanies])

  useEffect(() => {
    localStorage.setItem('introlink_target_locations', targetLocations)
  }, [targetLocations])

  useEffect(() => {
    localStorage.setItem('introlink_work_arrangement', workArrangement)
  }, [workArrangement])

  useEffect(() => {
    localStorage.setItem('introlink_seniority_level', seniorityLevel)
  }, [seniorityLevel])

  useEffect(() => {
    localStorage.setItem('introlink_max_jobs', maxJobsPerRole.toString())
  }, [maxJobsPerRole])

  useEffect(() => {
    localStorage.setItem('introlink_max_contacts', maxContactsPerJob.toString())
  }, [maxContactsPerJob])

  // Handle file upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ]
    const allowedExtensions = ['.pdf', '.docx', '.txt']
    
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'))
    if (!allowedExtensions.includes(ext)) {
      setError('Please upload a PDF, DOCX, or TXT file')
      return
    }

    setUploadingResume(true)
    setError(null)

    try {
      // For text files, read directly
      if (ext === '.txt') {
        const text = await file.text()
        setResumeText(text)
        setResumeFileName(file.name)
      } else {
        // For PDF/DOCX, send to backend for parsing
        const formData = new FormData()
        formData.append('resume', file)

        const res = await fetch('/api/resume/upload', {
          method: 'POST',
          body: formData
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to parse resume')
        }

        const data = await res.json()
        setResumeText(data.text)
        setResumeFileName(file.name)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingResume(false)
    }
  }

  const clearResume = () => {
    setResumeText('')
    setResumeFileName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Polling is now handled by WorkflowContext

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

    try {
      const locations = targetLocations.split(',').map(l => l.trim()).filter(Boolean)
      const companies = targetCompanies.split(',').map(c => c.trim()).filter(Boolean)
      
      await contextStartWorkflow({
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
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelWorkflow = async () => {
    await contextCancelWorkflow()
  }

  const handleNewWorkflow = () => {
    clearActiveWorkflow()
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
            <div className="space-y-3">
              <label className="block text-sm font-medium text-ink-300">
                Your Resume <span className="text-red-400">*</span>
              </label>
              
              {/* File Upload */}
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={loading || uploadingResume || isWorkflowRunning}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading || uploadingResume || isWorkflowRunning}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  {uploadingResume ? (
                    <>
                      <LoadingSpinner />
                      Processing...
                    </>
                  ) : (
                    <>
                      <UploadIcon className="w-4 h-4" />
                      Upload Resume
                    </>
                  )}
                </button>
                {resumeFileName && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-volt-500/10 border border-volt-500/20 rounded-lg">
                    <FileIcon className="w-4 h-4 text-volt-400" />
                    <span className="text-sm text-volt-400">{resumeFileName}</span>
                    <button
                      onClick={clearResume}
                      className="text-ink-400 hover:text-white ml-1"
                      disabled={loading || isWorkflowRunning}
                    >
                      <CloseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <span className="text-xs text-ink-500">PDF, DOCX, or TXT</span>
              </div>

              {/* Text Area */}
              <textarea
                value={resumeText}
                onChange={(e) => {
                  setResumeText(e.target.value)
                  if (!e.target.value) setResumeFileName('')
                }}
                placeholder="Or paste your resume text here..."
                rows={6}
                className="w-full input-dark resize-none font-mono text-sm"
                disabled={loading || uploadingResume || (status?.workflow?.status && !['completed', 'failed', 'cancelled'].includes(status.workflow.status))}
              />
              <p className="text-xs text-ink-500">Upload a file or paste your resume text. The AI will extract relevant information.</p>
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
                disabled={loading || isWorkflowRunning}
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
                disabled={loading || isWorkflowRunning}
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
                disabled={loading || isWorkflowRunning}
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
                  disabled={loading || isWorkflowRunning}
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
                  disabled={loading || isWorkflowRunning}
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
                  disabled={loading || isWorkflowRunning}
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
                  disabled={loading || isWorkflowRunning}
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
              {results ? (
                <button
                  onClick={handleNewWorkflow}
                  className="btn-secondary flex-1"
                >
                  <PlusIcon className="w-4 h-4" />
                  New Workflow
                </button>
              ) : (
                <button
                  onClick={handleStartWorkflow}
                  disabled={loading || isWorkflowRunning}
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
              )}
              
              {isWorkflowRunning && (
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
                  {isWorkflowRunning && (
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
          <ResultsSection results={results} />
        )}
      </AnimatePresence>
    </div>
  )
}

function ResultsSection({ results }) {
  const [selectedJob, setSelectedJob] = useState(null)
  const [selectedContact, setSelectedContact] = useState(null)

  // Get contacts for a specific job
  const getContactsForJob = (jobId) => {
    return results.contacts?.filter(c => c.job_id === jobId || c.job_id?._id === jobId) || []
  }

  // Get email for a specific contact
  const getEmailForContact = (contactId) => {
    return results.emails?.find(e => e.contact_id === contactId || e.contact_id?._id === contactId)
  }

  // Handle back navigation
  const handleBack = () => {
    if (selectedContact) {
      setSelectedContact(null)
    } else if (selectedJob) {
      setSelectedJob(null)
    }
  }

  // Breadcrumb
  const getBreadcrumb = () => {
    const parts = ['Jobs']
    if (selectedJob) {
      parts.push(`${selectedJob.company_name} - ${selectedJob.title}`)
    }
    if (selectedContact) {
      parts.push(selectedContact.name)
    }
    return parts
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      {/* Header with Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {(selectedJob || selectedContact) && (
            <button
              onClick={handleBack}
              className="btn-ghost p-2"
            >
              <BackIcon className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2 text-sm">
            {getBreadcrumb().map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span className="text-ink-600">/</span>}
                <span className={i === getBreadcrumb().length - 1 ? 'text-white font-medium' : 'text-ink-400'}>
                  {part}
                </span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-ink-400">
          <span>{results.jobs?.length || 0} jobs</span>
          <span>{results.contacts?.length || 0} contacts</span>
          <span>{results.emails?.length || 0} emails</span>
        </div>
      </div>

      {/* Contact Detail View */}
      {selectedContact && (
        <ContactDetailView 
          contact={selectedContact} 
          email={getEmailForContact(selectedContact._id)}
          job={selectedJob}
        />
      )}

      {/* Job's Contacts View */}
      {selectedJob && !selectedContact && (
        <div className="space-y-4">
          {/* Job Summary */}
          <div className="p-5 rounded-xl bg-volt-500/5 border border-volt-500/20">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-white font-semibold text-lg">{selectedJob.title}</div>
                <div className="text-ink-400">{selectedJob.company_name}</div>
                <div className="flex items-center gap-2 text-sm text-ink-500 mt-2">
                  {selectedJob.location && <span>{selectedJob.location}</span>}
                  {selectedJob.work_arrangement && <span className="tag-green">{selectedJob.work_arrangement}</span>}
                </div>
                {selectedJob.description_snippet && (
                  <p className="text-sm text-ink-400 mt-3 line-clamp-2">{selectedJob.description_snippet}</p>
                )}
              </div>
              {selectedJob.linkedin_url && (
                <a
                  href={selectedJob.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-sm"
                >
                  View Job →
                </a>
              )}
            </div>
          </div>

          {/* Contacts for this job */}
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <PeopleIcon className="w-5 h-5 text-pulse-400" />
            Contacts at {selectedJob.company_name}
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {getContactsForJob(selectedJob._id).length > 0 ? (
              getContactsForJob(selectedJob._id).map((contact, i) => (
                <ContactCard 
                  key={contact._id || i} 
                  contact={contact}
                  hasEmail={!!getEmailForContact(contact._id)}
                  onClick={() => setSelectedContact(contact)}
                />
              ))
            ) : (
              <div className="col-span-2">
                <EmptyState message="No contacts found for this job" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Jobs List View */}
      {!selectedJob && !selectedContact && (
        <div className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-white flex items-center gap-2">
            <JobIcon className="w-5 h-5 text-volt-400" />
            Jobs Found
          </h3>
          {results.jobs?.length > 0 ? (
            <div className="grid gap-4">
              {results.jobs.map((job, i) => {
                const contactCount = getContactsForJob(job._id).length
                const emailCount = getContactsForJob(job._id).filter(c => getEmailForContact(c._id)).length
                return (
                  <JobCard 
                    key={job._id || i} 
                    job={job}
                    contactCount={contactCount}
                    emailCount={emailCount}
                    onClick={() => setSelectedJob(job)}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState message="No jobs found" />
          )}
        </div>
      )}
    </motion.div>
  )
}

function JobCard({ job, contactCount, emailCount, onClick }) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className="p-5 rounded-xl bg-ink-950 border border-ink-800 hover:border-volt-500/50 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 flex-1">
          <div className="text-white font-medium">{job.title}</div>
          <div className="text-sm text-ink-400">{job.company_name}</div>
          <div className="flex items-center gap-2 text-xs text-ink-500 mt-2">
            {job.location && <span>{job.location}</span>}
            {job.work_arrangement && <span className="tag-green">{job.work_arrangement}</span>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-pulse-400">
                <PeopleIcon className="w-4 h-4" />
                {contactCount}
              </span>
              <span className="flex items-center gap-1 text-volt-400">
                <EmailIcon className="w-4 h-4" />
                {emailCount}
              </span>
            </div>
          </div>
          <ChevronRightIcon className="w-5 h-5 text-ink-500" />
        </div>
      </div>
    </motion.div>
  )
}

function ContactCard({ contact, hasEmail, onClick }) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      onClick={onClick}
      className="p-5 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-pulse-500/50 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-white font-medium">{contact.name}</div>
            {hasEmail && (
              <span className="tag-volt text-xs">Email Ready</span>
            )}
          </div>
          <div className="text-sm text-ink-400">{contact.title}</div>
          <div className="text-xs text-ink-500">{contact.company}</div>
        </div>
        <ChevronRightIcon className="w-5 h-5 text-ink-500" />
      </div>
    </motion.div>
  )
}

function ContactDetailView({ contact, email, job }) {
  const [copied, setCopied] = useState(false)

  const handleCopyEmail = () => {
    if (email) {
      const fullEmail = `Subject: ${email.subject}\n\n${email.body}`
      navigator.clipboard.writeText(fullEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Contact Info Card */}
      <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-white">{contact.name}</h3>
            <div className="text-ink-400">{contact.title}</div>
            <div className="text-sm text-ink-500">{contact.company}</div>
            {contact.snippet && (
              <p className="text-sm text-ink-400 mt-3 p-3 bg-ink-900/50 rounded-lg">
                {contact.snippet}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <LinkedInIcon className="w-4 h-4" />
                LinkedIn
              </a>
            )}
            {contact.source_url && contact.source_url !== contact.linkedin_url && (
              <a
                href={contact.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost text-sm"
              >
                Source →
              </a>
            )}
          </div>
        </div>
      </div>

      {/* For Job Context */}
      {job && (
        <div className="p-4 rounded-xl bg-ink-900/30 border border-ink-800">
          <div className="text-xs text-ink-500 uppercase tracking-wide mb-2">For Position</div>
          <div className="text-white font-medium">{job.title}</div>
          <div className="text-sm text-ink-400">{job.company_name}</div>
        </div>
      )}

      {/* Email Draft */}
      {email ? (
        <div className="p-6 rounded-2xl bg-ink-950 border border-volt-500/20">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-display text-lg font-semibold text-white flex items-center gap-2">
              <EmailIcon className="w-5 h-5 text-volt-400" />
              Draft Email
            </h4>
            <button
              onClick={handleCopyEmail}
              className="btn-primary text-sm"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <CopyIcon className="w-4 h-4" />
                  Copy Email
                </>
              )}
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wide mb-1">Subject</div>
              <div className="text-white p-3 bg-ink-900/50 rounded-lg">{email.subject}</div>
            </div>
            <div>
              <div className="text-xs text-ink-500 uppercase tracking-wide mb-1">Body</div>
              <div className="text-ink-300 p-4 bg-ink-900/50 rounded-lg whitespace-pre-wrap text-sm leading-relaxed">
                {email.body}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 text-center">
          <EmailIcon className="w-8 h-8 text-ink-600 mx-auto mb-2" />
          <p className="text-ink-500">No email drafted for this contact yet</p>
        </div>
      )}
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

function UploadIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function FileIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function CloseIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function BackIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" />
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

function EmailIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 6l-10 7L2 6" />
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

function LinkedInIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
    </svg>
  )
}

function PlusIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

