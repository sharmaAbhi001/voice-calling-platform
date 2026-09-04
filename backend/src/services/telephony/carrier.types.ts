import type { CallStatus } from '@voiceops/shared';

/**
 * The PSTN carrier that terminates the SIP leg onto the phone network.
 *
 * The carrier is deliberately thin here. Outbound dialling does not go through
 * this interface at all - the backend asks LiveKit to dial, and LiveKit talks SIP
 * to whichever trunk is configured. Swapping Twilio for Exotel, Plivo or Telnyx is
 * therefore a trunk configuration change, not a code change.
 *
 * What a carrier is used for is the optional extras: verifying the signature on its
 * status callbacks, and asking it why a call failed when LiveKit only knows that it
 * did. Carriers that offer neither are fully supported - LiveKit remains the source
 * of truth for call state either way.
 */
export interface CarrierCallSnapshot {
  id: string;
  status: CallStatus | null;
  durationSeconds: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface WebhookVerification {
  /** False rejects the request with 401 before any state is touched. */
  valid: boolean;
  /** Stable per-event id used for webhook idempotency. */
  eventKey: string | null;
  eventType: string | null;
  /** Call status the carrier is reporting, already mapped to our vocabulary. */
  status: CallStatus | null;
  /** Carrier-side call id, for correlation and support tickets. */
  carrierCallId: string | null;
}

export interface CarrierProvider {
  /** Identifier used in logs and in the webhook idempotency ledger. */
  readonly name: string;

  /** False when credentials are absent; the platform still places calls. */
  isConfigured(): boolean;

  /**
   * Whether this carrier posts call status callbacks we can trust. When false the
   * webhook endpoint rejects everything, because an unverifiable status callback
   * is an unauthenticated request to change call state.
   */
  readonly supportsStatusWebhooks: boolean;

  verifyWebhook(input: {
    signature: string | undefined;
    url: string;
    params: Record<string, unknown>;
    rawBody: string;
  }): WebhookVerification;

  /** Carrier-side view of a call, when the carrier exposes one. */
  fetchCall(carrierCallId: string): Promise<CarrierCallSnapshot | null>;
}

export type CarrierName = 'twilio' | 'exotel' | 'plivo' | 'telnyx' | 'none';
