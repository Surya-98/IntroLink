import axios from 'axios';
import { Contact } from '../models/schemas.js';

const APIFY_BASE_URL = 'https://api.apify.com/v2';
const ACTOR_ID = 'fantastic-jobs~exa-ai-people-search';

/**
 * People Finder Tool - Apify Exa AI People Search Integration
 * 
 * Finds recruiters, hiring managers, and relevant contacts
 * using Exa's people search capabilities via Apify.
 */
export class PeopleFinderTool {
  constructor(apiToken) {
    this.apiToken = apiToken;
    this.name = 'People Finder';
    this.type = 'people_search';
    this.providerName = 'apify-exa';
    
    // Pricing model (per search)
    this.basePriceUsd = 0.015; // $0.015 per search
    this.avgLatencyMs = 3000;
    this.reliabilityScore = 0.92;
  }

  /**
   * Get a quote for the search (x402 - 402 Payment Required)
   */
  async getQuote(params) {
    // Calculate price based on query complexity
    let price = this.basePriceUsd;
    
    // More complex queries cost more
    if (params.numResults > 5) {
      price += (params.numResults - 5) * 0.002;
    }
    
    // Company-specific searches are more valuable
    if (params.company) {
      price += 0.005;
    }

    return {
      tool_id: 'people-finder-exa',
      tool_name: this.name,
      provider: this.providerName,
      price_usd: Math.round(price * 1000) / 1000, // Round to 3 decimals
      latency_estimate_ms: this.avgLatencyMs,
      reliability_score: this.reliabilityScore,
      capabilities: [
        'linkedin_profiles',
        'role_titles',
        'company_affiliation',
        'public_contact_info'
      ],
      params_received: {
        query: params.query,
        company: params.company,
        role: params.role,
        numResults: params.numResults || 5
      }
    };
  }

  /**
   * Build search query for finding recruiters/hiring managers
   */
  buildSearchQuery(params) {
    const { role, company, department } = params;
    
    // Build intelligent query for recruiting contacts
    const queryParts = [];
    
    if (company) {
      queryParts.push(`"${company}"`);
    }
    
    // Target recruiters or hiring managers
    const targetRoles = [
      'recruiter',
      'talent acquisition',
      'hiring manager',
      'engineering manager',
      'HR',
      'people operations'
    ];
    
    if (role) {
      // For engineering roles, also look for engineering managers
      if (role.toLowerCase().includes('engineer') || role.toLowerCase().includes('developer')) {
        queryParts.push('(recruiter OR "talent acquisition" OR "engineering manager" OR "hiring manager")');
      } else {
        queryParts.push('(recruiter OR "talent acquisition" OR "hiring manager")');
      }
    } else {
      queryParts.push('(recruiter OR "talent acquisition")');
    }
    
    if (department) {
      queryParts.push(`"${department}"`);
    }

    return queryParts.join(' ');
  }

