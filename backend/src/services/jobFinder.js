import axios from 'axios';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'fantastic-jobs~advanced-linkedin-job-search-api';

/**
 * LinkedIn Job Finder Tool - Apify Advanced LinkedIn Job Search API Integration
 * 
 * Finds job listings from LinkedIn based on search queries, with advanced
 * filtering by title, location, company, seniority, work arrangement, etc.
 */
export class JobFinderTool {
  constructor(apiToken) {
    this.apiToken = apiToken;
    this.name = 'LinkedIn Job Finder';
    this.type = 'job_search';
    this.providerName = 'apify-linkedin-jobs';
    
    // Pricing model (per search)
    this.basePriceUsd = 0.02; // $0.02 per search
    this.avgLatencyMs = 5000;
    this.reliabilityScore = 0.94;
  }

  /**
   * Get a quote for the job search (x402 - 402 Payment Required)
   */
  async getQuote(params) {
    let price = this.basePriceUsd;
    
    // More results cost more
    if (params.limit > 25) {
      price += (params.limit - 25) * 0.001;
    }
    
    // Advanced filters add cost
    if (params.workArrangement) price += 0.003;
    if (params.seniorityLevel) price += 0.003;
    if (params.location) price += 0.002;

    return {
      tool_id: 'job-finder-linkedin',
      tool_name: this.name,
      provider: this.providerName,
      price_usd: Math.round(price * 1000) / 1000,
      latency_estimate_ms: this.avgLatencyMs,
      reliability_score: this.reliabilityScore,
      capabilities: [
        'job_title_search',
        'company_filter',
        'location_filter',
        'seniority_level',
        'work_arrangement',
        'easy_apply_filter',
        'salary_info',
        'ai_enrichments'
      ],
      params_received: {
        keywords: params.keywords,
        location: params.location,
        company: params.company,
        workArrangement: params.workArrangement,
        seniorityLevel: params.seniorityLevel,
        limit: params.limit || 25
      }
    };
  }

  /**
   * Build search input for the Apify actor
   * Uses the Advanced LinkedIn Job Search API parameters:
   * - titleSearch: Search in job title
   * - locationSearch: Search in job location  
   * - organizationSlugFilter: Filter by company LinkedIn slug
   * - remoteFilter: Filter for remote jobs
   */
  buildSearchInput(params) {
    const {
      keywords,
      location,
      company,
      workArrangement,      // 'remote', 'hybrid', 'on-site'
      seniorityLevel,       // 'entry', 'associate', 'mid-senior', 'director', 'executive'
      employmentType,       // 'full-time', 'part-time', 'contract', 'internship'
      easyApplyOnly,
      datePosted,           // 'past-24h', 'past-week', 'past-month'
      limit = 25
    } = params;

    const input = {
      limit,
    };

    // Title search - search in job title (must be array)
    if (keywords) {
      input.titleSearch = [keywords];
    }

    // Location search - search in job location (must be array)
    if (location) {
      // Don't use abbreviations - expand common ones
      const locationExpanded = this.expandLocation(location);
      input.locationSearch = [locationExpanded];
    }

    // Company search - use organizationSearch (searches company name)
    if (company) {
      input.organizationSearch = [company];
    }

    // Remote filter
    if (workArrangement === 'remote') {
      input.remote = true;
    }
    
    // Include AI enrichments
    input.includeAi = true;
    input.descriptionType = 'text';

    // Seniority level filter
    if (seniorityLevel) {
      const seniorityMap = {
        'entry': 'entry-level',
        'entry-level': 'entry-level',
        'associate': 'associate',
        'mid-senior': 'mid-senior-level',
        'mid-senior-level': 'mid-senior-level',
        'director': 'director',
        'executive': 'executive'
      };
      input.seniorityLevel = seniorityMap[seniorityLevel.toLowerCase()] || seniorityLevel;
    }

    // Employment type filter
    if (employmentType) {
      input.employmentType = employmentType.toLowerCase();
    }

    // Easy Apply filter
    if (easyApplyOnly) {
      input.easyApplyOnly = true;
    }

    // Date posted filter
    if (datePosted) {
      const datePostedMap = {
        '24h': 'past-24h',
        'past-24h': 'past-24h',
        'week': 'past-week',
        'past-week': 'past-week',
        'month': 'past-month',
        'past-month': 'past-month'
      };
      input.datePosted = datePostedMap[datePosted.toLowerCase()] || datePosted;
    }

    return input;
  }

