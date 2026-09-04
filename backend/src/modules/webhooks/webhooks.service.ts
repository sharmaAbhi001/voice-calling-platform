import { WebhookReceiver } from 'livekit-server-sdk';
import type { WebhookEvent } from 'livekit-server-sdk';
import type { CallStatus } from '@voiceops/shared';
import { capabilities, env } from '../../config/env.js';
import { unauthorized } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { carrier } from '../../services/telephony/index.js';
import { callsService } from '../calls/calls.service.js';
import { webhooksRepository } from './webhooks.repository.js';

let receiver: WebhookReceiver | null = null;
const getReceiver = (): WebhookReceiver => {
  receiver ??= new WebhookReceiver(env.LIVEKIT_API_KEY as string, env.LIVEKIT_API_SECRET as string);
  return receiver;
};

/** SIP legs join with this identity prefix (set in livekitService.dial). */
const isSipParticipant = (identity: string | undefined): boolean =>
  Boolean(identity?.startsWith('sip-'));

/**
 * LiveKit disconnect reasons that mean the callee never picked up. Anything else
 * on an unanswered call is recorded as FAILED so it is not confused with a
 * customer decision.
 */
const NO_ANSWER_REASONS = new Set(['USER_UNAVAILABLE', 'USER_REJECTED']);

export const webhooksService = {
  /**
   * LiveKit is the source of truth for call state, whichever carrier is in use:
   * it sits on both the SIP leg and the agent session, so it sees ringing, answer
   * and hangup first. Carrier callbacks are supplementary.
   */
  async handleLiveKit(rawBody: string, authHeader: string | undefined): Promise<void> {
    if (!capabilities.livekit) throw unauthorized('LiveKit is not configured');
    if (!authHeader) throw unauthorized('Missing webhook signature');

    let event: WebhookEvent;
    try {
      event = await getReceiver().receive(rawBody, authHeader);
    } catch (error) {
      logger.warn({ err: error }, 'Rejected LiveKit webhook with an invalid signature');
      throw unauthorized('Invalid webhook signature');
    }

    const roomName = event.room?.name;
    if (!roomName) return;

    const eventKey = event.id || `${event.event}:${roomName}:${event.createdAt ?? ''}`;
    const claimed = await webhooksRepository.claim({
      provider: 'livekit',
      eventKey,
      eventType: event.event,
      payload: JSON.parse(rawBody),
    });
    if (!claimed) {
      logger.debug({ eventKey }, 'Duplicate LiveKit webhook ignored');
      return;
    }

    const call = await callsService.findByRoomName(roomName);
    if (!call) {
      logger.debug({ roomName, event: event.event }, 'Webhook for an unknown room');
      return;
    }

    switch (event.event) {
      case 'participant_joined': {
        // The customer's SIP leg joining the room is the moment they answered.
        if (isSipParticipant(event.participant?.identity)) {
          await callsService.applyStatus(call.id, 'CONNECTED');
        }
        break;
      }
      case 'participant_left': {
        if (isSipParticipant(event.participant?.identity)) {
          const reason = String(event.participant?.disconnectReason ?? '');
          const status: CallStatus = call.answeredAt
            ? 'COMPLETED'
            : NO_ANSWER_REASONS.has(reason)
              ? 'NO_ANSWER'
              : 'FAILED';
          await callsService.applyStatus(call.id, status, {
            failureReason: call.answeredAt ? undefined : `SIP disconnect: ${reason || 'unknown'}`,
          });
        }
        break;
      }
      case 'room_finished': {
        await callsService.applyStatus(call.id, call.answeredAt ? 'COMPLETED' : 'NO_ANSWER');
        break;
      }
      case 'egress_ended': {
        logger.info({ callId: call.id }, 'Recording finished');
        break;
      }
      default:
        logger.debug({ event: event.event }, 'Unhandled LiveKit event');
    }
  },

  /**
   * Carrier status callbacks. Optional everywhere and unavailable for carriers
   * reached purely over SIP, which is why the endpoint refuses rather than
   * guesses when the configured carrier cannot sign its callbacks.
   */
  async handleCarrier(input: {
    signature: string | undefined;
    url: string;
    params: Record<string, unknown>;
    rawBody: string;
  }): Promise<void> {
    if (!carrier.supportsStatusWebhooks) {
      throw unauthorized(
        `Carrier "${carrier.name}" does not have verifiable status callbacks; call state comes from LiveKit`,
      );
    }

    const verification = carrier.verifyWebhook(input);
    if (!verification.valid) throw unauthorized('Invalid carrier webhook signature');
    if (!verification.eventKey) return;

    const claimed = await webhooksRepository.claim({
      provider: carrier.name,
      eventKey: verification.eventKey,
      eventType: verification.eventType,
      payload: input.params,
    });
    if (!claimed) return;

    // Recorded for support and diagnosis. Call state is not advanced from here:
    // LiveKit already owns that transition, and two writers would race.
    logger.info(
      {
        carrier: carrier.name,
        carrierCallId: verification.carrierCallId,
        status: verification.status,
      },
      'Carrier status callback',
    );
  },
};
