import { describe, expect, it } from 'vitest';
import { LogMailer, MemoryMailer, SmtpMailer, mailerFromEnv, signInCodeEmail } from './index.ts';

describe('mailer (ADR-007)', () => {
  it('memory transport captures messages', async () => {
    const m = new MemoryMailer();
    await m.send({ to: 'a@example.invalid', subject: 's', text: 't' });
    expect(m.sent).toEqual([{ to: 'a@example.invalid', subject: 's', text: 't' }]);
  });

  it('chooses the transport from the environment; smtp needs a sender', () => {
    expect(mailerFromEnv({})).toBeInstanceOf(LogMailer);
    expect(mailerFromEnv({ MAILER: 'memory' })).toBeInstanceOf(MemoryMailer);
    expect(mailerFromEnv({ MAILER: 'smtp', MAIL_FROM: 'sender@example.invalid' })).toBeInstanceOf(SmtpMailer);
    expect(() => mailerFromEnv({ MAILER: 'smtp' })).toThrow(/MAIL_FROM/);
    expect(() => mailerFromEnv({ MAILER: 'carrier-pigeon' })).toThrow(/unknown MAILER/);
  });

  it('production refuses any mailer that would print sign-in codes (D-053)', () => {
    expect(() => mailerFromEnv({ NODE_ENV: 'production' })).toThrow(/MAILER=smtp is required/);
    expect(() => mailerFromEnv({ NODE_ENV: 'production', MAILER: 'log' })).toThrow(/MAILER=smtp is required/);
    expect(mailerFromEnv({ NODE_ENV: 'production', MAILER: 'smtp', MAIL_FROM: 'sender@example.invalid' })).toBeInstanceOf(SmtpMailer);
  });

  it('the sign-in email states the code and expiry with no urgency language', () => {
    const e = signInCodeEmail('042137');
    expect(e.text).toContain('042137');
    expect(e.text).toContain('10 minutes');
    expect(`${e.subject} ${e.text}`).not.toMatch(/act now|hurry|don't miss|urgent|!/i);
  });
});