  /**
   * Execute the people search via Apify
   */
  async execute(params) {
    const { query, company, role, numResults = 5 } = params;
    
    // Use provided query or build one
    const searchQuery = query || this.buildSearchQuery({ company, role });
    
    console.log(`[PeopleFinder] Executing search: "${searchQuery}"`);

    try {
      // Start the Apify actor run
      const runResponse = await axios.post(
        `${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs`,
        {
          query: searchQuery,
          numResults: numResults,
          // Exa-specific options
          type: 'neural', // Use neural search for better results
          useAutoprompt: true,
          contents: {
            text: true
          }
        },
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
      console.log(`[PeopleFinder] Actor run started: ${runId}`);

      // Wait for the run to complete
      const results = await this.waitForRunAndGetResults(runId);
      
      // Parse and structure the results
      const contacts = this.parseResults(results, { searchQuery, company, role });
      
      return {
        success: true,
        query: searchQuery,
        contacts,
        raw_results: results,
        metadata: {
          provider: this.providerName,
          run_id: runId,
          total_found: contacts.length
        }
      };

    } catch (error) {
      console.error('[PeopleFinder] Error:', error.response?.data || error.message);
      throw new Error(`People search failed: ${error.message}`);
    }
  }

  /**
   * Poll for run completion and get results
   */
  async waitForRunAndGetResults(runId, maxWaitMs = 60000) {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

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
        console.log(`[PeopleFinder] Run status: ${status}`);

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
   * Parse Exa results into structured contact format
   */
  parseResults(rawResults, context) {
    if (!Array.isArray(rawResults)) {
      rawResults = [rawResults];
    }

    const contacts = [];

    for (const result of rawResults) {
      // Handle Exa's result structure
      const items = result.results || result.data || [result];
      
      for (const item of items) {
        const contact = this.extractContactInfo(item, context);
        if (contact) {
          contacts.push(contact);
        }
      }
    }

    return contacts;
  }

  /**
   * Extract contact information from a search result
   */
  extractContactInfo(item, context) {
    // Exa returns URL, title, text, and metadata
    const url = item.url || item.link || '';
    const title = item.title || '';
    const text = item.text || item.snippet || item.content || '';
    
    // Try to determine if this is a LinkedIn profile
    const isLinkedIn = url.includes('linkedin.com/in/');
    
    // Extract name from title or URL
    let name = '';
    if (isLinkedIn) {
      // LinkedIn titles are usually "Name - Title - Company | LinkedIn"
      const titleParts = title.split(' - ');
      if (titleParts.length > 0) {
        name = titleParts[0].trim();
      }
    } else {
      name = title.split('|')[0].split('-')[0].trim();
    }

    // Extract role/title
    let role = '';
    if (isLinkedIn && title.includes(' - ')) {
      const parts = title.split(' - ');
      if (parts.length > 1) {
        role = parts[1].trim();
      }
    }

    // Extract company from title or use context
    let company = context.company || '';
    if (!company && title.includes(' at ')) {
      company = title.split(' at ')[1]?.split(/[|,-]/)[0]?.trim() || '';
    }

    // Try to find email in text (if public)
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    const email = emailMatch ? emailMatch[0] : null;

    return {
      name: name || 'Unknown',
      title: role || 'Professional',
      company: company || 'Unknown',
      linkedin_url: isLinkedIn ? url : null,
      source_url: url,
      email: email,
      snippet: text.substring(0, 300),
      search_query: context.searchQuery,
      relevance_score: item.score || null
    };
  }

  /**
   * Save contacts to database
   */
  async saveContacts(contacts, receiptId, costPerContact) {
    const savedContacts = [];
    
    for (const contact of contacts) {
      const saved = await Contact.create({
        ...contact,
        source: this.providerName,
        receipt_id: receiptId,
        cost_usd: costPerContact
      });
      savedContacts.push(saved);
    }

    return savedContacts;
  }
}

/**
 * Alternative/Mock provider for testing without API calls
 */
export class MockPeopleFinderTool {
  constructor() {
    this.name = 'People Finder (Mock)';
    this.type = 'people_search';
    this.providerName = 'mock-provider';
    this.basePriceUsd = 0.01;
    this.avgLatencyMs = 500;
    this.reliabilityScore = 0.99;
  }

  async getQuote(params) {
    return {
      tool_id: 'people-finder-mock',
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

    const { company = 'TechCorp', role = 'Software Engineer' } = params;

    return {
      success: true,
      query: params.query || `recruiter at ${company}`,
      contacts: [
        {
          name: 'Sarah Chen',
          title: 'Senior Technical Recruiter',
          company: company,
          linkedin_url: `https://linkedin.com/in/sarah-chen-recruiter`,
          email: null,
          snippet: `Technical recruiter specializing in ${role} roles at ${company}. Previously at Google and Meta.`,
          relevance_score: 0.95
        },
        {
          name: 'Michael Rodriguez',
          title: 'Engineering Manager',
          company: company,
          linkedin_url: `https://linkedin.com/in/michael-rodriguez-em`,
          email: null,
          snippet: `Engineering Manager leading the platform team at ${company}. Hiring for multiple ${role} positions.`,
          relevance_score: 0.88
        },
        {
          name: 'Emily Thompson',
          title: 'Talent Acquisition Partner',
          company: company,
          linkedin_url: `https://linkedin.com/in/emily-thompson-ta`,
          email: null,
          snippet: `Talent Acquisition Partner at ${company}, focused on engineering and product roles.`,
          relevance_score: 0.85
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

export default PeopleFinderTool;

