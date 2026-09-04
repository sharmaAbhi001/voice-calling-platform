import { env, capabilities } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Resend over plain fetch - the REST API is one POST, so a client library would
 * only add a dependency. Sending never throws: a mail provider being down must
 * not turn into a 500 that tells an anonymous caller whether an account exists.
 */
const send = async (input: SendInput): Promise<boolean> => {
  if (!capabilities.email) {
    logger.warn({ to: input.to }, 'RESEND_API_KEY not set - email not sent');
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // Resend puts the reason in the body; the status alone is rarely enough.
      const detail = await response.text().catch(() => '');
      logger.error({ status: response.status, detail }, 'Resend rejected the email');
      return false;
    }

    const { id } = (await response.json().catch(() => ({}))) as { id?: string };
    logger.info({ id, subject: input.subject }, 'Email sent');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Email send failed');
    return false;
  }
};

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string,
  );

export const emailService = {
  send,

  async sendPasswordReset(input: { to: string; name: string; resetUrl: string; ttlMinutes: number }) {
    const name = escapeHtml(input.name);
    const url = escapeHtml(input.resetUrl);
    const expiry = `${input.ttlMinutes} minutes`;

    const sent = await send({
      to: input.to,
      subject: 'Reset your VoiceOps password',
      text: [
        `Hi ${input.name},`,
        '',
        'Use the link below to choose a new VoiceOps password.',
        input.resetUrl,
        '',
        `The link expires in ${expiry} and can only be used once.`,
        'If you did not request this, you can ignore this email - your password stays unchanged.',
      ].join('\n'),
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#111">
  <p>Hi ${name},</p>
  <p>Use the button below to choose a new VoiceOps password.</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#111;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset password</a>
  </p>
  <p style="font-size:13px;color:#555">Or paste this link into your browser:<br><a href="${url}">${url}</a></p>
  <p style="font-size:13px;color:#555">The link expires in ${expiry} and can only be used once. If you did not request this, you can ignore this email &mdash; your password stays unchanged.</p>
</div>`,
    });

    // Without a provider configured there is no other way to finish the flow locally.
    if (!sent && !env.isProduction) {
      logger.info({ resetUrl: input.resetUrl }, 'Password reset link (email not configured)');
    }
    return sent;
  },
};
