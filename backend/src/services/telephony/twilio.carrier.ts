import twilio from 'twilio';
import type { CallStatus } from '@voiceops/shared';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { CarrierCallSnapshot, CarrierProvider, WebhookVerification } from './carrier.types.js';

let client: ReturnType<typeof twilio> | null = null;
const getClient = () => {
  client ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return client;
};

/** Twilio call status -> our technical status. */
const mapStatus = (status: string): CallStatus | null => {
  switch (status) {
    case 'queued':
    case 'initiated':
      return 'QUEUED';
    case 'ringing':
      return 'RINGING';
    case 'in-progress':
      return 'CONNECTED';
    case 'completed':
      return 'COMPLETED';
    case 'busy':
      return 'BUSY';
    case 'no-answer':
      return 'NO_ANSWER';
    case 'canceled':
      return 'CANCELLED';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
};

export const twilioCarrier: CarrierProvider = {
  name: 'twilio',
  supportsStatusWebhooks: true,

  isConfigured() {
    return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  },

  /**
   * Twilio signs callbacks with the account Auth Token - an API key secret will
   * not validate them. An unsigned or unverifiable request is rejected.
   */
  verifyWebhook({ signature, url, params }): WebhookVerification {
    const empty: WebhookVerification = {
      valid: false,
      eventKey: null,
      eventType: null,
      status: null,
      carrierCallId: null,
    };
    if (!this.isConfigured() || !signature) return empty;

    const valid = twilio.validateRequest(
      env.TWILIO_AUTH_TOKEN as string,
      signature,
      url,
      params as Record<string, string>,
    );
    if (!valid) return empty;

    const callSid = params.CallSid ? String(params.CallSid) : null;
    const callStatus = params.CallStatus ? String(params.CallStatus) : null;

    return {
      valid: true,
      // Twilio has no event id, so the call plus its new status is the natural key.
      eventKey: callSid && callStatus ? `${callSid}:${callStatus}` : null,
      eventType: callStatus,
      status: callStatus ? mapStatus(callStatus) : null,
      carrierCallId: callSid,
    };
  },

  async fetchCall(carrierCallId): Promise<CarrierCallSnapshot | null> {
    if (!this.isConfigured()) return null;
    try {
      const call = await getClient().calls(carrierCallId).fetch();
      return {
        id: call.sid,
        status: mapStatus(call.status),
        durationSeconds: call.duration ? Number.parseInt(call.duration, 10) : null,
        startedAt: call.startTime ?? null,
        endedAt: call.endTime ?? null,
      };
    } catch (error) {
      logger.warn({ err: error, carrierCallId }, 'Could not fetch Twilio call');
      return null;
    }
  },
};
