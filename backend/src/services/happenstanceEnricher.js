import axios from 'axios';

const HAPPENSTANCE_API_BASE = 'https://api.happenstance.ai';

/**
 * Happenstance Person Enricher - Enriches contact data with email and detailed info
 * 
 * Uses Happenstance AI API to find emails, social profiles, and other
 * personal information for contacts found via people search.
 */
export class HappenstanceEnricher {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.HAPPENSTANCE_API_KEY;
    this.name = 'Happenstance Enricher';
    this.type = 'person_enrichment';
    this.providerName = 'happenstance-ai';
    
    // Pricing model (per enrichment)
    this.basePriceUsd = 0.02; // $0.02 per person enrichment
    this.avgLatencyMs = 5000;
    this.reliabilityScore = 0.90;
  }

  /**
   * Get a quote for enrichment
   */
  async getQuote(params) {
    const numContacts = params.contacts?.length || 1;
    const price = this.basePriceUsd * numContacts;

    return {
      tool_id: 'happenstance-enricher',
      tool_name: this.name,
      provider: this.providerName,
      price_usd: Math.round(price * 1000) / 1000,
      latency_estimate_ms: this.avgLatencyMs * numContacts,
      reliability_score: this.reliabilityScore,
      capabilities: [
        'email_lookup',
        'social_profiles',
        'company_info',
        'professional_background'
      ],
      params_received: {
        num_contacts: numContacts
      }
    };
  }

  /**
   * Create a research request for a person
   */
  async createResearch(description) {
    try {
      const response = await axios.post(
        `${HAPPENSTANCE_API_BASE}/research`,
        { description },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('[HappenstanceEnricher] Create research error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get research results by ID
   */
  async getResearch(researchId) {
    try {
      const response = await axios.get(
        `${HAPPENSTANCE_API_BASE}/research/${researchId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('[HappenstanceEnricher] Get research error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Poll for research completion
   */
  async waitForResearch(researchId, maxWaitMs = 30000) {
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const research = await this.getResearch(researchId);
        
        if (research.status === 'completed' || research.status === 'done') {
          return research;
        }
        
        if (research.status === 'failed' || research.status === 'error') {
          throw new Error(`Research failed: ${research.error || 'Unknown error'}`);
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error.response?.status === 404) {
          throw new Error('Research not found');
        }
        throw error;
      }
    }

    throw new Error('Timeout waiting for research results');
  }

  /**
   * Build a research query for finding person details
   */
  buildPersonQuery(contact) {
    const parts = [];
    
    if (contact.name && contact.name !== 'Unknown') {
      parts.push(`Name: ${contact.name}`);
    }
    
    if (contact.title) {
      parts.push(`Title: ${contact.title}`);
    }
    
    if (contact.company && contact.company !== 'Unknown') {
      parts.push(`Company: ${contact.company}`);
    }
    
    if (contact.linkedin_url) {
      parts.push(`LinkedIn: ${contact.linkedin_url}`);
    }

    return `Find contact information including email address for this person:\n${parts.join('\n')}\n\nI need their professional email address and any other contact details.`;
  }

  /**
   * Enrich a single contact with detailed information
   */
  async enrichContact(contact) {
    if (!this.apiKey) {
      console.warn('[HappenstanceEnricher] No API key configured, skipping enrichment');
      return contact;
    }

    console.log(`[HappenstanceEnricher] Enriching contact: ${contact.name}`);

    try {
      const query = this.buildPersonQuery(contact);
      
      // Create research request
      const research = await this.createResearch(query);
      console.log(`[HappenstanceEnricher] Research created: ${research.id}`);

      // Wait for results
      const results = await this.waitForResearch(research.id);
      
      // Parse and merge the enriched data
      const enrichedData = this.parseEnrichmentResults(results);
      
      return {
        ...contact,
        ...enrichedData,
        enrichment_source: this.providerName,
        enrichment_timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[HappenstanceEnricher] Failed to enrich ${contact.name}:`, error.message);
      return {
        ...contact,
        enrichment_error: error.message,
        enrichment_source: this.providerName
      };
    }
  }

  /**
   * Enrich multiple contacts
   */
  async enrichContacts(contacts, options = {}) {
    const { parallel = false, maxConcurrent = 3 } = options;
    const enrichedContacts = [];

    if (parallel) {
      // Process in batches for parallel execution
      for (let i = 0; i < contacts.length; i += maxConcurrent) {
        const batch = contacts.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
          batch.map(contact => this.enrichContact(contact))
        );
        enrichedContacts.push(...batchResults);
      }
    } else {
      // Process sequentially
      for (const contact of contacts) {
        const enriched = await this.enrichContact(contact);
        enrichedContacts.push(enriched);
      }
    }

    return enrichedContacts;
  }

  /**
   * Parse enrichment results from Happenstance
   */
  parseEnrichmentResults(results) {
    const enriched = {};

    // Extract email if found
    if (results.email) {
      enriched.email = results.email;
    } else if (results.emails && results.emails.length > 0) {
      enriched.email = results.emails[0];
      enriched.additional_emails = results.emails.slice(1);
    }

    // Extract from results/people array if present
    if (results.results && Array.isArray(results.results)) {
      const person = results.results[0];
      if (person) {
        if (person.email) enriched.email = person.email;
        if (person.emails) {
          enriched.email = enriched.email || person.emails[0];
          enriched.additional_emails = person.emails.slice(1);
        }
        if (person.phone) enriched.phone = person.phone;
        if (person.linkedin) enriched.linkedin_url = person.linkedin;
        if (person.twitter) enriched.twitter_url = person.twitter;
        if (person.location) enriched.location = person.location;
        if (person.bio) enriched.bio = person.bio;
        if (person.company) enriched.company_details = person.company;
      }
    }

    // Handle alternative response structures
    if (results.people && Array.isArray(results.people)) {
      const person = results.people[0];
      if (person) {
        if (person.email) enriched.email = person.email;
        if (person.phone) enriched.phone = person.phone;
        if (person.social_profiles) {
          enriched.social_profiles = person.social_profiles;
        }
      }
    }

    // Extract from text content if structured data not available
    if (!enriched.email && results.content) {
      const emailMatch = results.content.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        enriched.email = emailMatch[0];
      }
    }

    return enriched;
  }

  /**
   * Quick lookup for a person by LinkedIn URL
   */
  async lookupByLinkedIn(linkedinUrl) {
    if (!this.apiKey) {
      throw new Error('Happenstance API key not configured');
    }

    const query = `Find the email address and contact information for this LinkedIn profile: ${linkedinUrl}`;
    
    try {
      const research = await this.createResearch(query);
      const results = await this.waitForResearch(research.id);
      return this.parseEnrichmentResults(results);
    } catch (error) {
      console.error('[HappenstanceEnricher] LinkedIn lookup failed:', error.message);
      throw error;
    }
  }

  /**
   * Quick lookup for a person by name and company
   */
  async lookupByNameAndCompany(name, company) {
    if (!this.apiKey) {
      throw new Error('Happenstance API key not configured');
    }

    const query = `Find the professional email address and contact information for ${name} who works at ${company}`;
    
    try {
      const research = await this.createResearch(query);
      const results = await this.waitForResearch(research.id);
      return this.parseEnrichmentResults(results);
    } catch (error) {
      console.error('[HappenstanceEnricher] Name/company lookup failed:', error.message);
      throw error;
    }
  }
}

/**
 * Mock enricher for testing without API calls
 */
export class MockHappenstanceEnricher {
  constructor() {
    this.name = 'Happenstance Enricher (Mock)';
    this.type = 'person_enrichment';
    this.providerName = 'mock-enricher';
    this.basePriceUsd = 100.00; // High price so real provider is preferred
    this.avgLatencyMs = 300;
    this.reliabilityScore = 0.99;
  }

  async getQuote(params) {
    return {
      tool_id: 'happenstance-enricher-mock',
      tool_name: this.name,
      provider: this.providerName,
      price_usd: this.basePriceUsd,
      latency_estimate_ms: this.avgLatencyMs,
      reliability_score: this.reliabilityScore,
      params_received: params
    };
  }

  async enrichContact(contact) {
    await new Promise(resolve => setTimeout(resolve, 200));

    // Generate mock email based on name and company
    const firstName = contact.name?.split(' ')[0]?.toLowerCase() || 'contact';
    const lastName = contact.name?.split(' ').slice(-1)[0]?.toLowerCase() || '';
    const companyDomain = contact.company?.toLowerCase().replace(/[^a-z]/g, '') || 'company';

    return {
      ...contact,
      email: `${firstName}.${lastName}@${companyDomain}.com`,
      phone: '+1-555-0100',
      location: 'San Francisco Bay Area',
      enrichment_source: this.providerName,
      enrichment_timestamp: new Date().toISOString()
    };
  }

  async enrichContacts(contacts) {
    const enriched = [];
    for (const contact of contacts) {
      enriched.push(await this.enrichContact(contact));
    }
    return enriched;
  }

  async lookupByLinkedIn(linkedinUrl) {
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      email: 'mock.user@company.com',
      phone: '+1-555-0100',
      location: 'San Francisco, CA'
    };
  }

  async lookupByNameAndCompany(name, company) {
    await new Promise(resolve => setTimeout(resolve, 200));
    const firstName = name.split(' ')[0]?.toLowerCase() || 'user';
    const lastName = name.split(' ').slice(-1)[0]?.toLowerCase() || '';
    const domain = company.toLowerCase().replace(/[^a-z]/g, '');
    return {
      email: `${firstName}.${lastName}@${domain}.com`,
      phone: '+1-555-0100',
      location: 'San Francisco, CA'
    };
  }
}

export default HappenstanceEnricher;

