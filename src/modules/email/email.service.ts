import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';

/**
 * Email attachment interface
 */
export interface EmailAttachment {
  filename: string;
  path: string;
  contentType: string;
  cid?: string;
}

/**
 * Email options interface
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly appName: string;
  private readonly supportEmail: string;
  private readonly defaultSenderEmail: string;

  constructor(private configService: ConfigService) {
    // Initialize email transporter
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: parseInt(this.configService.get('EMAIL_PORT')!, 10),
      secure: this.configService.get('EMAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    });

    // Set app-specific properties from config (or use defaults)
    this.appName = this.configService.get<string>('APP_NAME') || 'Kirrou';
    this.supportEmail =
      this.configService.get<string>('SUPPORT_EMAIL') ||
      'support@gymnoteplus.com';
    this.defaultSenderEmail =
      this.configService.get<string>('SENDER_EMAIL') ||
      'no-reply@gymnoteplus.com';
  }

  /**
   * Get the default sender address
   */
  getDefaultSender(): string {
    return `${this.appName} <${this.defaultSenderEmail}>`;
  }

  /**
   * Get the support email address
   */
  getSupportEmail(): string {
    return this.supportEmail;
  }

  /**
   * Get the app name
   */
  getAppName(): string {
    return this.appName;
  }

  /**
   * Send an email
   * @param options Email options
   * @returns Promise resolving to success info
   */
  async sendEmail(options: EmailOptions): Promise<any> {
    const mailOptions = {
      from: options.from || this.getDefaultSender(),
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments || [],
      replyTo: options.replyTo,
    };

    const result = await this.transporter.sendMail(mailOptions);

    // Clean up temporary files after sending
    if (options.attachments) {
      for (const attachment of options.attachments) {
        try {
          if (attachment.path && fs.existsSync(attachment.path)) {
            fs.unlinkSync(attachment.path);
          }
        } catch (error) {
          console.error(
            `Error deleting temporary file ${attachment.path}:`,
            error,
          );
        }
      }
    }

    return result;
  }
}
