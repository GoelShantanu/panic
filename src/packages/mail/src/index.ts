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
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      supported-color-schemes: light;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);">
          <!-- Brand Header -->
          <tr>
            <td style="padding: 28px 32px 22px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="display: inline-block;">
                      <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"><span style="color: #14243A;">Bazaar</span><span style="color: #245FC2;">Panic</span></span>
                      <span style="display: inline-block; width: 8px; height: 8px; background-color: #245FC2; border-radius: 50%; margin-left: 6px; vertical-align: middle;"></span>
                    </div>
                    <div style="margin-top: 6px;">
                      <span style="display: inline-block; padding: 2px 8px; background-color: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11px; font-weight: 600; color: #475569; letter-spacing: 0.5px; text-transform: uppercase;">
                        NSE &bull; BSE &bull; Real-Time Market Intelligence
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 32px 28px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 22px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
              <div style="font-weight: 600; color: #14243A; margin-bottom: 4px;">BazaarPanic</div>
              Real-Time Indian Stock Market Intelligence &amp; F&amp;O Sentiment<br>
              &copy; 2026 BazaarPanic. All rights reserved.
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
    <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #14243A;">Your sign-in code</h2>
    <p style="margin: 0 0 20px; color: #475569;">Use the sign-in code below to access your account:</p>
    
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px 16px; text-align: center; margin: 20px 0;">
      <span style="font-family: 'SF Mono', Menlo, Consolas, Monaco, 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #245FC2; text-indent: 10px;">${code}</span>
      <div style="font-size: 12px; color: #64748b; margin-top: 8px;">Valid for 10 minutes &bull; Single-use code</div>
    </div>

    <p style="font-size: 13px; color: #64748b; margin: 24px 0 0; border-top: 1px solid #e2e8f0; padding-top: 16px;">
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
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  const buttonSection = link ? `
    <!-- Direct 1-Click Verification Button -->
    <div style="margin: 28px 0 24px; text-align: center;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
        <tr>
          <td align="center" style="border-radius: 8px; background-color: #245FC2; background-image: linear-gradient(135deg, #245FC2, #1b4ca3); box-shadow: 0 4px 14px rgba(36, 95, 194, 0.28);">
            <a href="${link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.2px;">
              Verify Email &amp; Activate Account &rarr;
            </a>
          </td>
        </tr>
      </table>
    </div>

    <!-- Divider -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
      <tr>
        <td style="border-bottom: 1px solid #e2e8f0; height: 1px;"></td>
        <td style="width: auto; padding: 0 12px; text-align: center; font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; font-weight: 600; white-space: nowrap;">
          Or enter 6-digit code
        </td>
        <td style="border-bottom: 1px solid #e2e8f0; height: 1px;"></td>
      </tr>
    </table>
  ` : '';

  const fallbackLinkSection = link ? `
    <!-- Fallback Direct URL -->
    <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; margin: 22px 0 16px;">
      <div style="margin: 0 0 6px; font-size: 12px; color: #64748b; font-weight: 500;">
        Verification button link not working? Copy and paste this URL into your browser:
      </div>
      <a href="${link}" style="font-family: 'SF Mono', Menlo, Consolas, Monaco, monospace; font-size: 11px; color: #245FC2; word-break: break-all; text-decoration: none; line-height: 1.4;">
        ${link}
      </a>
    </div>
  ` : '';

  const html = emailShell(
    'Verify your BazaarPanic email address',
    `
    <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #14243A; letter-spacing: -0.3px;">
      Verify your email address
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
      Welcome to BazaarPanic. To finish setting up your account and activate your complimentary <strong style="color: #14243A;">3-day Pro trial</strong>, please verify your email address.
    </p>

    ${buttonSection}

    <!-- 6-Digit Monospace Code Card -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px 16px; text-align: center; margin: 16px 0 20px;">
      <div style="font-family: 'SF Mono', Menlo, Consolas, Monaco, 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #245FC2; text-indent: 10px;">
        ${code}
      </div>
      <div style="font-size: 12px; color: #64748b; margin-top: 8px; letter-spacing: 0.3px;">
        One-time verification code &bull; Valid for 10 minutes
      </div>
    </div>

    ${fallbackLinkSection}

    <!-- Security & Anti-Phishing Guardrail Notice -->
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      <tr>
        <td style="font-size: 12px; line-height: 1.6; color: #64748b;">
          <strong style="color: #14243A;">Security Notice:</strong> BazaarPanic will never ask for your password via email. This verification code expires in 10 minutes and can only be used once. If you did not create an account on bazaarpanic.com, you can safely ignore this message.
        </td>
      </tr>
    </table>
    `
  );

  return { subject: 'Verify your BazaarPanic email address', text, html };
}

