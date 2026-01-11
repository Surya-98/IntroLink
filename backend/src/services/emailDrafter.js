import axios from 'axios';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

/**
 * Email Drafter Service - Uses Fireworks AI to generate personalized outreach emails
 * 
 * Generates compelling, personalized emails for job seekers to send to
 * recruiters and hiring managers based on resume and job context.
 */
export class EmailDrafterService {
  constructor(apiKey, senderName) {
    this.apiKey = apiKey || process.env.FIREWORKS_API_KEY;
    this.senderName = senderName || process.env.SENDER_NAME || 'Bala';
    this.model = 'accounts/fireworks/models/glm-4p7'
    
    // Pricing (approximate - Fireworks pricing varies)
    this.inputTokenCost = 0.0000002;  // $0.20 per 1M input tokens
    this.outputTokenCost = 0.0000002; // $0.20 per 1M output tokens
  }

  /**
   * Generate a personalized outreach email using streaming
   */
  async generateEmail(params) {
    const { resumeText, job, contact } = params;

    if (!this.apiKey) {
      throw new Error('FIREWORKS_API_KEY not configured');
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPromptFromRawResume(resumeText, job, contact);

    console.log(`[EmailDrafter] Generating email for ${contact.name} at ${job.company_name}`);

    try {
      const response = await axios.post(
        FIREWORKS_API_URL,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 20000,
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

      // Collect streamed content
      const content = await this.collectStreamedResponse(response.data);
      
      // Parse subject and body from the response
      const { subject, body } = this.parseEmailResponse(content);
      
      // Estimate tokens (streaming doesn't always return usage)
      const estimatedPromptTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const estimatedCompletionTokens = Math.ceil(content.length / 4);
      const cost = (estimatedPromptTokens * this.inputTokenCost) + (estimatedCompletionTokens * this.outputTokenCost);

      return {
        success: true,
        subject,
        body,
        raw_response: content,
        metadata: {
          model: this.model,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          cost_usd: Math.round(cost * 1000000) / 1000000 // Round to 6 decimals
        }
      };

    } catch (error) {
      console.error('[EmailDrafter] Error:', error.response?.data || error.message);
      throw new Error(`Email generation failed: ${error.message}`);
    }
  }

  /**
   * Collect and parse SSE stream response
   */
  async collectStreamedResponse(stream) {
    return new Promise((resolve, reject) => {
      let content = '';
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                content += delta;
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      });

      stream.on('end', () => {
        resolve(content);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Build the system prompt for email generation
   */
  buildSystemPrompt() {
    return `You are a senior career coach and outreach copywriter. Write a highly personalized, credible cold outreach message to a recruiter or hiring manager about a specific role.

Hard requirements:
- Body length: 90–170 words (shorter is better).
- Use 1 personalized hook grounded in the provided context (role/company/team/product/job description). If no real hook is available, use a neutral hook referencing the role scope only—do NOT invent facts.
- Include exactly 2 credibility bullets (•) with concrete outcomes (metrics, scope, impact). If metrics are missing, quantify conservatively without making up numbers.
- Mention 1 alignment line tying the user's experience to 1–2 responsibilities from the job posting.
- Clear, soft CTA: ask for a 10–15 minute chat or confirm the best person to speak with.
- Professional, warm, direct. No fluff, no desperation.

Style rules:
- Do NOT use: "I hope this email finds you well", "I'm reaching out because", "circling back", "just checking in", "would love to pick your brain".
- Avoid buzzwords and generic corporate language (e.g., "synergy", "passionate", "dynamic", "fast-paced").
- Do not over-praise the company. One sentence max.
- Never claim you used tools or searched the web unless explicitly provided in the context.
- Do not use em dashes (—). Use commas, parentheses, or short sentences instead.

Input you will receive (may be incomplete):
- role_title, company_name, job_url
- job_description (optional)
- recipient_name, recipient_role (optional)
- candidate_background (resume bullets/projects/skills)
- candidate_links (GitHub/portfolio/LinkedIn) (optional)

Output format (exactly):
SUBJECT: <5–8 words, specific, not cheesy>

BODY:
<email body with 1 short opening paragraph, then 2 bullet credibility lines, then 1 alignment sentence, then CTA + sign-off>`;
  }

  /**
   * Build user prompt using raw resume text (no parsing needed)
   */
  buildUserPromptFromRawResume(resumeText, job, contact) {
    const parts = [];

    parts.push('Write a personalized outreach email based on the following information:\n');

    // Candidate resume (raw text)
    parts.push('## CANDIDATE RESUME:');
    parts.push(resumeText.substring(0, 3000)); // Limit to avoid token overflow
    parts.push('');

    // Job info
    parts.push('## TARGET JOB:');
    parts.push(`Title: ${job.title}`);
    parts.push(`Company: ${job.company_name}`);
    if (job.location) parts.push(`Location: ${job.location}`);
    if (job.work_arrangement) parts.push(`Work Arrangement: ${job.work_arrangement}`);
    if (job.description_snippet) parts.push(`Job Description: ${job.description_snippet}`);
    if (job.skills?.length) parts.push(`Required Skills: ${job.skills.join(', ')}`);
    if (job.company_industry) parts.push(`Industry: ${job.company_industry}`);
    parts.push('');

    // Contact info
    parts.push('## RECIPIENT:');
    parts.push(`Name: ${contact.name}`);
    parts.push(`Title: ${contact.title}`);
    parts.push(`Company: ${contact.company}`);
    if (contact.snippet) parts.push(`Background: ${contact.snippet}`);
    parts.push('');

    parts.push('Write the email now. Extract relevant skills and experience from the resume to personalize the email.');

    return parts.join('\n');
  }

  /**
   * Parse the subject and body from the AI response
   */
  parseEmailResponse(content) {
    let subject = '';
    let body = '';

    // Try to extract subject
    const subjectMatch = content.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
    }

    // Try to extract body - look for BODY: marker
    const bodyMatch = content.match(/BODY:\s*([\s\S]+)/i);
    if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      // If no BODY: marker, use everything after the subject line
      const afterSubject = content.replace(/SUBJECT:\s*.+?\n/i, '').trim();
      body = afterSubject;
    }

    // Clean up body - remove chain-of-thought artifacts
    body = this.cleanEmailBody(body);

    // Fallback: if no structure found, use the whole thing
    if (!subject && !body) {
      const lines = content.split('\n').filter(l => l.trim());
      subject = lines[0] || 'Regarding the open position';
      body = lines.slice(1).join('\n') || content;
      body = this.cleanEmailBody(body);
    }

    return { subject, body };
  }

  /**
   * Clean up the email body by removing chain-of-thought reasoning artifacts
   */
  cleanEmailBody(body) {
    if (!body) return body;

    let cleanedBody = body;
    
    // First, try to find where the actual email starts (usually with a greeting)
    // Look for common greeting patterns
    const greetingPatterns = [
      /^(Hi\s+\w+)/im,
      /^(Hello\s+\w+)/im,
      /^(Dear\s+\w+)/im,
      /^(Hey\s+\w+)/im,
    ];

    let emailStart = -1;
    for (const pattern of greetingPatterns) {
      const match = cleanedBody.match(pattern);
      if (match && match.index !== undefined) {
        // Check if there's chain-of-thought content before this
        const beforeGreeting = cleanedBody.substring(0, match.index);
        const hasReasoning = beforeGreeting.match(/\d+\.\s+\*\*|\*\s+\*\*|^#+\s|Analyze|Drafting|Iteration|Refining|Checking/m);
        if (hasReasoning || beforeGreeting.length > 50) {
          emailStart = match.index;
          break;
        }
      }
    }

    // If we found reasoning before the greeting, extract from greeting onwards
    if (emailStart > 0) {
      cleanedBody = cleanedBody.substring(emailStart).trim();
    }

    // Find and cut at sign-off (don't include anything after)
    const signOffPatterns = [
      /(Best,?\s*)$/im,
      /(Best regards,?\s*)$/im,
      /(Sincerely,?\s*)$/im,
      /(Thanks,?\s*)$/im,
      /(Thank you,?\s*)$/im,
      /(Warm regards,?\s*)$/im,
      /(Cheers,?\s*)$/im,
      /(Looking forward,?\s*)$/im,
    ];

    // Find sign-off in the body, searching from the end
    const lines = cleanedBody.split('\n');
    let signOffIndex = -1;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      for (const pattern of signOffPatterns) {
        if (pattern.test(line)) {
          signOffIndex = i;
          break;
        }
      }
      if (signOffIndex >= 0) break;
      
      // Also check for standalone sign-offs like "Best," on its own line
      if (/^(Best|Thanks|Cheers|Sincerely|Warm regards|Best regards|Thank you|Looking forward),?\s*$/i.test(line)) {
        signOffIndex = i;
        break;
      }
    }

    if (signOffIndex >= 0) {
      cleanedBody = lines.slice(0, signOffIndex + 1).join('\n');
      // Append sender name after the sign-off
      cleanedBody += '\n' + this.senderName;
    }

    // Remove any remaining chain-of-thought artifacts
    // Remove numbered reasoning at start of lines
    cleanedBody = cleanedBody.replace(/^\d+\.\s+\*\*[^*]+\*\*:?\s*/gm, '');
    // Remove markdown headers
    cleanedBody = cleanedBody.replace(/^#{1,3}\s+.+\n?/gm, '');
    // Remove bullet point reasoning
    cleanedBody = cleanedBody.replace(/^\*\s+\*\*[^*]+\*\*:?\s*.*/gm, '');
    // Remove lines that are clearly reasoning/analysis
    cleanedBody = cleanedBody.replace(/^(Analyze|Analysis|Drafting|Refining|Checking|Strategy|Hook|Credibility|CTA|Constraints):?\s*.*/gim, '');
    
    // Clean up extra whitespace
    cleanedBody = cleanedBody.replace(/\n{3,}/g, '\n\n').trim();

    return cleanedBody;
  }

  /**
   * Generate multiple emails in batch
   */
  async generateBatch(resume, jobContactPairs) {
    const results = [];
    
    for (const { job, contact } of jobContactPairs) {
      try {
        const email = await this.generateEmail({ resume, job, contact });
        results.push({
          success: true,
          job_id: job._id || job.job_id,
          contact_id: contact._id,
          ...email
        });
      } catch (error) {
        results.push({
          success: false,
          job_id: job._id || job.job_id,
          contact_id: contact._id,
          error: error.message
        });
      }
      
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return results;
  }
}

export default EmailDrafterService;

