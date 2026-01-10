import axios from 'axios';

const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

/**
 * Resume Parser Service - Uses Fireworks AI to parse and structure resume data
 * 
 * Extracts structured information from raw resume text including:
 * - Contact info, skills, experience, education, certifications
 */
export class ResumeParserService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.FIREWORKS_API_KEY;
    // GLM-4 model
    this.model = 'accounts/fireworks/models/glm-4p7';
    
    // Pricing (GLM-4 on Fireworks)
    this.inputTokenCost = 0.0000002;
    this.outputTokenCost = 0.0000002;
  }

  /**
   * Parse raw resume text into structured data
   */
  async parseResume(resumeText) {
    if (!this.apiKey) {
      throw new Error('FIREWORKS_API_KEY not configured');
    }

    console.log('[ResumeParser] Parsing resume...');

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = `Parse the following resume and extract structured information:\n\n${resumeText}`;

    try {
      const response = await axios.post(
        FIREWORKS_API_URL,
        {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 3000,
          temperature: 0.1, // Low temperature for consistent parsing
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;
      const content = result.choices[0]?.message?.content || '{}';
      
      // Parse the JSON response
      let parsedResume;
      try {
        parsedResume = JSON.parse(content);
      } catch (parseError) {
        console.log('[ResumeParser] Direct JSON parse failed, attempting extraction...');
        
        // Try multiple extraction strategies
        parsedResume = this.extractJSON(content);
        
        if (!parsedResume) {
          console.error('[ResumeParser] Failed to extract JSON from response. First 500 chars:', content.substring(0, 500));
          throw new Error('Failed to parse resume structure');
        }
      }

      // Calculate cost
      const promptTokens = result.usage?.prompt_tokens || 0;
      const completionTokens = result.usage?.completion_tokens || 0;
      const cost = (promptTokens * this.inputTokenCost) + (completionTokens * this.outputTokenCost);

      // Post-process and validate
      const structured = this.postProcess(parsedResume);

      console.log(`[ResumeParser] Successfully parsed resume for: ${structured.name || 'Unknown'}`);

      return {
        success: true,
        data: structured,
        raw_text: resumeText,
        metadata: {
          model: this.model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cost_usd: Math.round(cost * 1000000) / 1000000
        }
      };

    } catch (error) {
      console.error('[ResumeParser] Error:', error.response?.data || error.message);
      throw new Error(`Resume parsing failed: ${error.message}`);
    }
  }

  /**
   * Build the system prompt for resume parsing
   */
  buildSystemPrompt() {
    return `You are a resume parser API. You MUST respond with ONLY a JSON object, no other text.

CRITICAL: Your entire response must be a single valid JSON object. Do not include any explanations, markdown, or text outside the JSON.

Extract this structure from the resume:

{"name":"string","email":"string|null","phone":"string|null","location":"string|null","linkedin_url":"string|null","portfolio_url":"string|null","summary":"string|null","skills":["string"],"technical_skills":["string"],"soft_skills":["string"],"experience":[{"company":"string","title":"string","location":"string|null","start_date":"string","end_date":"string","is_current":boolean,"description":"string|null","highlights":["string"]}],"education":[{"institution":"string","degree":"string|null","field":"string|null","graduation_date":"string|null","gpa":"string|null"}],"certifications":["string"],"projects":[{"name":"string","description":"string|null","technologies":["string"],"url":"string|null"}],"years_of_experience":number,"current_title":"string|null","current_company":"string|null"}

Rules:
- Use null for missing fields
- Calculate years_of_experience from work dates
- Set is_current=true and end_date="Present" for current jobs
- The most recent job is usually listed first
- Output ONLY the JSON object, nothing else`;
  }

  /**
   * Extract JSON from a response that may contain other text
   */
  extractJSON(content) {
    // Strategy 1: Find JSON object with balanced braces
    let depth = 0;
    let start = -1;
    let end = -1;
    
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          end = i + 1;
          break;
        }
      }
    }
    
    if (start !== -1 && end !== -1) {
      try {
        const jsonStr = content.substring(start, end);
        return JSON.parse(jsonStr);
      } catch (e) {
        // Continue to next strategy
      }
    }
    
    // Strategy 2: Try to find JSON in code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {
        // Continue
      }
    }
    
    // Strategy 3: Greedy regex match
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Try to fix common issues
        let fixed = jsonMatch[0]
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/'/g, '"');     // Replace single quotes
        try {
          return JSON.parse(fixed);
        } catch (e2) {
          // Give up
        }
      }
    }
    
    return null;
  }

  /**
   * Post-process and validate the parsed resume data
   */
  postProcess(parsed) {
    // Ensure arrays exist
    const result = {
      name: parsed.name || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      location: parsed.location || null,
      linkedin_url: parsed.linkedin_url || null,
      portfolio_url: parsed.portfolio_url || null,
      summary: parsed.summary || null,
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      technical_skills: Array.isArray(parsed.technical_skills) ? parsed.technical_skills : [],
      soft_skills: Array.isArray(parsed.soft_skills) ? parsed.soft_skills : [],
      experience: Array.isArray(parsed.experience) ? parsed.experience.map(exp => ({
        company: exp.company || 'Unknown Company',
        title: exp.title || 'Unknown Position',
        location: exp.location || null,
        start_date: exp.start_date || null,
        end_date: exp.end_date || null,
        is_current: exp.is_current || false,
        description: exp.description || null,
        highlights: Array.isArray(exp.highlights) ? exp.highlights : []
      })) : [],
      education: Array.isArray(parsed.education) ? parsed.education.map(edu => ({
        institution: edu.institution || 'Unknown Institution',
        degree: edu.degree || null,
        field: edu.field || null,
        graduation_date: edu.graduation_date || null,
        gpa: edu.gpa || null
      })) : [],
      certifications: Array.isArray(parsed.certifications) ? parsed.certifications : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(proj => ({
        name: proj.name || 'Unnamed Project',
        description: proj.description || null,
        technologies: Array.isArray(proj.technologies) ? proj.technologies : [],
        url: proj.url || null
      })) : [],
      years_of_experience: parsed.years_of_experience || this.calculateYearsExperience(parsed.experience),
      current_title: parsed.current_title || this.extractCurrentTitle(parsed.experience),
      current_company: parsed.current_company || this.extractCurrentCompany(parsed.experience)
    };

    // Combine all skills if technical_skills is empty
    if (result.technical_skills.length === 0 && result.skills.length > 0) {
      result.technical_skills = result.skills;
    }

    return result;
  }

  /**
   * Calculate years of experience from work history
   */
  calculateYearsExperience(experience) {
    if (!Array.isArray(experience) || experience.length === 0) {
      return 0;
    }

    // Find the earliest start date
    let earliestDate = new Date();
    
    for (const exp of experience) {
      if (exp.start_date) {
        const startDate = this.parseDate(exp.start_date);
        if (startDate && startDate < earliestDate) {
          earliestDate = startDate;
        }
      }
    }

    const years = (new Date() - earliestDate) / (1000 * 60 * 60 * 24 * 365);
    return Math.round(years);
  }

  /**
   * Parse a date string like "January 2020" or "2020"
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Handle "Present" or "Current"
    if (/present|current/i.test(dateStr)) {
      return new Date();
    }

    // Try parsing as-is
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try parsing year only
    const yearMatch = dateStr.match(/\d{4}/);
    if (yearMatch) {
      return new Date(yearMatch[0], 0, 1);
    }

    return null;
  }

  /**
   * Extract current job title from experience
   */
  extractCurrentTitle(experience) {
    if (!Array.isArray(experience) || experience.length === 0) {
      return null;
    }

    // Find current position
    const current = experience.find(exp => exp.is_current);
    if (current) {
      return current.title;
    }

    // Return most recent (first in list, assuming sorted)
    return experience[0]?.title || null;
  }

  /**
   * Extract current company from experience
   */
  extractCurrentCompany(experience) {
    if (!Array.isArray(experience) || experience.length === 0) {
      return null;
    }

    const current = experience.find(exp => exp.is_current);
    if (current) {
      return current.company;
    }

    return experience[0]?.company || null;
  }
}

export default ResumeParserService;