  /**
   * Expand location abbreviations
   */
  expandLocation(location) {
    const abbreviations = {
      'US': 'United States',
      'USA': 'United States',
      'UK': 'United Kingdom',
      'NY': 'New York',
      'CA': 'California',
      'TX': 'Texas',
      'SF': 'San Francisco',
      'LA': 'Los Angeles',
      'DC': 'Washington DC',
    };
    
    // Check if it's a known abbreviation
    const upper = location.toUpperCase().trim();
    return abbreviations[upper] || location;
  }

  /**
   * Convert company name to LinkedIn slug format
   * e.g., "Mongo DB" -> "mongodb", "Google Inc" -> "google"
   */
  companyNameToSlug(company) {
    // Common company name to slug mappings
    const knownSlugs = {
      'mongodb': 'mongodb',
      'mongo db': 'mongodb',
      'google': 'google',
      'meta': 'meta',
      'facebook': 'meta',
      'amazon': 'amazon',
      'apple': 'apple',
      'microsoft': 'microsoft',
      'netflix': 'netflix',
      'stripe': 'stripe',
      'openai': 'openai',
      'anthropic': 'anthropic',
      'tesla': 'tesla-motors',
      'uber': 'uber-com',
      'airbnb': 'airbnb',
      'linkedin': 'linkedin',
      'salesforce': 'salesforce',
      'adobe': 'adobe',
      'nvidia': 'nvidia',
      'intel': 'intel-corporation',
      'ibm': 'ibm',
      'oracle': 'oracle',
      'spotify': 'spotify',
      'twitter': 'twitter',
      'x': 'x',
      'snap': 'snap-inc',
      'snapchat': 'snap-inc',
      'pinterest': 'pinterest',
      'reddit': 'reddit-com',
      'dropbox': 'dropbox',
      'slack': 'slack',
      'zoom': 'zoom-video-communications',
      'coinbase': 'coinbase',
      'robinhood': 'robinhood',
      'doordash': 'doordash',
      'instacart': 'instacart',
      'lyft': 'lyft',
    };

    const normalized = company.toLowerCase().trim();
    
    // Check known mappings first
    if (knownSlugs[normalized]) {
      return knownSlugs[normalized];
    }

    // Convert to slug format: lowercase, replace spaces with hyphens, remove special chars
    return normalized
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Execute the job search via Apify
   */
  async execute(params) {
    const searchInput = this.buildSearchInput(params);
    
    console.log(`[JobFinder] Executing search:`, JSON.stringify(searchInput, null, 2));

    try {
      // Start the Apify actor run
      const runResponse = await axios.post(
        `${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs`,
        searchInput,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            token: this.apiToken
          }
        }
      );

      const runId = runResponse.data.data.id;
      console.log(`[JobFinder] Actor run started: ${runId}`);

      // Wait for the run to complete
      const results = await this.waitForRunAndGetResults(runId);
      
      // Parse and structure the results
      const jobs = this.parseResults(results, params);
      
      return {
        success: true,
        searchParams: searchInput,
        jobs,
        raw_results: results,
        metadata: {
          provider: this.providerName,
          run_id: runId,
          total_found: jobs.length
        }
      };

    } catch (error) {
      console.error('[JobFinder] Error:', error.response?.data || error.message);
      throw new Error(`Job search failed: ${error.message}`);
    }
  }

  /**
   * Poll for run completion and get results
   */
  async waitForRunAndGetResults(runId, maxWaitMs = 120000) {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxWaitMs) {
      try {
        // Check run status
        const statusResponse = await axios.get(
          `${APIFY_BASE_URL}/actor-runs/${runId}`,
          {
            params: { token: this.apiToken }
          }
        );

        const status = statusResponse.data.data.status;
        console.log(`[JobFinder] Run status: ${status}`);

        if (status === 'SUCCEEDED') {
          // Get results from the default dataset
          const datasetId = statusResponse.data.data.defaultDatasetId;
          const resultsResponse = await axios.get(
            `${APIFY_BASE_URL}/datasets/${datasetId}/items`,
            {
              params: { token: this.apiToken }
            }
          );
          return resultsResponse.data;
        }

        if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
          throw new Error(`Actor run ${status}`);
        }

        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        if (error.response?.status === 404) {
          throw new Error('Run not found');
        }
        throw error;
      }
    }

    throw new Error('Timeout waiting for results');
  }

  /**
   * Extract company name from LinkedIn API response
   * Handles various field names and nested structures
   */
  extractCompanyName(item, context) {
    // Direct field names
    if (item.companyName) return item.companyName;
    if (item.organizationName) return item.organizationName;
    if (item.employerName) return item.employerName;
    
    // Nested company object (common in LinkedIn API)
    if (item.company) {
      if (typeof item.company === 'string') return item.company;
      if (item.company.name) return item.company.name;
      if (item.company.universalName) return item.company.universalName;
      if (item.company['universal-name']) return item.company['universal-name'];
    }
    
    // Nested organization object
    if (item.organization) {
      if (typeof item.organization === 'string') return item.organization;
      if (item.organization.name) return item.organization.name;
    }
    
    // Nested hiringOrganization (schema.org format)
    if (item.hiringOrganization) {
      if (typeof item.hiringOrganization === 'string') return item.hiringOrganization;
      if (item.hiringOrganization.name) return item.hiringOrganization.name;
    }
    
    // Fallback to search context (the company user searched for)
    if (context?.company) return context.company;
    
    // Log unknown structure for debugging
    console.log('[JobFinder] Could not find company name. Item keys:', Object.keys(item).join(', '));
    if (item.company) console.log('[JobFinder] company field type:', typeof item.company, item.company);
    
    return 'Unknown Company';
  }

  /**
   * Parse Apify results into structured job format
   */
  parseResults(rawResults, context) {
    if (!Array.isArray(rawResults)) {
      rawResults = [rawResults];
    }

    const jobs = [];

    for (const item of rawResults) {
      const job = this.extractJobInfo(item, context);
      if (job) {
        jobs.push(job);
      }
    }

    return jobs;
  }

  /**
   * Extract job information from a search result
   */
  extractJobInfo(item, context) {
    // Extract company name from various possible locations in LinkedIn API response
    const companyName = this.extractCompanyName(item, context);
    
    // The Advanced LinkedIn Job Search API returns structured data
    return {
      // Basic job info
      job_id: item.id || item.jobId || item.linkedin_job_id || null,
      title: item.title || item.jobTitle || 'Unknown Position',
      description: item.description || item.jobDescription || null,
      description_snippet: (item.description || item.jobDescription || '').substring(0, 500),
      
      // Company info
      company_name: companyName,
      company_url: item.companyUrl || item.companyLinkedInUrl || null,
      company_logo: item.companyLogo || item.logoUrl || null,
      company_size: item.companySize || item.employeeCount || null,
      company_industry: item.industry || item.companyIndustry || null,
      
      // Location & work arrangement
      location: item.location || item.jobLocation || null,
      work_arrangement: item.workArrangement || item.remoteType || null,
      
      // Job details
      employment_type: item.employmentType || item.jobType || null,
      seniority_level: item.seniorityLevel || item.experienceLevel || null,
      
      // Salary info (if available)
      salary_min: item.salaryMin || item.salary?.min || null,
      salary_max: item.salaryMax || item.salary?.max || null,
      salary_currency: item.salaryCurrency || item.salary?.currency || 'USD',
      salary_period: item.salaryPeriod || item.salary?.period || 'yearly',
      
      // Application info
      apply_url: item.applyUrl || item.applicationUrl || item.jobUrl || null,
      linkedin_url: item.linkedinUrl || item.jobUrl || item.url || null,
      easy_apply: item.easyApply || item.isEasyApply || false,
      
      // Dates
      posted_date: item.postedDate || item.datePosted || item.publishedAt || null,
      
      // AI enrichments (if available from the API)
      years_experience_required: item.yearsExperienceRequired || item.experienceYears || null,
      visa_sponsorship: item.visaSponsorship || null,
      skills: item.skills || item.requiredSkills || [],
      
      // Recruiter info (if available)
      recruiter_name: item.recruiterName || item.poster?.name || null,
      recruiter_title: item.recruiterTitle || item.poster?.title || null,
      recruiter_linkedin: item.recruiterLinkedIn || item.poster?.linkedinUrl || null,
      
      // Metadata
      search_keywords: context.keywords || null,
      fetched_at: new Date().toISOString()
    };
  }
}

