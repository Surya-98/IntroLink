/**
 * Tomba Email Enricher - Find email addresses from LinkedIn profiles
 * 
 * Uses Tomba.io API to find professional email addresses from LinkedIn URLs
 * API Documentation: https://developer.tomba.io/
 */

import axios from 'axios';

export class TombaEnricher {
  constructor(apiKey, apiSecret) {
    if (!apiKey || !apiSecret) {
      throw new Error('Tomba API key and secret are required');
    }
    
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.tomba.io/v1';
    this.providerName = 'tomba-enricher';
  }

  /**
   * Find email from LinkedIn profile URL
   * @param {string} linkedinUrl - LinkedIn profile URL
   * @returns {Promise<Object>} - Enrichment result with email
   */
  async findEmailByLinkedIn(linkedinUrl) {
    if (!linkedinUrl) {
      return { success: false, error: 'LinkedIn URL is required' };
    }

    // Normalize LinkedIn URL
    const normalizedUrl = this.normalizeLinkedInUrl(linkedinUrl);
    
    console.log(`[Tomba] Looking up email for: ${normalizedUrl}`);

    try {
      const response = await axios.get(`${this.baseUrl}/linkedin`, {
        headers: {
          'X-Tomba-Key': this.apiKey,
          'X-Tomba-Secret': this.apiSecret
        },
        params: {
          url: normalizedUrl
        }
      });

      const data = response.data?.data;
      
      if (data?.email) {
        console.log(`[Tomba] Found email for ${normalizedUrl}: ${data.email}`);
        return {
          success: true,
          email: data.email,
          email_type: data.type || 'unknown', // personal, professional, etc.
          confidence: data.score || null,
          first_name: data.first_name,
          last_name: data.last_name,
          full_name: data.full_name,
          position: data.position,
          company: data.company,
          twitter: data.twitter,
          linkedin_url: normalizedUrl,
          source: 'tomba'
        };
      }

      console.log(`[Tomba] No email found for ${normalizedUrl}`);
      return { 
        success: false, 
        error: 'No email found for this LinkedIn profile',
        linkedin_url: normalizedUrl
      };

    } catch (error) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
      
      console.error(`[Tomba] Error looking up ${normalizedUrl}:`, errorMessage);
      
      // Handle specific error codes
      if (statusCode === 404) {
        return { success: false, error: 'LinkedIn profile not found or no email available' };
      } else if (statusCode === 401) {
        return { success: false, error: 'Invalid Tomba API credentials' };
      } else if (statusCode === 429) {
        return { success: false, error: 'Rate limit exceeded. Please try again later.' };
      }
      
      return { 
        success: false, 
        error: `Email lookup failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Find email by name and domain/company
   * @param {string} firstName - First name
   * @param {string} lastName - Last name  
   * @param {string} domain - Company domain (e.g., stripe.com)
   * @returns {Promise<Object>} - Enrichment result with email
   */
  async findEmailByNameDomain(firstName, lastName, domain) {
    if (!firstName || !lastName || !domain) {
      return { success: false, error: 'First name, last name, and domain are required' };
    }

    console.log(`[Tomba] Looking up email for: ${firstName} ${lastName} at ${domain}`);

    try {
      const response = await axios.get(`${this.baseUrl}/email-finder`, {
        headers: {
          'X-Tomba-Key': this.apiKey,
          'X-Tomba-Secret': this.apiSecret
        },
        params: {
          domain: domain,
          first_name: firstName,
          last_name: lastName
        }
      });

      const data = response.data?.data;
      
      if (data?.email) {
        console.log(`[Tomba] Found email: ${data.email}`);
        return {
          success: true,
          email: data.email,
          email_type: data.type || 'professional',
          confidence: data.score || null,
          first_name: firstName,
          last_name: lastName,
          domain: domain,
          source: 'tomba'
        };
      }

      return { success: false, error: 'No email found' };

    } catch (error) {
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
      console.error(`[Tomba] Error:`, errorMessage);
      return { success: false, error: `Email lookup failed: ${errorMessage}` };
    }
  }

  /**
   * Verify if an email is valid and deliverable
   * @param {string} email - Email address to verify
   * @returns {Promise<Object>} - Verification result
   */
  async verifyEmail(email) {
    if (!email) {
      return { success: false, error: 'Email is required' };
    }

    console.log(`[Tomba] Verifying email: ${email}`);

    try {
      const response = await axios.get(`${this.baseUrl}/email-verifier/${encodeURIComponent(email)}`, {
        headers: {
          'X-Tomba-Key': this.apiKey,
          'X-Tomba-Secret': this.apiSecret
        }
      });

      const data = response.data?.data;
      
      return {
        success: true,
        email: email,
        is_valid: data?.result === 'deliverable',
        result: data?.result, // deliverable, undeliverable, risky, unknown
        is_disposable: data?.disposable || false,
        is_webmail: data?.webmail || false,
        mx_records: data?.mx_records || false,
        source: 'tomba'
      };

    } catch (error) {
      const errorMessage = error.response?.data?.errors?.[0]?.message || error.message;
      console.error(`[Tomba] Verification error:`, errorMessage);
      return { success: false, error: `Email verification failed: ${errorMessage}` };
    }
  }

  /**
   * Enrich a contact object with email from LinkedIn
   * @param {Object} contact - Contact object with linkedin_url
   * @returns {Promise<Object>} - Enriched contact
   */
  async enrichContact(contact) {
    if (!contact.linkedin_url) {
      return contact;
    }

    const result = await this.findEmailByLinkedIn(contact.linkedin_url);
    
    if (result.success && result.email) {
      return {
        ...contact,
        email: result.email,
        email_confidence: result.confidence,
        email_source: 'tomba',
        tomba_data: {
          email_type: result.email_type,
          confidence: result.confidence,
          twitter: result.twitter
        }
      };
    }

    return contact;
  }

  /**
   * Enrich multiple contacts in batch
   * @param {Array} contacts - Array of contact objects
   * @param {Object} options - Options (parallel: boolean, delay: number)
   * @returns {Promise<Array>} - Enriched contacts
   */
  async enrichContacts(contacts, options = {}) {
    const { parallel = false, delay = 500 } = options;
    const enrichedContacts = [];

    if (parallel) {
      // Parallel processing (careful with rate limits)
      const promises = contacts.map(contact => this.enrichContact(contact));
      return Promise.all(promises);
    }

    // Sequential processing with delay
    for (const contact of contacts) {
      const enriched = await this.enrichContact(contact);
      enrichedContacts.push(enriched);
      
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return enrichedContacts;
  }

  /**
   * Normalize LinkedIn URL to standard format
   */
  normalizeLinkedInUrl(url) {
    if (!url) return url;
    
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    
    // Ensure https
    if (!url.startsWith('http')) {
      url = 'https://' + url;
    }
    
    // Convert to www.linkedin.com format
    url = url.replace('://linkedin.com', '://www.linkedin.com');
    
    return url;
  }
}

/**
 * Mock Tomba Enricher for testing
 */
export class MockTombaEnricher {
  constructor() {
    this.providerName = 'tomba-enricher-mock';
  }

  async findEmailByLinkedIn(linkedinUrl) {
    // Extract username from URL for mock data
    const username = linkedinUrl.split('/in/')[1]?.replace(/\/$/, '') || 'unknown';
    
    // Generate mock email
    const mockEmail = `${username}@example.com`;
    
    return {
      success: true,
      email: mockEmail,
      email_type: 'professional',
      confidence: 0.95,
      first_name: username.charAt(0).toUpperCase() + username.slice(1),
      last_name: 'User',
      full_name: `${username.charAt(0).toUpperCase() + username.slice(1)} User`,
      linkedin_url: linkedinUrl,
      source: 'tomba-mock'
    };
  }

  async findEmailByNameDomain(firstName, lastName, domain) {
    const mockEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    
    return {
      success: true,
      email: mockEmail,
      email_type: 'professional',
      confidence: 0.85,
      first_name: firstName,
      last_name: lastName,
      domain: domain,
      source: 'tomba-mock'
    };
  }

  async verifyEmail(email) {
    return {
      success: true,
      email: email,
      is_valid: true,
      result: 'deliverable',
      is_disposable: false,
      is_webmail: email.includes('gmail') || email.includes('yahoo'),
      source: 'tomba-mock'
    };
  }

  async enrichContact(contact) {
    if (contact.linkedin_url) {
      const result = await this.findEmailByLinkedIn(contact.linkedin_url);
      if (result.success) {
        return { ...contact, email: result.email, email_source: 'tomba-mock' };
      }
    }
    return contact;
  }

  async enrichContacts(contacts, options = {}) {
    return Promise.all(contacts.map(c => this.enrichContact(c)));
  }
}

export default TombaEnricher;

