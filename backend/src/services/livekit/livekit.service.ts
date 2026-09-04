import {
  AgentDispatchClient,
  RoomServiceClient,
  SipClient,
} from 'livekit-server-sdk';
import { capabilities, env } from '../../config/env.js';
import { serviceUnavailable } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/** The agent worker registers under this name; dispatch targets it explicitly. */
export const AGENT_NAME = 'voiceops-agent';

export interface DialResult {
  participantId: string;
  participantIdentity: string;
}

export interface TelephonyProvider {
  createRoom(roomName: string, metadata: string): Promise<void>;
  dispatchAgent(roomName: string, metadata: string): Promise<void>;
  dial(input: { roomName: string; phone: string; participantName: string }): Promise<DialResult>;
  hangUp(roomName: string): Promise<void>;
}

const assertConfigured = (): void => {
  if (!capabilities.livekit) {
    throw serviceUnavailable(
      'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
    );
  }
};

const clients = (() => {
  let room: RoomServiceClient | null = null;
  let sip: SipClient | null = null;
  let dispatch: AgentDispatchClient | null = null;

  return {
    room: () => {
      assertConfigured();
      room ??= new RoomServiceClient(env.LIVEKIT_URL!, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
      return room;
    },
    sip: () => {
      assertConfigured();
      sip ??= new SipClient(env.LIVEKIT_URL!, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
      return sip;
    },
    dispatch: () => {
      assertConfigured();
      dispatch ??= new AgentDispatchClient(
        env.LIVEKIT_URL!,
        env.LIVEKIT_API_KEY!,
        env.LIVEKIT_API_SECRET!,
      );
      return dispatch;
    },
  };
})();

/**
 * All LiveKit SDK usage lives here. Business code talks to TelephonyProvider, so
 * swapping the realtime layer means writing one more implementation of this file.
 */
export const livekitService: TelephonyProvider = {
  async createRoom(roomName, metadata) {
    await clients.room().createRoom({
      name: roomName,
      metadata,
      // A room with nobody in it after the call ends should not linger.
      emptyTimeout: 60,
      maxParticipants: 3,
    });
    logger.debug({ roomName }, 'LiveKit room created');
  },

  async dispatchAgent(roomName, metadata) {
    // Explicit dispatch: the agent joins only rooms we ask it to, and it receives
    // the call context id through the dispatch metadata.
    await clients.dispatch().createDispatch(roomName, AGENT_NAME, { metadata });
    logger.debug({ roomName, agent: AGENT_NAME }, 'Agent dispatched');
  },

  async dial({ roomName, phone, participantName }) {
    if (!capabilities.sip) {
      throw serviceUnavailable(
        'LIVEKIT_SIP_TRUNK_ID is not set, so outbound SIP calls cannot be placed.',
      );
    }

    const participant = await clients.sip().createSipParticipant(
      env.LIVEKIT_SIP_TRUNK_ID!,
      phone,
      roomName,
      {
        participantIdentity: `sip-${roomName}`,
        participantName,
        // Return as soon as the INVITE is accepted; ringing/answer transitions are
        // observed from the room, so the HTTP request does not block for 30s.
        waitUntilAnswered: false,
        playDialtone: false,
        krispEnabled: true,
      },
    );

    return {
      participantId: participant.participantId,
      participantIdentity: participant.participantIdentity,
    };
  },

  async hangUp(roomName) {
    // Deleting the room disconnects the SIP leg and stops the agent session.
    await clients.room().deleteRoom(roomName);
    logger.debug({ roomName }, 'LiveKit room deleted');
  },
};