/**
 * Mock Job Finder for testing without API calls
 */
export class MockJobFinderTool {
  constructor() {
    this.name = 'LinkedIn Job Finder (Mock)';
    this.type = 'job_search';
    this.providerName = 'mock-job-provider';
    this.basePriceUsd = 100.00; // Expensive fallback - real Apify provider will be preferred
    this.avgLatencyMs = 500;
    this.reliabilityScore = 0.99;
  }

  async getQuote(params) {
    return {
      tool_id: 'job-finder-mock',
      tool_name: this.name,
      provider: this.providerName,
      price_usd: this.basePriceUsd,
      latency_estimate_ms: this.avgLatencyMs,
      reliability_score: this.reliabilityScore,
      params_received: params
    };
  }

  async execute(params) {
    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, 500));

    const { 
      keywords = 'Software Engineer', 
      location = 'San Francisco, CA',
      company,
      workArrangement = 'hybrid'
    } = params;

    return {
      success: true,
      searchParams: { keywords, location, company, workArrangement },
      jobs: [
        {
          job_id: 'mock-job-001',
          title: `Senior ${keywords}`,
          description_snippet: `We're looking for a talented ${keywords} to join our team. You'll work on cutting-edge technology and collaborate with world-class engineers...`,
          company_name: company || 'TechCorp Inc.',
          company_industry: 'Technology',
          location: location,
          work_arrangement: workArrangement,
          employment_type: 'full-time',
          seniority_level: 'mid-senior-level',
          salary_min: 150000,
          salary_max: 200000,
          salary_currency: 'USD',
          salary_period: 'yearly',
          linkedin_url: 'https://linkedin.com/jobs/view/mock-job-001',
          easy_apply: true,
          posted_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          years_experience_required: 5,
          skills: ['JavaScript', 'Python', 'AWS', 'React'],
          recruiter_name: 'Sarah Chen',
          recruiter_title: 'Senior Technical Recruiter',
          recruiter_linkedin: 'https://linkedin.com/in/sarah-chen',
          search_keywords: keywords,
          fetched_at: new Date().toISOString()
        },
        {
          job_id: 'mock-job-002',
          title: `Staff ${keywords}`,
          description_snippet: `Join our engineering team as a Staff ${keywords}. Lead technical initiatives and mentor junior engineers while building scalable systems...`,
          company_name: company || 'InnovateTech',
          company_industry: 'Software',
          location: location,
          work_arrangement: 'remote',
          employment_type: 'full-time',
          seniority_level: 'director',
          salary_min: 200000,
          salary_max: 280000,
          salary_currency: 'USD',
          salary_period: 'yearly',
          linkedin_url: 'https://linkedin.com/jobs/view/mock-job-002',
          easy_apply: false,
          posted_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          years_experience_required: 8,
          skills: ['System Design', 'Leadership', 'Microservices', 'Kubernetes'],
          recruiter_name: 'Michael Rodriguez',
          recruiter_title: 'Engineering Manager',
          recruiter_linkedin: 'https://linkedin.com/in/michael-rodriguez',
          search_keywords: keywords,
          fetched_at: new Date().toISOString()
        },
        {
          job_id: 'mock-job-003',
          title: keywords,
          description_snippet: `Great opportunity for a ${keywords} at a fast-growing startup. Competitive salary, equity, and excellent benefits...`,
          company_name: company || 'StartupXYZ',
          company_industry: 'Fintech',
          location: location,
          work_arrangement: workArrangement,
          employment_type: 'full-time',
          seniority_level: 'mid-senior-level',
          salary_min: 140000,
          salary_max: 180000,
          salary_currency: 'USD',
          salary_period: 'yearly',
          linkedin_url: 'https://linkedin.com/jobs/view/mock-job-003',
          easy_apply: true,
          posted_date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          years_experience_required: 3,
          skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'GraphQL'],
          recruiter_name: null,
          recruiter_title: null,
          recruiter_linkedin: null,
          search_keywords: keywords,
          fetched_at: new Date().toISOString()
        }
      ],
      metadata: {
        provider: this.providerName,
        run_id: `mock-${Date.now()}`,
        total_found: 3
      }
    };
  }
}

export default JobFinderTool;
