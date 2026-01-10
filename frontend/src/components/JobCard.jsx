export default function JobCard({ job, compact = false }) {
  const {
    title,
    company_name,
    company_logo,
    company_industry,
    location,
    work_arrangement,
    employment_type,
    seniority_level,
    salary_min,
    salary_max,
    salary_currency,
    description_snippet,
    linkedin_url,
    easy_apply,
    posted_date,
    skills,
    recruiter_name,
    recruiter_linkedin
  } = job

  const formatSalary = () => {
    if (!salary_min && !salary_max) return null
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: salary_currency || 'USD', maximumFractionDigits: 0 })
    if (salary_min && salary_max) {
      return `${formatter.format(salary_min)} - ${formatter.format(salary_max)}`
    }
    return salary_min ? `From ${formatter.format(salary_min)}` : `Up to ${formatter.format(salary_max)}`
  }

  const formatDate = (date) => {
    if (!date) return null
    const d = new Date(date)
    const now = new Date()
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24))
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Yesterday'
    if (diff < 7) return `${diff} days ago`
    if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`
    return d.toLocaleDateString()
  }

  if (compact) {
    return (
      <div className="p-4 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-ink-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {company_logo ? (
              <img src={company_logo} alt={company_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-bold text-ink-500">
                {company_name?.charAt(0) || '?'}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-white truncate">{title}</h4>
            <p className="text-sm text-ink-400">{company_name}</p>
          </div>
          {work_arrangement && (
            <span className="tag-gray text-xs">{work_arrangement}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 hover:border-ink-700 transition-all card-hover">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Company Logo */}
        <div className="w-14 h-14 rounded-xl bg-ink-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
          {company_logo ? (
            <img src={company_logo} alt={company_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-ink-500">
              {company_name?.charAt(0) || '?'}
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="text-ink-400">
                {company_name}
                {company_industry && <span className="text-ink-500"> • {company_industry}</span>}
              </p>
            </div>
            {formatSalary() && (
              <div className="text-lg font-semibold text-volt-400 font-mono">
                {formatSalary()}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-4">
            {location && (
              <span className="tag-gray">
                <LocationIcon className="w-3 h-3 mr-1" />
                {location}
              </span>
            )}
            {work_arrangement && (
              <span className={`tag ${work_arrangement.toLowerCase() === 'remote' ? 'tag-green' : 'tag-gray'}`}>
                {work_arrangement}
              </span>
            )}
            {employment_type && (
              <span className="tag-gray">{employment_type}</span>
            )}
            {seniority_level && (
              <span className="tag-purple">{seniority_level}</span>
            )}
            {easy_apply && (
              <span className="tag-green">Easy Apply</span>
            )}
          </div>

          {/* Description */}
          {description_snippet && (
            <p className="text-sm text-ink-400 mb-4 line-clamp-2">
              {description_snippet}
            </p>
          )}

          {/* Skills */}
          {skills && skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {skills.slice(0, 6).map((skill, i) => (
                <span key={i} className="px-2 py-0.5 text-xs rounded bg-ink-800 text-ink-300">
                  {skill}
                </span>
              ))}
              {skills.length > 6 && (
                <span className="px-2 py-0.5 text-xs rounded bg-ink-800 text-ink-500">
                  +{skills.length - 6} more
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-4 border-t border-ink-800">
            <div className="flex items-center gap-4 text-sm text-ink-500">
              {posted_date && (
                <span>Posted {formatDate(posted_date)}</span>
              )}
              {recruiter_name && (
                <span className="flex items-center gap-1">
                  <span className="text-ink-400">Posted by:</span>
                  {recruiter_linkedin ? (
                    <a 
                      href={recruiter_linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pulse-400 hover:text-pulse-300"
                    >
                      {recruiter_name}
                    </a>
                  ) : (
                    <span className="text-ink-300">{recruiter_name}</span>
                  )}
                </span>
              )}
            </div>
            
            {linkedin_url && (
              <a
                href={linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm"
              >
                <LinkedInIcon className="w-4 h-4" />
                View on LinkedIn
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LocationIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
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

