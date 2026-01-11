import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'

const WorkflowContext = createContext(null)

export function WorkflowProvider({ children }) {
  // Active workflow state - persists across navigation
  const [activeWorkflowId, setActiveWorkflowId] = useState(() => {
    return localStorage.getItem('introlink_active_workflow') || null
  })
  const [workflowStatus, setWorkflowStatus] = useState(null)
  const [workflowResults, setWorkflowResults] = useState(null)
  
  // Polling ref
  const pollIntervalRef = useRef(null)

  // Persist active workflow ID
  useEffect(() => {
    if (activeWorkflowId) {
      localStorage.setItem('introlink_active_workflow', activeWorkflowId)
    } else {
      localStorage.removeItem('introlink_active_workflow')
    }
  }, [activeWorkflowId])

  // Poll for workflow status
  const pollWorkflowStatus = useCallback(async (workflowId) => {
    if (!workflowId) return

    try {
      const res = await fetch(`/api/agent/status/${workflowId}`)
      if (!res.ok) {
        console.error('Failed to fetch workflow status')
        return
      }
      
      const data = await res.json()
      setWorkflowStatus(data)

      // If workflow is complete, fetch results and stop polling
      if (['completed', 'failed', 'cancelled'].includes(data.workflow?.status)) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
        
        // Fetch full results
        const resultsRes = await fetch(`/api/agent/results/${workflowId}`)
        if (resultsRes.ok) {
          const resultsData = await resultsRes.json()
          setWorkflowResults(resultsData)
        }
      }
    } catch (err) {
      console.error('Polling error:', err)
    }
  }, [])

  // Start polling when there's an active workflow
  useEffect(() => {
    if (activeWorkflowId && !pollIntervalRef.current) {
      // Initial fetch
      pollWorkflowStatus(activeWorkflowId)
      
      // Start polling - faster for more responsive updates
      pollIntervalRef.current = setInterval(() => {
        pollWorkflowStatus(activeWorkflowId)
      }, 1500) // Poll every 1.5 seconds for better UX
    }

    return () => {
      // Don't clear interval on unmount - we want to keep polling
    }
  }, [activeWorkflowId, pollWorkflowStatus])

  // Start a new workflow
  const startWorkflow = async (params) => {
    const res = await fetch('/api/agent/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })

    const data = await res.json()
    
    if (!res.ok) {
      throw new Error(data.error || 'Failed to start workflow')
    }

    setActiveWorkflowId(data.workflowId)
    setWorkflowStatus({ workflow: { status: 'pending', progress: { current_step: 'Starting...' } } })
    setWorkflowResults(null)
    
    // Start polling - faster for more responsive updates
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    pollIntervalRef.current = setInterval(() => {
      pollWorkflowStatus(data.workflowId)
    }, 1500)

    return data
  }

  // Cancel workflow
  const cancelWorkflow = async () => {
    if (!activeWorkflowId) return
    
    try {
      await fetch(`/api/agent/cancel/${activeWorkflowId}`, { method: 'POST' })
    } catch (err) {
      console.error('Cancel error:', err)
    }
  }

  // Clear active workflow (when viewing a completed one)
  const clearActiveWorkflow = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setActiveWorkflowId(null)
    setWorkflowStatus(null)
    setWorkflowResults(null)
  }

  // Resume watching a workflow (e.g., from dashboard)
  const resumeWorkflow = async (workflowId) => {
    setActiveWorkflowId(workflowId)
    setWorkflowStatus(null)
    setWorkflowResults(null)
    
    // Fetch initial status
    await pollWorkflowStatus(workflowId)
    
    // Start polling if not complete - faster for responsiveness
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
    }
    pollIntervalRef.current = setInterval(() => {
      pollWorkflowStatus(workflowId)
    }, 1500)
  }

  // Check if there's a running workflow
  const isWorkflowRunning = workflowStatus?.workflow?.status && 
    !['completed', 'failed', 'cancelled'].includes(workflowStatus.workflow.status)

  const value = {
    activeWorkflowId,
    workflowStatus,
    workflowResults,
    isWorkflowRunning,
    startWorkflow,
    cancelWorkflow,
    clearActiveWorkflow,
    resumeWorkflow,
    pollWorkflowStatus
  }

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  )
}

export function useWorkflow() {
  const context = useContext(WorkflowContext)
  if (!context) {
    throw new Error('useWorkflow must be used within a WorkflowProvider')
  }
  return context
}

