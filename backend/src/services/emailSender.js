/**
 * Email Sender Service - Send emails via SMTP
 * 
 * Supports Gmail, SendGrid, Mailgun, or any SMTP provider
 */

import nodemailer from 'nodemailer';
import { Email } from '../models/schemas.js';

export class EmailSenderService {
  constructor(config = {}) {
    const {
      host = process.env.SMTP_HOST,
      port = process.env.SMTP_PORT || 587,
      user = process.env.SMTP_USER,
      pass = process.env.SMTP_PASS,
      fromName = process.env.SMTP_FROM_NAME || 'IntroLink',
      fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
    } = config;

    this.fromName = fromName;
    this.fromEmail = fromEmail;
    this.isConfigured = !!(host && user && pass);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port),
        secure: parseInt(port) === 465,
        auth: {
          user,
          pass
        }
      });
      console.log(`[EmailSender] Configured with SMTP host: ${host}`);
    } else {
      console.log('[EmailSender] Not configured - SMTP credentials missing');
    }
  }

  /**
   * Send an email
   * @param {Object} params - Email parameters
   * @param {string} params.to - Recipient email
   * @param {string} params.subject - Email subject
   * @param {string} params.body - Email body (plain text)
   * @param {string} params.html - Email body (HTML, optional)
   * @param {string} params.replyTo - Reply-to address (optional)
   * @returns {Promise<Object>} - Send result
   */
  async sendEmail({ to, subject, body, html, replyTo }) {
    if (!this.isConfigured) {
      return { 
        success: false, 
        error: 'Email service not configured. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.' 
      };
    }

    if (!to || !subject || !body) {
      return { success: false, error: 'Recipient (to), subject, and body are required' };
    }

    console.log(`[EmailSender] Sending email to: ${to}`);

    try {
      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        text: body,
        html: html || this.textToHtml(body),
        replyTo: replyTo || this.fromEmail
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log(`[EmailSender] Email sent successfully. Message ID: ${info.messageId}`);

      return {
        success: true,
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      };

    } catch (error) {
      console.error('[EmailSender] Failed to send email:', error.message);
      return {
        success: false,
        error: `Failed to send email: ${error.message}`
      };
    }
  }

  /**
   * Send a drafted email from the database
   * @param {string} emailId - Email document ID
   * @param {Object} options - Options (fromEmail override, etc.)
   * @returns {Promise<Object>} - Send result
   */
  async sendDraftedEmail(emailId, options = {}) {
    try {
      const email = await Email.findById(emailId);
      
      if (!email) {
        return { success: false, error: 'Email draft not found' };
      }

      if (!email.recipient_email) {
        return { success: false, error: 'Recipient email address is missing' };
      }

      // Send the email
      const result = await this.sendEmail({
        to: email.recipient_email,
        subject: email.subject,
        body: email.body,
        replyTo: options.replyTo
      });

      if (result.success) {
        // Update email status in database
        await Email.findByIdAndUpdate(emailId, {
          status: 'sent',
          sent_at: new Date(),
          send_result: {
            message_id: result.messageId,
            response: result.response
          }
        });
      }

      return result;

    } catch (error) {
      console.error('[EmailSender] Error sending drafted email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send multiple emails in batch
   * @param {Array} emails - Array of email objects (to, subject, body)
   * @param {Object} options - Options (delay between sends)
   * @returns {Promise<Object>} - Batch send results
   */
  async sendBatch(emails, options = {}) {
    const { delay = 1000 } = options;
    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      details: []
    };

    for (const email of emails) {
      const result = await this.sendEmail(email);
      
      results.details.push({
        to: email.to,
        success: result.success,
        error: result.error,
        messageId: result.messageId
      });

      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
      }

      // Delay between sends to avoid rate limits
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  /**
   * Verify SMTP configuration by sending a test email
   * @param {string} testEmail - Email address to send test to
   * @returns {Promise<Object>} - Verification result
   */
  async verifyConfiguration(testEmail) {
    if (!this.isConfigured) {
      return { 
        success: false, 
        error: 'SMTP not configured' 
      };
    }

    try {
      // First verify the connection
      await this.transporter.verify();
      console.log('[EmailSender] SMTP connection verified');

      if (testEmail) {
        // Send a test email
        const result = await this.sendEmail({
          to: testEmail,
          subject: 'IntroLink Email Test',
          body: 'This is a test email from IntroLink to verify your email configuration is working correctly.\n\nIf you received this, your SMTP settings are configured correctly!'
        });
        
        return {
          success: result.success,
          message: result.success ? 'Configuration verified and test email sent' : result.error
        };
      }

      return {
        success: true,
        message: 'SMTP connection verified successfully'
      };

    } catch (error) {
      console.error('[EmailSender] Configuration verification failed:', error.message);
      return {
        success: false,
        error: `SMTP verification failed: ${error.message}`
      };
    }
  }

  /**
   * Convert plain text to simple HTML
   */
  textToHtml(text) {
    if (!text) return '';
    
    // Escape HTML characters
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Convert line breaks to <br>
    html = html.replace(/\n/g, '<br>\n');
    
    // Wrap in basic HTML
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
        ${html}
      </div>
    `;
  }

  /**
   * Check if email sending is available
   */
  isAvailable() {
    return this.isConfigured;
  }
}

/**
 * Mock Email Sender for testing
 */
export class MockEmailSenderService {
  constructor() {
    this.sentEmails = [];
    console.log('[EmailSender] Using mock email sender for testing');
  }

  async sendEmail({ to, subject, body }) {
    console.log(`[MockEmailSender] Would send email to: ${to}`);
    console.log(`[MockEmailSender] Subject: ${subject}`);
    
    const mockResult = {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      response: '250 OK mock',
      accepted: [to],
      rejected: []
    };

    this.sentEmails.push({ to, subject, body, ...mockResult });
    
    return mockResult;
  }

  async sendDraftedEmail(emailId, options = {}) {
    return {
      success: true,
      messageId: `mock-draft-${emailId}`,
      note: 'This is a mock send - no actual email was sent'
    };
  }

  async sendBatch(emails, options = {}) {
    const results = {
      total: emails.length,
      sent: emails.length,
      failed: 0,
      details: emails.map(e => ({
        to: e.to,
        success: true,
        messageId: `mock-batch-${Date.now()}`
      }))
    };
    return results;
  }

  async verifyConfiguration() {
    return { success: true, message: 'Mock sender - no verification needed' };
  }

  isAvailable() {
    return true;
  }

  getSentEmails() {
    return this.sentEmails;
  }
}

export default EmailSenderService;

