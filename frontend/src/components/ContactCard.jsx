export default function ContactCard({ contact, compact = false }) {
  const {
    name,
    title,
    company,
    linkedin_url,
    email,
    snippet,
    relevance_score
  } = contact

  const getInitials = (name) => {
    if (!name || name === 'Unknown') return '?'
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (name) => {
    const colors = [
      'from-volt-500 to-volt-600',
      'from-pulse-500 to-pulse-600',
      'from-blue-500 to-blue-600',
      'from-amber-500 to-amber-600',
      'from-rose-500 to-rose-600',
      'from-teal-500 to-teal-600',
    ]
    const index = name ? name.charCodeAt(0) % colors.length : 0
    return colors[index]
  }

  if (compact) {
    return (
      <div className="p-4 rounded-xl bg-ink-900/50 border border-ink-800 hover:border-ink-700 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center flex-shrink-0`}>
            <span className="text-sm font-bold text-white">{getInitials(name)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-white truncate">{name}</h4>
            <p className="text-sm text-ink-400 truncate">{title} at {company}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-2xl bg-ink-950 border border-ink-800 hover:border-ink-700 transition-all card-hover">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${getAvatarColor(name)} flex items-center justify-center flex-shrink-0`}>
          <span className="text-xl font-bold text-white">{getInitials(name)}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="text-lg font-semibold text-white">{name}</h3>
              <p className="text-ink-400">
                {title}
                {company && <span className="text-ink-500"> at {company}</span>}
              </p>
            </div>
            {relevance_score && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-pulse-500/10 border border-pulse-500/20">
                <span className="text-xs text-pulse-400 font-medium">
                  {Math.round(relevance_score * 100)}% match
                </span>
              </div>
            )}
          </div>

          {/* Snippet */}
          {snippet && (
            <p className="text-sm text-ink-400 mb-4 line-clamp-2">
              {snippet}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {linkedin_url && (
              <a
                href={linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-sm py-2"
              >
                <LinkedInIcon className="w-4 h-4" />
                View Profile
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="btn-ghost text-sm py-2 border border-ink-800"
              >
                <EmailIcon className="w-4 h-4" />
                {email}
              </a>
            )}
            {!linkedin_url && !email && (
              <span className="text-sm text-ink-500">No direct contact available</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkedInIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
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