export function passwordResetEmail(code: string, link?: string): { subject: string; text: string; html: string } {
  const text = [
    `Your password reset code is ${code}.`,
    '',
    ...(link ? [`Or reset directly with this link: ${link}`, ''] : []),
    'Use it with a new password. It expires in 10 minutes and can be used once. This code cannot sign you in.',
    'If you did not request this, you can ignore this email. Your password will stay unchanged.',
  ].join('\n');

  const buttonSection = link ? `
    <div style="margin: 28px 0 24px; text-align: center;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
        <tr>
          <td align="center" style="border-radius: 8px; background-color: #245FC2; background-image: linear-gradient(135deg, #245FC2, #1b4ca3); box-shadow: 0 4px 14px rgba(36, 95, 194, 0.28);">
            <a href="${link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; letter-spacing: 0.2px;">
              Reset Password Directly &rarr;
            </a>
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
      <tr>
        <td style="border-bottom: 1px solid #e2e8f0; height: 1px;"></td>
        <td style="width: auto; padding: 0 12px; text-align: center; font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1px; font-weight: 600; white-space: nowrap;">
          Or enter reset code
        </td>
        <td style="border-bottom: 1px solid #e2e8f0; height: 1px;"></td>
      </tr>
    </table>
  ` : '';

  const fallbackLinkSection = link ? `
    <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px 16px; margin: 22px 0 16px;">
      <div style="margin: 0 0 6px; font-size: 12px; color: #64748b; font-weight: 500;">
        Reset button link not working? Copy and paste this URL into your browser:
      </div>
      <a href="${link}" style="font-family: 'SF Mono', Menlo, Consolas, Monaco, monospace; font-size: 11px; color: #245FC2; word-break: break-all; text-decoration: none; line-height: 1.4;">
        ${link}
      </a>
    </div>
  ` : '';

  const html = emailShell(
    'Reset your BazaarPanic password',
    `
    <h1 style="margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #14243A; letter-spacing: -0.3px;">
      Reset your password
    </h1>
    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
      We received a request to reset your BazaarPanic password. Click the button below or enter the 6-digit recovery code:
    </p>

    ${buttonSection}

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px 16px; text-align: center; margin: 16px 0 20px;">
      <div style="font-family: 'SF Mono', Menlo, Consolas, Monaco, 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 10px; color: #245FC2; text-indent: 10px;">
        ${code}
      </div>
      <div style="font-size: 12px; color: #64748b; margin-top: 8px; letter-spacing: 0.3px;">
        Valid for 10 minutes &bull; Single-use reset code
      </div>
    </div>

    ${fallbackLinkSection}

    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
      <tr>
        <td style="font-size: 12px; line-height: 1.6; color: #64748b;">
          <strong style="color: #14243A;">Security Notice:</strong> This code cannot sign you in directly. If you did not request a password reset, you can safely ignore this email and your password will remain unchanged.
        </td>
      </tr>
    </table>
    `
  );

  return { subject: 'Reset your BazaarPanic password', text, html };
}
