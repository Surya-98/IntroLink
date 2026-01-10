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
    this.model = 'accounts/fireworks/models/glm-4-9b-chat';
    
    // Pricing (approximate - Fireworks pricing varies)
    this.inputTokenCost = 0.0000002;  // $0.20 per 1M input tokens
    this.outputTokenCost = 0.0000002; // $0.20 per 1M output tokens
  }

  /**
   * Generate a personalized outreach email
   */
  async generateEmail(params) {
    const { resume, job, contact } = params;

    if (!this.apiKey) {
      throw new Error('FIREWORKS_API_KEY not configured');
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(resume, job, contact);

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
    return `You are an expert career coach and professional email writer. Your task is to write compelling, personalized outreach emails for job seekers to send to recruiters and hiring managers.

Guidelines for writing effective outreach emails:
1. Keep it concise (150-250 words max for the body)
2. Start with a personalized hook - mention something specific about the company or role
3. Quickly establish credibility with 1-2 key relevant achievements
4. Show genuine interest in the specific role/company
5. Include a clear, soft call-to-action (request a conversation, not demand a job)
6. Be professional but warm and authentic - avoid generic corporate speak
7. Never be pushy or desperate
8. Don't use phrases like "I hope this email finds you well" or "I'm reaching out because"

Output format:
SUBJECT: [Your subject line here]

BODY:
[Your email body here]

End with an appropriate professional sign-off but don't include a signature block.`;
  }

  /**
   * Build the user prompt with resume, job, and contact context
   */
  buildUserPrompt(resume, job, contact) {
    const parts = [];

    parts.push('Write a personalized outreach email based on the following information:\n');

    // Candidate (resume) info
    parts.push('## CANDIDATE INFORMATION:');
    parts.push(`Name: ${resume.name || 'Job Seeker'}`);
    if (resume.current_title) parts.push(`Current Role: ${resume.current_title}`);
    if (resume.current_company) parts.push(`Current Company: ${resume.current_company}`);
    if (resume.years_of_experience) parts.push(`Years of Experience: ${resume.years_of_experience}`);
    if (resume.summary) parts.push(`Summary: ${resume.summary}`);
    if (resume.skills?.length) parts.push(`Key Skills: ${resume.skills.slice(0, 10).join(', ')}`);
    if (resume.experience?.length) {
      const recentExp = resume.experience.slice(0, 2);
      parts.push('Recent Experience:');
      recentExp.forEach(exp => {
        parts.push(`- ${exp.title} at ${exp.company}`);
        if (exp.highlights?.length) {
          parts.push(`  Highlights: ${exp.highlights.slice(0, 2).join('; ')}`);
        }
      });
    }
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

    parts.push('Write the email now. Remember to be specific and personalized.');

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

    // Try to extract body
    const bodyMatch = content.match(/BODY:\s*([\s\S]+)/i);
    if (bodyMatch) {
      body = bodyMatch[1].trim();
    } else {
      // If no BODY: marker, use everything after the subject line
      const afterSubject = content.replace(/SUBJECT:\s*.+?\n/i, '').trim();
      body = afterSubject;
    }

    // Fallback: if no structure found, use the whole thing
    if (!subject && !body) {
      const lines = content.split('\n').filter(l => l.trim());
      subject = lines[0] || 'Regarding the open position';
      body = lines.slice(1).join('\n') || content;
    }

    return { subject, body };
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

