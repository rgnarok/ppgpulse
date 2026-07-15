import nodemailer, { type Transporter } from 'nodemailer';
import { getConfig } from '../config.js';

let cachedTransport: Transporter | null | undefined;

/**
 * Lazily builds (and caches) an SMTP transport from env config. Returns null
 * when SMTP isn't configured, so callers can no-op instead of crashing —
 * outbound email is an optional feature, not a hard dependency.
 */
function getTransport(): Transporter | null {
  if (cachedTransport !== undefined) return cachedTransport;
  const cfg = getConfig();
  if (!cfg.SMTP_HOST || !cfg.SMTP_USER || !cfg.SMTP_PASS) {
    cachedTransport = null;
    return cachedTransport;
  }
  cachedTransport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS },
  });
  return cachedTransport;
}

/** Test-only hook to force the cached transport to be rebuilt on next use. */
export function _resetMailerCacheForTests() {
  cachedTransport = undefined;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email if SMTP is configured; otherwise logs and returns false
 * without throwing, so callers (e.g. user creation) never fail just because
 * mail isn't set up in this environment.
 */
export async function sendMail(input: SendMailInput): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn(`[mailer] SMTP not configured — skipping email to ${input.to}`);
    return false;
  }
  const cfg = getConfig();
  await transport.sendMail({
    from: cfg.SMTP_FROM || cfg.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return true;
}

/** Sends a newly-created user their login credentials. */
export async function sendWelcomeEmail(input: {
  to: string;
  name: string;
  password: string;
  webOrigin: string;
}): Promise<boolean> {
  const { to, name, password, webOrigin } = input;
  return sendMail({
    to,
    subject: 'Your PPG Pulse account',
    text: [
      `Hi ${name},`,
      '',
      'An account has been created for you on PPG Pulse.',
      '',
      `Email: ${to}`,
      `Password: ${password}`,
      '',
      `Sign in: ${webOrigin}`,
      '',
      'For security, please sign in and change your password when you get a chance.',
    ].join('\n'),
    html: `
      <p>Hi ${name},</p>
      <p>An account has been created for you on <strong>PPG Pulse</strong>.</p>
      <p>
        Email: <strong>${to}</strong><br/>
        Password: <strong>${password}</strong>
      </p>
      <p><a href="${webOrigin}">Sign in to PPG Pulse</a></p>
      <p>For security, please sign in and change your password when you get a chance.</p>
    `,
  });
}
