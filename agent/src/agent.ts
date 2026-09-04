import { fileURLToPath } from 'node:url';
import {
  WorkerOptions,
  cli,
  defineAgent,
  log,
  type JobContext,
  type JobProcess,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import { RoomServiceClient } from 'livekit-server-sdk';
import type { CallContext, TranscriptTurn } from '@voiceops/shared';
import { env } from './config/env.js';
import { KnowledgeRetriever } from './knowledge/retriever.js';
import { buildSessionOptions } from './pipelines/voice-pipeline.js';
import { buildSystemPrompt } from './prompts/system-prompt.js';
import { backendClient } from './services/backend.client.js';
import { buildTools, createCallState } from './tools/index.js';

// The framework initialises its logger when the worker starts, which is after this
// module is imported - so resolve it lazily rather than at import time.
let cachedLogger: ReturnType<typeof log> | null = null;
const logger = () => (cachedLogger ??= log());

/** Must match AGENT_NAME in the backend's livekit service. */
const AGENT_NAME = 'voiceops-agent';

/** Hard ceiling so a stuck call cannot run up a phone bill. */
const MAX_CALL_DURATION_MS = 10 * 60 * 1000;

const readCallId = (ctx: JobContext): string | null => {
  const sources = [ctx.job.metadata, ctx.room.metadata];
  for (const source of sources) {
    if (!source) continue;
    try {
      const parsed = JSON.parse(source) as { callId?: string };
      if (parsed.callId) return parsed.callId;
    } catch {
      // Metadata that is not JSON is not ours; keep looking.
    }
  }
  return null;
};

export default defineAgent({
  // Loading the VAD model takes seconds; do it once per worker process, not per call.
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const callId = readCallId(ctx);
    if (!callId) {
      logger().error('Job has no callId in metadata; refusing to run a call blind');
      return;
    }

    let context: CallContext;
    try {
      context = await backendClient.getCallContext(callId);
    } catch (error) {
      // Without the template and knowledge base there are no guard rails, so the
      // only safe thing to do is not to speak at all.
      logger().error({ err: error, callId }, 'Could not load call context; ending job');
      await backendClient
        .recordEvent(callId, 'AGENT_ERROR', `Context load failed: ${(error as Error).message}`)
        .catch(() => undefined);
      return;
    }

    const state = createCallState();
    const retriever = new KnowledgeRetriever(context.knowledgeBaseId, context.template.language);
    const transcript: TranscriptTurn[] = [];

    const agent = new voice.Agent({
      instructions: buildSystemPrompt(context),
      tools: buildTools(retriever, state),
    });

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      ...buildSessionOptions({
        language: context.template.language,
        voiceProvider: context.template.voiceProvider,
        llmProvider: context.template.llmProvider,
        voiceName: context.template.voiceName,
      }),
    });

    // Transcript is captured turn by turn: whatever happens later (a crash, a
    // hangup mid-sentence) the conversation up to that point is still saved.
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      // Handoff items carry no role and no speech; only chat messages are transcript.
      const item = event.item;
      if (!('role' in item)) return;
      if (item.role !== 'assistant' && item.role !== 'user') return;
      const text = item.textContent?.trim();
      if (!text) return;
      transcript.push({
        speaker: item.role === 'assistant' ? 'AGENT' : 'CUSTOMER',
        text,
        at: new Date().toISOString(),
      });
    });

    const roomService = new RoomServiceClient(
      env.LIVEKIT_URL,
      env.LIVEKIT_API_KEY,
      env.LIVEKIT_API_SECRET,
    );

    let closing = false;
    // Assigned once the session starts; closeCall may run before that.
    let backgroundRef: voice.BackgroundAudioPlayer | null = null;
    const closeCall = async (reason: string): Promise<void> => {
      if (closing) return;
      closing = true;
      logger().info({ callId, reason }, 'Closing call');
      await backgroundRef?.close().catch(() => undefined);
      // Deleting the room drops the SIP leg, which is what actually hangs up the phone.
      await roomService.deleteRoom(ctx.room.name ?? '').catch(() => undefined);
    };

    /**
     * Writing the result is attempted as soon as the conversation ends and, as a
     * backstop, again on shutdown. Relying on the shutdown callback alone lost a
     * transcript once: the runtime aborts pending work when it tears the process
     * down, and the request died in flight. Saving twice is harmless - the backend
     * write is idempotent for a given call.
     */
    let resultSaved = false;
    const saveResult = async (): Promise<void> => {
      if (resultSaved) return;
      resultSaved = true;
      try {
        await backendClient.saveResult(callId, {
          transcript,
          outcomeHint: state.outcomeHint ?? undefined,
          capturedRequirement: state.capturedRequirement,
          agentError: state.endReason && !state.endRequested ? state.endReason : null,
        });
        logger().info({ callId, turns: transcript.length }, 'Call result saved');
      } catch (error) {
        resultSaved = false; // let the shutdown backstop try again
        logger().error({ err: error, callId }, 'Failed to save call result');
      }
    };

    ctx.addShutdownCallback(saveResult);

    const timeout = setTimeout(() => {
      void closeCall('Maximum call duration reached');
    }, MAX_CALL_DURATION_MS);
    timeout.unref();

    /**
     * A voice on a perfectly silent line sounds synthetic. Light office noise makes
     * the call read as someone phoning from a workplace, and the keyboard sound
     * covers the pause while a knowledge-base lookup runs - dead air is what makes
     * a customer say "hello? hello?" and talk over the answer.
     */
    let background: voice.BackgroundAudioPlayer | null = null;
    if (context.template.backgroundAudio === 'OFFICE') {
      background = new voice.BackgroundAudioPlayer({
        ambientSound: { source: voice.BuiltinAudioClip.OFFICE_AMBIENCE, volume: 0.35 },
        thinkingSound: { source: voice.BuiltinAudioClip.KEYBOARD_TYPING, volume: 0.5 },
      });
    }

    try {
      await session.start({ agent, room: ctx.room });
      if (background) {
        await background.start({ room: ctx.room, agentSession: session });
        backgroundRef = background;
      }

      // Wait for the customer's SIP leg before speaking, otherwise the greeting is
      // played into an empty room while the phone is still ringing.
      const participant = await ctx.waitForParticipant();

      // Their leg joining IS the answer, so this is the moment the call connects.
      // Reporting it here rather than at session start means the backend can track
      // call state from the agent alone, with no provider webhook configured.
      await backendClient.recordEvent(callId, 'AGENT_STARTED').catch(() => undefined);

      // The customer hanging up ends the call, whatever the model was mid-sentence.
      ctx.room.on('participantDisconnected', (left) => {
        if (left.identity !== participant.identity) return;
        logger().info({ callId }, 'Customer hung up');
        state.endReason ??= 'Customer hung up';
        void closeCall('Customer hung up');
      });

      // The opening line is spoken verbatim rather than generated: the first thing
      // a customer hears should be the approved script, word for word.
      await session.say(context.template.openingScript, { allowInterruptions: true }).waitForPlayout();

      // The model drives the rest; we only watch for the end_call tool.
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (state.endRequested || closing) {
            clearInterval(poll);
            resolve();
          }
        }, 250);
        poll.unref?.();
      });

      // Let the last sentence finish playing before the line drops.
      if (!closing) await new Promise((resolve) => setTimeout(resolve, 1500));
      await closeCall(state.endReason ?? 'Agent ended the call');

      // Save while the process is still healthy rather than during teardown.
      await saveResult();
      await backendClient
        .recordEvent(callId, 'AGENT_ENDED', state.endReason ?? undefined)
        .catch(() => undefined);
    } catch (error) {
      const message = (error as Error).message;
      logger().error({ err: error, callId }, 'Agent session failed');
      state.endReason = message;
      await backendClient.recordEvent(callId, 'AGENT_ERROR', message).catch(() => undefined);

      // Try to leave the customer with a sentence rather than dead air.
      try {
        await session
          .say('I am sorry, I am having a technical problem. I will have someone call you back.')
          .waitForPlayout();
      } catch {
        // The session may already be gone; the call still ends cleanly below.
      }
      await closeCall('Agent error');
    } finally {
      clearTimeout(timeout);
    }
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    // Named worker: it only joins rooms the backend explicitly dispatches it to.
    agentName: AGENT_NAME,
    // Each job spawns a child process that loads the VAD and turn-detection models.
    // The default deadline assumes a warm host; in a container on a laptop that load
    // regularly overruns it and the job dies with "runner initialization timed out"
    // while the customer's phone is still ringing.
    initializeProcessTimeout: 60_000,
    // Keep a process warm so the models are already resident when a call lands.
    // Without this the first customer pays the model load time in dead air.
    numIdleProcesses: 1,
  }),
);


