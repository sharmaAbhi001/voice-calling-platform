import type { CarrierProvider } from './carrier.types.js';

/**
 * A carrier that is reached purely over SIP: Exotel, Plivo, Telnyx or any trunk
 * configured directly in LiveKit, used without touching the carrier's own REST API.
 *
 * This is the honest default. LiveKit sits on both legs of the call - the SIP leg to
 * the carrier and the media session with the agent - so it already reports ringing,
 * answer and hangup. The carrier's status callbacks add nothing the platform needs,
 * and their formats and signing schemes differ per provider.
 *
 * Status webhooks are therefore refused rather than trusted. Accepting an unsigned
 * POST that mutates call state would be a hole, not a feature.
 */
export const sipOnlyCarrier = (name: string): CarrierProvider => ({
  name,
  supportsStatusWebhooks: false,

  isConfigured() {
    // Nothing to configure: the trunk lives in LiveKit, not here.
    return true;
  },

  verifyWebhook() {
    return { valid: false, eventKey: null, eventType: null, status: null, carrierCallId: null };
  },

  async fetchCall() {
    return null;
  },
});
