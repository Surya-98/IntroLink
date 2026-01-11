import { useState } from 'react'
import Header from './components/Header'
import JobFinder from './components/JobFinder'
import PeopleFinder from './components/PeopleFinder'
import Dashboard from './components/Dashboard'
import AgentWorkflow from './components/AgentWorkflow'
import { WorkflowProvider } from './context/WorkflowContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'

function AppContent() {
  const [activeTab, setActiveTab] = useState('agent')
  const [savedJobs, setSavedJobs] = useState([])
  const [savedContacts, setSavedContacts] = useState([])
  const { isDark } = useTheme()

  const handleJobsFound = (jobs) => {
    setSavedJobs(prev => [...jobs, ...prev])
  }

  const handleContactsFound = (contacts) => {
    setSavedContacts(prev => [...contacts, ...prev])
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-[#0a0a0c]' : 'bg-white'} grid-pattern`}>
      {/* Ambient glow effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className={`absolute top-0 left-1/4 w-[600px] h-[600px] ${isDark ? 'bg-volt-500/5' : 'bg-volt-500/10'} rounded-full blur-[120px]`} />
        <div className={`absolute bottom-0 right-1/4 w-[500px] h-[500px] ${isDark ? 'bg-pulse-500/5' : 'bg-pulse-500/10'} rounded-full blur-[100px]`} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main className="max-w-7xl mx-auto px-6 py-8">
          {activeTab === 'agent' && (
            <AgentWorkflow />
          )}
          
          {activeTab === 'jobs' && (
            <JobFinder onJobsFound={handleJobsFound} />
          )}
          
          {activeTab === 'people' && (
            <PeopleFinder onContactsFound={handleContactsFound} />
          )}
          
          {activeTab === 'dashboard' && (
            <Dashboard 
              jobs={savedJobs} 
              contacts={savedContacts} 
              onNavigateToAgent={() => setActiveTab('agent')}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <WorkflowProvider>
        <AppContent />
      </WorkflowProvider>
    </ThemeProvider>
  )
}

export default App
