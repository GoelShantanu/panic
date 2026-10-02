// Transactional email behind one interface (ADR-007). Callers never know the provider.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
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
    await this.transport.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text, ...(m.headers ? { headers: m.headers } : {}) });
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

// Plain, factual, no urgency language (GUARDRAILS §4.10).
export function signInCodeEmail(code: string): { subject: string; text: string } {
  return {
    subject: 'Your StockPanic sign-in code',
    text: [
      `Your sign-in code is ${code}.`,
      '',
      'It expires in 10 minutes and can be used once.',
      "If you didn't request it, you can ignore this email.",
    ].join('\n'),
  };
}
