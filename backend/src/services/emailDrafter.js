import axios from 'axios';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

/**
 * Email Drafter Service - Uses Fireworks AI to generate personalized outreach emails
 * 
 * Generates compelling, personalized emails for job seekers to send to
 * recruiters and hiring managers based on resume and job context.
 */
export class EmailDrafterService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.FIREWORKS_API_KEY;
    this.model = 'accounts/fireworks/models/glm-4p7'
    
    // Pricing (approximate - Fireworks pricing varies)
    this.inputTokenCost = 0.0000002;  // $0.20 per 1M input tokens
    this.outputTokenCost = 0.0000002; // $0.20 per 1M output tokens
  }

  /**
   * Generate a personalized outreach email
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
          max_tokens: 1000,
          temperature: 0.7,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;
      const content = result.choices[0]?.message?.content || '';
      
      // Parse subject and body from the response
      const { subject, body } = this.parseEmailResponse(content);
      
      // Calculate cost
      const promptTokens = result.usage?.prompt_tokens || 0;
      const completionTokens = result.usage?.completion_tokens || 0;
      const cost = (promptTokens * this.inputTokenCost) + (completionTokens * this.outputTokenCost);

      return {
        success: true,
        subject,
        body,
        raw_response: content,
        metadata: {
          model: this.model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: Math.round(cost * 1000000) / 1000000 // Round to 6 decimals
        }
      };

    } catch (error) {
      console.error('[EmailDrafter] Error:', error.response?.data || error.message);
      throw new Error(`Email generation failed: ${error.message}`);
    }
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

    // Remove numbered reasoning steps (1. **, 2. **, etc.)
    // These are chain-of-thought artifacts from the LLM
    const reasoningPatterns = [
      /^\d+\.\s+\*\*.*?\*\*[\s\S]*?(?=\n\n|\nHi\s|\nHello\s|\nDear\s|$)/gm,  // "1. **Analyze**..." patterns
      /^\*\s+\*\*.*?\*\*.*$/gm,  // "* **Key point**..." patterns
      /^#{1,3}\s+.+$/gm,  // Markdown headers in reasoning
    ];

    let cleanedBody = body;
    
    // Find where the actual email starts (usually with a greeting)
    const greetingMatch = cleanedBody.match(/\n?(Hi\s+\w+|Hello\s+\w+|Dear\s+\w+)/i);
    if (greetingMatch && greetingMatch.index !== undefined) {
      // Check if there's reasoning content before the greeting
      const beforeGreeting = cleanedBody.substring(0, greetingMatch.index);
      if (beforeGreeting.match(/\d+\.\s+\*\*|\*\s+\*\*|^#+\s/m)) {
        // There's reasoning before the greeting, extract from greeting onwards
        cleanedBody = cleanedBody.substring(greetingMatch.index).trim();
      }
    }

    // Remove any trailing reasoning (often starts with numbered items or bullet points after sign-off)
    const signOffPatterns = [
      /Best,?\s*$/i,
      /Best regards,?\s*$/i,
      /Sincerely,?\s*$/i,
      /Thanks,?\s*$/i,
      /Thank you,?\s*$/i,
      /Warm regards,?\s*$/i,
      /Cheers,?\s*$/i,
    ];

    for (const pattern of signOffPatterns) {
      const match = cleanedBody.match(pattern);
      if (match && match.index !== undefined) {
        // Keep everything up to and including the sign-off
        cleanedBody = cleanedBody.substring(0, match.index + match[0].length);
        break;
      }
    }

    // Remove any remaining chain-of-thought numbering at the start
    cleanedBody = cleanedBody.replace(/^\d+\.\s+\*\*[^*]+\*\*:?\s*/gm, '');
    
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

