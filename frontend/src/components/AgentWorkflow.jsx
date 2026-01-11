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
          {/* Enhanced Status Card */}
          {status && (
            <div className="space-y-4">
              {/* Main Status Card */}
              <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                    <StatusIcon className="w-5 h-5 text-pulse-400" />
                    Workflow Status
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                    status.workflow?.status === 'completed' ? 'bg-volt-500/20 text-volt-400' :
                    status.workflow?.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                    status.workflow?.status === 'cancelled' ? 'bg-ink-700/50 text-ink-400' :
                    'bg-pulse-500/20 text-pulse-400'
                  }`}>
                    {isWorkflowRunning && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full mr-1.5 animate-pulse" />}
                    {status.workflow?.status}
                  </span>
                </div>

                {/* Pipeline Steps Visualization */}
                <WorkflowPipelineSteps 
                  currentStep={status.workflow?.progress?.current_step}
                  currentRole={status.workflow?.progress?.current_role}
                  status={status.workflow?.status}
                  progress={status.workflow?.progress}
                  isRunning={isWorkflowRunning}
                />

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard 
                    icon={JobIcon}
                    value={status.summary?.jobs_count || 0}
                    label="Jobs"
                    color="volt"
                    isActive={status.workflow?.progress?.current_step === 'searching_jobs'}
                  />
                  <StatCard 
                    icon={PeopleIcon}
                    value={status.summary?.contacts_count || 0}
                    label="Contacts"
                    color="pulse"
                    isActive={status.workflow?.progress?.current_step === 'finding_contacts'}
                  />
                  <StatCard 
                    icon={EmailIcon}
                    value={status.summary?.emails_count || 0}
                    label="Emails"
                    color="signal"
                    isActive={status.workflow?.progress?.current_step === 'drafting_emails'}
                  />
                </div>

                {/* Cost Breakdown */}
                {status.workflow?.total_cost_usd > 0 && (
                  <div className="p-3 rounded-xl bg-ink-900/50 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ink-500 uppercase tracking-wide">Cost Breakdown</span>
                      <span className="font-mono text-sm font-bold text-volt-400">
                        ${status.workflow.total_cost_usd.toFixed(4)}
                      </span>
                    </div>
                    {status.workflow?.cost_breakdown && (
                      <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-volt-500" />
                          <span className="text-ink-400">Jobs: </span>
                          <span className="text-ink-300 font-mono">${(status.workflow.cost_breakdown.job_search || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-pulse-500" />
                          <span className="text-ink-400">People: </span>
                          <span className="text-ink-300 font-mono">${(status.workflow.cost_breakdown.people_search || 0).toFixed(4)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-signal-500" />
                          <span className="text-ink-400">Emails: </span>
                          <span className="text-ink-300 font-mono">${(status.workflow.cost_breakdown.email_generation || 0).toFixed(4)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Completion Banner */}
                {status.workflow?.status === 'completed' && results && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-volt-500/10 border border-volt-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-volt-500/20 flex items-center justify-center">
                          <CheckIcon className="w-5 h-5 text-volt-400" />
                        </div>
                        <div>
                          <div className="text-volt-400 font-semibold">Workflow Completed!</div>
                          <div className="text-sm text-ink-400">
                            {results.emails?.length || 0} emails ready to send
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' })}
                        className="btn-primary text-sm"
                      >
                        View Results ↓
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Error Display */}
                {status.workflow?.errors?.length > 0 && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-red-400 font-medium mb-2">Errors ({status.workflow.errors.length})</div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {status.workflow.errors.slice(-3).map((err, i) => (
                        <div key={i} className="text-xs text-red-300/80 flex items-start gap-2">
                          <span className="text-red-500">•</span>
                          <span>{err.step}: {err.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Live Activity Feed */}
              {isWorkflowRunning && status.activity_feed?.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-2xl bg-ink-950 border border-ink-800"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-volt-400 rounded-full animate-pulse" />
                    <h3 className="font-display text-sm font-semibold text-white">Live Activity</h3>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                      {status.activity_feed.map((item, i) => (
                        <motion.div
                          key={`${item.type}-${item.timestamp}-${i}`}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-start gap-3 p-2.5 rounded-lg bg-ink-900/50 hover:bg-ink-900 transition-colors"
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            item.type === 'job' ? 'bg-volt-500/20' :
                            item.type === 'contact' ? 'bg-pulse-500/20' :
                            'bg-signal-500/20'
                          }`}>
                            {item.type === 'job' && <JobIcon className="w-3.5 h-3.5 text-volt-400" />}
                            {item.type === 'contact' && <PeopleIcon className="w-3.5 h-3.5 text-pulse-400" />}
                            {item.type === 'email' && <EmailIcon className="w-3.5 h-3.5 text-signal-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">{item.title}</div>
                            <div className="text-xs text-ink-500 truncate">{item.subtitle}</div>
                          </div>
                          <div className="text-xs text-ink-600 flex-shrink-0">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}

              {/* Recent Items Preview (when running) */}
              {isWorkflowRunning && (status.recent?.jobs?.length > 0 || status.recent?.contacts?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {/* Recent Jobs */}
                  {status.recent?.jobs?.length > 0 && (
                    <div className="p-4 rounded-xl bg-ink-950 border border-ink-800">
                      <div className="flex items-center gap-2 mb-3">
                        <JobIcon className="w-4 h-4 text-volt-400" />
                        <span className="text-xs font-semibold text-ink-400 uppercase">Latest Jobs</span>
                      </div>
                      <div className="space-y-2">
                        {status.recent.jobs.slice(0, 3).map((job, i) => (
                          <div key={i} className="text-xs">
                            <div className="text-white truncate">{job.title}</div>
                            <div className="text-ink-500 truncate">{job.company_name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Contacts */}
                  {status.recent?.contacts?.length > 0 && (
                    <div className="p-4 rounded-xl bg-ink-950 border border-ink-800">
                      <div className="flex items-center gap-2 mb-3">
                        <PeopleIcon className="w-4 h-4 text-pulse-400" />
                        <span className="text-xs font-semibold text-ink-400 uppercase">Latest Contacts</span>
                      </div>
                      <div className="space-y-2">
                        {status.recent.contacts.slice(0, 3).map((contact, i) => (
                          <div key={i} className="text-xs">
                            <div className="text-white truncate">{contact.name}</div>
                            <div className="text-ink-500 truncate">{contact.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
          <div id="results-section">
            <ResultsSection results={results} />
          </div>
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

// Pipeline step visualization component
function WorkflowPipelineSteps({ currentStep, currentRole, status, progress, isRunning }) {
  const steps = [
    { id: 'parsing_resume', label: 'Parse Resume', icon: FileIcon, description: 'Extracting information from resume' },
    { id: 'searching_jobs', label: 'Find Jobs', icon: JobIcon, description: 'Searching for matching positions' },
    { id: 'finding_contacts', label: 'Find Contacts', icon: PeopleIcon, description: 'Identifying key contacts' },
    { id: 'drafting_emails', label: 'Draft Emails', icon: EmailIcon, description: 'Writing personalized outreach' },
    { id: 'completed', label: 'Complete', icon: CheckIcon, description: 'All done!' },
  ]

  const getStepStatus = (stepId, index) => {
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      if (status === 'completed') return 'completed'
      if (status === 'failed' && currentStep === stepId) return 'failed'
      // Mark steps before the failed one as completed
      const currentIndex = steps.findIndex(s => s.id === currentStep)
      if (index < currentIndex) return 'completed'
      return stepId === currentStep ? 'failed' : 'pending'
    }
    
    const currentIndex = steps.findIndex(s => s.id === currentStep)
    const stepIndex = steps.findIndex(s => s.id === stepId)
    
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return 'active'
    return 'pending'
  }

  return (
    <div className="space-y-3">
      {/* Current action detail */}
      {isRunning && currentStep && currentStep !== 'completed' && (
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-volt-500/10 to-transparent border border-volt-500/20"
        >
          <div className="relative">
            <LoadingSpinner />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white font-medium">
              {currentStep === 'parsing_resume' && 'Processing your resume...'}
              {currentStep === 'searching_jobs' && (
                <>Searching jobs{currentRole ? ` for "${currentRole}"` : '...'}</>
              )}
              {currentStep === 'finding_contacts' && 'Finding relevant contacts...'}
              {currentStep === 'drafting_emails' && 'Generating personalized emails...'}
            </div>
            {currentRole && currentStep === 'searching_jobs' && (
              <div className="text-xs text-ink-500 mt-0.5">
                Role {(progress?.roles_completed || 0) + 1} of {progress?.total_roles || '?'}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepStatus = getStepStatus(step.id, index)
          const Icon = step.icon
          
          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <motion.div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                    stepStatus === 'completed' ? 'bg-volt-500/30 text-volt-400' :
                    stepStatus === 'active' ? 'bg-pulse-500/30 text-pulse-400 ring-2 ring-pulse-500/50' :
                    stepStatus === 'failed' ? 'bg-red-500/30 text-red-400' :
                    'bg-ink-800/50 text-ink-600'
                  }`}
                  animate={stepStatus === 'active' ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                >
                  {stepStatus === 'completed' ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : stepStatus === 'failed' ? (
                    <CloseIcon className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </motion.div>
                <span className={`text-xs mt-1.5 font-medium transition-colors ${
                  stepStatus === 'completed' ? 'text-volt-400' :
                  stepStatus === 'active' ? 'text-pulse-400' :
                  stepStatus === 'failed' ? 'text-red-400' :
                  'text-ink-600'
                }`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded-full transition-all duration-500 ${
                  getStepStatus(steps[index + 1].id, index + 1) !== 'pending' 
                    ? 'bg-volt-500/50' 
                    : 'bg-ink-800'
                }`} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Stat card component
function StatCard({ icon: Icon, value, label, color, isActive }) {
  return (
    <motion.div 
      className={`relative p-3 rounded-xl overflow-hidden transition-all duration-300 ${
        isActive 
          ? `bg-${color}-500/10 border border-${color}-500/30 ring-1 ring-${color}-500/20` 
          : 'bg-ink-900/50 border border-ink-800/50'
      }`}
      animate={isActive ? { scale: [1, 1.02, 1] } : {}}
      transition={{ repeat: Infinity, duration: 2 }}
    >
      {isActive && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      )}
      <div className="relative flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          isActive ? `bg-${color}-500/20` : 'bg-ink-800/50'
        }`}>
          <Icon className={`w-4 h-4 ${isActive ? `text-${color}-400` : 'text-ink-500'}`} />
        </div>
        <div>
          <motion.div 
            key={value}
            initial={{ scale: 0.8, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-xl font-display font-bold ${isActive ? 'text-white' : 'text-ink-300'}`}
          >
            {value}
          </motion.div>
          <div className="text-xs text-ink-500">{label}</div>
        </div>
      </div>
    </motion.div>
  )
}

function SignalIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
    </svg>
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

