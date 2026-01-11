import axios from 'axios';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

/**
 * LinkedIn Drafter Service - Generates LinkedIn InMails and Connection Request messages
 * 
 * Creates personalized LinkedIn outreach messages including:
 * - InMail messages (up to 1900 characters)
 * - Connection request messages (up to 300 characters)
 */
export class LinkedInDrafterService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.FIREWORKS_API_KEY;
    this.model = 'accounts/fireworks/models/glm-4p7';
    
    // Pricing (approximate)
    this.inputTokenCost = 0.0000002;
    this.outputTokenCost = 0.0000002;
  }

  /**
   * Generate both InMail and Connection Request in parallel
   */
  async generateAll(params) {
    const [inmail, connectionRequest] = await Promise.all([
      this.generateInMail(params),
      this.generateConnectionRequest(params)
    ]);

    return {
      inmail,
      connectionRequest,
      totalCost: (inmail.metadata?.cost_usd || 0) + (connectionRequest.metadata?.cost_usd || 0)
    };
  }

  /**
   * Generate a LinkedIn InMail message
   * InMails can be up to 1900 characters
   */
  async generateInMail(params) {
    const { resumeText, job, contact } = params;

    if (!this.apiKey) {
      throw new Error('FIREWORKS_API_KEY not configured');
    }

    const systemPrompt = this.buildInMailSystemPrompt();
    const userPrompt = this.buildUserPrompt(resumeText, job, contact);

    console.log(`[LinkedInDrafter] Generating InMail for ${contact.name} at ${job.company_name}`);

    try {
      const response = await axios.post(
        FIREWORKS_API_URL,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 2000,
          temperature: 0.7,
          top_p: 0.9,
          stream: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      const content = await this.collectStreamedResponse(response.data);
      const { subject, body } = this.parseInMailResponse(content);
      
      const estimatedPromptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedCompletionTokens = Math.ceil(content.length / 4);
      const cost = (estimatedPromptTokens * this.inputTokenCost) + (estimatedCompletionTokens * this.outputTokenCost);

      return {
        success: true,
        type: 'inmail',
        subject,
        body,
        characterCount: body.length,
        raw_response: content,
        metadata: {
          model: this.model,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          cost_usd: Math.round(cost * 1000000) / 1000000
        }
      };

    } catch (error) {
      console.error('[LinkedInDrafter] InMail Error:', error.response?.data || error.message);
      return {
        success: false,
        type: 'inmail',
        error: error.message
      };
    }
  }

  /**
   * Generate a LinkedIn Connection Request message
   * Connection requests are limited to 300 characters
   */
  async generateConnectionRequest(params) {
    const { resumeText, job, contact } = params;

    if (!this.apiKey) {
      throw new Error('FIREWORKS_API_KEY not configured');
    }

    const systemPrompt = this.buildConnectionRequestSystemPrompt();
    const userPrompt = this.buildUserPrompt(resumeText, job, contact);

    console.log(`[LinkedInDrafter] Generating connection request for ${contact.name}`);

    try {
      const response = await axios.post(
        FIREWORKS_API_URL,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 500,
          temperature: 0.7,
          top_p: 0.9,
          stream: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );

      const content = await this.collectStreamedResponse(response.data);
      const message = this.parseConnectionRequestResponse(content);
      
      const estimatedPromptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedCompletionTokens = Math.ceil(content.length / 4);
      const cost = (estimatedPromptTokens * this.inputTokenCost) + (estimatedCompletionTokens * this.outputTokenCost);

      return {
        success: true,
        type: 'connection_request',
        message,
        characterCount: message.length,
        raw_response: content,
        metadata: {
          model: this.model,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          cost_usd: Math.round(cost * 1000000) / 1000000
        }
      };

    } catch (error) {
      console.error('[LinkedInDrafter] Connection Request Error:', error.response?.data || error.message);
      return {
        success: false,
        type: 'connection_request',
        error: error.message
      };
    }
  }

  /**
   * Build system prompt for InMail generation
   */
  buildInMailSystemPrompt() {
    return `You are a senior career coach specializing in LinkedIn outreach. Write a personalized LinkedIn InMail message to a recruiter or hiring manager about a specific role.

STRICT REQUIREMENTS:
- Total message body: 150-300 words (LinkedIn InMails can be up to 1900 characters)
- Subject line: 5-10 words, compelling and specific
- Professional but conversational tone (LinkedIn is less formal than email)
- One personalized hook based on the recipient's role/company/team
- One or two credibility points from the candidate's background
- Clear, soft call-to-action

STYLE RULES:
- Start with a personal touch - reference something specific about them or their company
- Be concise - recruiters skim InMails quickly
- No generic phrases like "I came across your profile" or "I'd love to connect"
- Avoid corporate buzzwords
- End with a simple question or request for a brief call
- Don't use em dashes (—)

OUTPUT FORMAT (exactly):
SUBJECT: <compelling 5-10 word subject line>

MESSAGE:
<InMail body - personalized opening, credibility points, alignment with role, soft CTA>`;
  }

  /**
   * Build system prompt for Connection Request generation
   */
  buildConnectionRequestSystemPrompt() {
    return `You are a senior career coach. Write a brief LinkedIn connection request message (MAXIMUM 300 characters including spaces).

STRICT REQUIREMENTS:
- MUST be under 300 characters total (this is a hard LinkedIn limit)
- Be specific about why you're connecting
- Mention the role or company
- Professional but warm
- No generic "I'd like to add you to my network"

STYLE RULES:
- First sentence: who you are + why you're reaching out
- Keep it to 2-3 short sentences max
- End with appreciation, not a request
- Don't use em dashes

OUTPUT FORMAT:
MESSAGE: <connection request under 300 characters>`;
  }

  /**
   * Build user prompt with context
   */
  buildUserPrompt(resumeText, job, contact) {
    const parts = [];

    parts.push('Write a LinkedIn message based on the following:\n');

    // Candidate info (condensed for LinkedIn)
    parts.push('## CANDIDATE SUMMARY:');
    // Extract first 1500 chars of resume for context
    parts.push(resumeText.substring(0, 1500));
    parts.push('');

    // Job info
    parts.push('## TARGET ROLE:');
    parts.push(`Position: ${job.title}`);
    parts.push(`Company: ${job.company_name}`);
    if (job.location) parts.push(`Location: ${job.location}`);
    if (job.description_snippet) parts.push(`About: ${job.description_snippet.substring(0, 300)}`);
    parts.push('');

    // Recipient info
    parts.push('## RECIPIENT:');
    parts.push(`Name: ${contact.name}`);
    parts.push(`Title: ${contact.title}`);
    parts.push(`Company: ${contact.company}`);
    if (contact.snippet) parts.push(`Background: ${contact.snippet.substring(0, 200)}`);
    parts.push('');

    parts.push('Generate the message now.');

    return parts.join('\n');
  }

  /**
   * Parse InMail response
   */
  parseInMailResponse(content) {
    let subject = '';
    let body = '';

    // Extract subject
    const subjectMatch = content.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
    }

    // Extract body
    const bodyMatch = content.match(/MESSAGE:\s*([\s\S]+)/i);
    if (bodyMatch) {
      body = this.cleanMessageBody(bodyMatch[1].trim());
    } else {
      // Fallback: everything after subject
      body = content.replace(/SUBJECT:\s*.+?\n/i, '').trim();
      body = this.cleanMessageBody(body);
    }

    // Ensure body is within LinkedIn limits (1900 chars)
    if (body.length > 1900) {
      body = body.substring(0, 1897) + '...';
    }

    return { subject, body };
  }

  /**
   * Parse Connection Request response
   */
  parseConnectionRequestResponse(content) {
    let message = '';

    // Extract message
    const messageMatch = content.match(/MESSAGE:\s*([\s\S]+)/i);
    if (messageMatch) {
      message = this.cleanMessageBody(messageMatch[1].trim());
    } else {
      message = this.cleanMessageBody(content.trim());
    }

    // Ensure message is within LinkedIn limit (300 chars)
    if (message.length > 300) {
      // Try to cut at a sentence boundary
      const truncated = message.substring(0, 297);
      const lastPeriod = truncated.lastIndexOf('.');
      const lastQuestion = truncated.lastIndexOf('?');
      const lastExclaim = truncated.lastIndexOf('!');
      const cutPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);
      
      if (cutPoint > 200) {
        message = message.substring(0, cutPoint + 1);
      } else {
        message = truncated + '...';
      }
    }

    return message;
  }

  /**
   * Clean message body
   */
  cleanMessageBody(body) {
    if (!body) return body;

    let cleaned = body;

    // Remove any chain-of-thought artifacts
    cleaned = cleaned.replace(/^\d+\.\s+\*\*[^*]+\*\*:?\s*/gm, '');
    cleaned = cleaned.replace(/^#{1,3}\s+.+\n?/gm, '');
    cleaned = cleaned.replace(/^\*\s+\*\*[^*]+\*\*:?\s*.*/gm, '');
    cleaned = cleaned.replace(/^(Analyze|Analysis|Drafting|Strategy|Hook):?\s*.*/gim, '');
    
    // Clean up whitespace
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

    return cleaned;
  }

  /**
   * Collect SSE stream response
   */
  async collectStreamedResponse(stream) {
    return new Promise((resolve, reject) => {
      let content = '';
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) content += delta;
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      stream.on('end', () => resolve(content));
      stream.on('error', reject);
    });
  }
}

export default LinkedInDrafterService;

