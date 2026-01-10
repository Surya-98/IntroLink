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
        console.error('[ResumeParser] Failed to parse JSON response:', content);
        // Attempt to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResume = JSON.parse(jsonMatch[0]);
        } else {
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
    return `You are an expert resume parser. Extract structured information from resumes and return it as valid JSON.

Output the following JSON structure (use null for missing fields):

{
  "name": "Full Name",
  "email": "email@example.com",
  "phone": "+1-234-567-8900",
  "location": "City, State/Country",
  "linkedin_url": "https://linkedin.com/in/...",
  "portfolio_url": "https://...",
  "summary": "Professional summary or objective statement",
  "skills": ["skill1", "skill2", ...],
  "technical_skills": ["Python", "JavaScript", ...],
  "soft_skills": ["Leadership", "Communication", ...],
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "location": "City, State",
      "start_date": "Month Year",
      "end_date": "Month Year or Present",
      "is_current": true/false,
      "description": "Brief role description",
      "highlights": ["Achievement 1", "Achievement 2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Bachelor of Science",
      "field": "Computer Science",
      "graduation_date": "Year or Month Year",
      "gpa": "3.8/4.0"
    }
  ],
  "certifications": ["Certification 1", "Certification 2"],
  "projects": [
    {
      "name": "Project Name",
      "description": "What it does",
      "technologies": ["Tech1", "Tech2"],
      "url": "https://..."
    }
  ],
  "years_of_experience": 5,
  "current_title": "Current Job Title",
  "current_company": "Current Company Name"
}

Important guidelines:
1. Extract ALL information present in the resume
2. For years_of_experience, calculate based on work history dates
3. Skills should include both explicit skills and those implied by experience
4. Use consistent date formats (Month Year like "January 2020")
5. For current positions, set is_current to true and end_date to "Present"
6. Return ONLY valid JSON, no explanations or markdown

Return your response as a valid JSON object only.`;
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

