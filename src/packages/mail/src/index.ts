// Transactional email behind one interface (ADR-007). Callers never know the provider.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export class LogMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    console.log(`[mail] to=${m.to} subject="${m.subject}"\n${m.text}`);
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
}

// Production transport: Google Workspace SMTP relay over TLS (ADR-007).
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(cfg: SmtpConfig) {
    this.from = cfg.from;
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      requireTLS: cfg.port !== 465,
      ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass ?? '' } } : {}),
    });
  }

  async send(m: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
      ...(m.headers ? { headers: m.headers } : {}),
    });
  }
}

// ADR-007: free Gmail (app password) or Google Workspace relay, chosen by configuration.
export const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 587 };
export const GOOGLE_WORKSPACE_RELAY = { host: 'smtp-relay.gmail.com', port: 587 };

// MAILER = smtp | log | memory (default log). smtp needs MAIL_FROM. SMTP_HOST/PORT default to free
// Gmail; set SMTP_HOST=smtp-relay.gmail.com for Workspace. SMTP_USER/SMTP_PASS: the Gmail address
// and its app password (or Workspace SMTP credentials).
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): Mailer {
  const kind = env['MAILER'] ?? 'log';
  // The log mailer prints sign-in codes; production must send real mail (D-053).
  if (env['NODE_ENV'] === 'production' && kind !== 'smtp') throw new Error('MAILER=smtp is required when NODE_ENV=production');
  if (kind === 'memory') return new MemoryMailer();
  if (kind === 'log') return new LogMailer();
  if (kind !== 'smtp') throw new Error(`unknown MAILER: ${kind}`);
  const from = env['MAIL_FROM'];
  if (!from) throw new Error('MAIL_FROM is required when MAILER=smtp');
  return new SmtpMailer({
    host: env['SMTP_HOST'] ?? GMAIL_SMTP.host,
    port: Number(env['SMTP_PORT'] ?? GMAIL_SMTP.port),
    user: env['SMTP_USER'] ?? null,
    pass: env['SMTP_PASS'] ?? null,
    from,
  });
}

function emailShell(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b0f17; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0b0f17; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #131b2a; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px 20px; border-bottom: 1px solid #1e293b; background: #162032;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">BazaarPanic</span>
                    <span style="display: inline-block; width: 7px; height: 7px; background-color: #10b981; border-radius: 50%; margin-left: 6px; vertical-align: middle;"></span>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Real-Time Indian Market Intelligence (NSE & BSE)</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #0d131f; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
              &copy; 2026 BazaarPanic. All rights reserved.<br>
              Indian Stock Market Intelligence & Deduplicated News Telemetry
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Plain, factual, no urgency language (GUARDRAILS §4.10).
export function signInCodeEmail(code: string): { subject: string; text: string; html: string } {
  const text = [
    `Your sign-in code is ${code}.`,
    '',
    'It expires in 10 minutes and can be used once.',
    "If you didn't request it, you can ignore this email.",
  ].join('\n');

  const html = emailShell(
    'Your BazaarPanic sign-in code',
    `
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #f8fafc;">Your sign-in code</h2>
    <p style="margin: 0 0 20px; color: #94a3b8;">Use the sign-in code below to access your account:</p>
    
    <div style="background-color: #0b0f17; border: 1px solid #293548; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
      <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${code}</span>
    </div>

    <p style="font-size: 13px; color: #64748b; margin: 24px 0 0; border-top: 1px solid #1e293b; padding-top: 16px;">
      This code expires in <strong>10 minutes</strong> and can be used once.<br>
      If you did not request this, you can safely ignore this email.
    </p>
    `
  );

  return {
    subject: 'Your BazaarPanic sign-in code',
    text,
    html,
  };
}

export function verificationCodeEmail(code: string, link?: string): { subject: string; text: string; html: string } {
  const text = [
    `Your email verification code is ${code}.`,
    '',
    ...(link ? [`Or verify directly with this link: ${link}`, ''] : []),
    'It expires in 10 minutes and can be used once.',
    'If you did not request this, ignore this email.',
  ].join('\n');

  const buttonHtml = link ? `
    <div style="text-align: center; margin: 28px 0 20px;">
      <a href="${link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">Verify Email Directly</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 16px;">Or copy and enter the 6-digit code in your open browser tab.</p>
  ` : '';

  const html = emailShell(
    'Verify your BazaarPanic email',
    `
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #f8fafc;">Verify your email address</h2>
    <p style="margin: 0 0 20px; color: #94a3b8;">Welcome to BazaarPanic! Use the code below to verify your email and activate your <strong>3-day free Pro trial</strong>:</p>
    
    <div style="background-color: #0b0f17; border: 1px solid #293548; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
      <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${code}</span>
    </div>
    
    ${buttonHtml}

    <p style="font-size: 13px; color: #64748b; margin: 24px 0 0; border-top: 1px solid #1e293b; padding-top: 16px;">
      This verification code is valid for <strong>10 minutes</strong> and can only be used once.<br>
      If you did not request an account, please ignore this email.
    </p>
    `
  );

  return { subject: 'Verify your BazaarPanic email', text, html };
}

export function passwordResetEmail(code: string, link?: string): { subject: string; text: string; html: string } {
  const text = [
    `Your password reset code is ${code}.`,
    '',
    ...(link ? [`Or reset directly with this link: ${link}`, ''] : []),
    'Use it with a new password. It expires in 10 minutes and can be used once. This code cannot sign you in.',
    'If you did not request this, ignore this email. Your password will stay unchanged.',
  ].join('\n');

  const buttonHtml = link ? `
    <div style="text-align: center; margin: 28px 0 20px;">
      <a href="${link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">Reset Password Directly</a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 16px;">Or enter this code on the password reset screen.</p>
  ` : '';

  const html = emailShell(
    'Reset your BazaarPanic password',
    `
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 600; color: #f8fafc;">Reset your password</h2>
    <p style="margin: 0 0 20px; color: #94a3b8;">We received a request to reset your BazaarPanic password. Use the reset code below:</p>
    
    <div style="background-color: #0b0f17; border: 1px solid #293548; border-radius: 8px; padding: 18px; text-align: center; margin: 20px 0;">
      <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #38bdf8;">${code}</span>
    </div>

    ${buttonHtml}

    <p style="font-size: 13px; color: #64748b; margin: 24px 0 0; border-top: 1px solid #1e293b; padding-top: 16px;">
      This code is valid for <strong>10 minutes</strong> and can only be used once.<br>
      This code cannot sign you in directly. If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.
    </p>
    `
  );

  return { subject: 'Reset your BazaarPanic password', text, html };
}
