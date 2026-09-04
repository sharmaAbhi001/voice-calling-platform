import { z } from 'zod';
import { CALL_OUTCOME, type Call, type CallOutcome, type TranscriptTurn } from '@voiceops/shared';
import { capabilities } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { llmService } from '../../services/ai/llm.service.js';
import { auditService } from '../../services/audit/audit.service.js';
import { callsService } from '../calls/calls.service.js';
import type { CallEventInput, CallResultInput } from './internal.validation.js';

const analysisSchema = z.object({
  summary: z.string().min(1).max(2000),
  requirement: z.string().max(1000).nullable(),
  outcome: z.enum(CALL_OUTCOME),
  reasoning: z.string().max(500).optional(),
});

const SUMMARY_SYSTEM_PROMPT = `
You write the post-call record for a sales phone call. You are given the full
transcript and nothing else.

Rules:
- Use only what was said in the transcript. Never add products, prices, dates or
  commitments that do not appear in it.
- If the customer never stated a requirement, "requirement" must be null. Do not
  infer one from the agent's pitch.
- Choose exactly one outcome:
  CONNECTED       - a person spoke, but no interest either way was expressed.
  INTERESTED      - the customer asked to learn more, requested a demo, a callback
                    or a proposal.
  NOT_INTERESTED  - the customer declined, asked not to be contacted, or said no.
  CONVERTED       - the customer explicitly agreed to buy, sign up, or place an order.
  ENDED           - the call ended without a usable conversation (wrong number,
                    voicemail, immediate hang-up, nobody spoke).
- Prefer the weaker outcome when the transcript is ambiguous. CONVERTED requires an
  explicit commitment, not enthusiasm.

Return JSON with keys: "summary", "requirement", "outcome", "reasoning".

The summary must cover, in a few sentences: the purpose of the call, what the
customer said they needed, any objections raised, and the agreed next action.
`.trim();

const renderTranscript = (transcript: TranscriptTurn[]): string =>
  transcript
    .map((turn) => `${turn.speaker === 'AGENT' ? 'Agent' : 'Customer'}: ${turn.text}`)
    .join('\n');

/** Fallback when there is no LLM, or too little conversation to judge. */
const heuristicOutcome = (transcript: TranscriptTurn[], hint?: CallOutcome): CallOutcome => {
  const customerTurns = transcript.filter((turn) => turn.speaker === 'CUSTOMER');
  if (customerTurns.length === 0) return 'ENDED';
  // An agent's guess is accepted only when the customer actually said something.
  return hint ?? 'CONNECTED';
};

export const internalService = {
  getCallContext(callId: string) {
    return callsService.getCallContext(callId);
  },

  /**
   * Post-call write, split in two so the transcript is never at risk.
   *
   * The agent posts this from its shutdown handler, which the LiveKit runtime
   * gives a limited window before it kills the process. Summarising with an LLM
   * inside that window once cost us the entire transcript: the request was
   * aborted mid-flight and nothing was stored. So the durable record is written
   * and acknowledged first, and the derived fields - summary, requirement,
   * verified outcome - fill in afterwards on our own time.
   */
  async saveResult(callId: string, input: CallResultInput): Promise<Call> {
    const transcript = input.transcript;

    const saved = await callsService.saveAgentResult(callId, {
      transcript,
      summary: null,
      extractedRequirement: input.capturedRequirement?.trim() || null,
      outcome: heuristicOutcome(transcript, input.outcomeHint),
      agentError: input.agentError ?? null,
    });

    // The agent only posts this once the conversation is over, so the call is
    // definitively finished - regardless of whether a provider webhook arrived.
    await callsService.applyStatus(callId, 'COMPLETED');

    // Deliberately not awaited: the caller is a dying process.
    void this.analyseInBackground(callId, input).catch((error) =>
      logger.error({ err: error, callId }, 'Post-call analysis failed'),
    );

    return saved;
  },

  /**
   * Derives the summary, the requirement and the verified outcome from the
   * transcript. Runs after the response has gone out.
   */
  async analyseInBackground(callId: string, input: CallResultInput): Promise<void> {
    const transcript = input.transcript;
    if (!capabilities.embeddings || transcript.length < 2) return;

    const capturedRequirement = input.capturedRequirement?.trim() || null;
    const fallbackOutcome = heuristicOutcome(transcript, input.outcomeHint);

    const analysis = await llmService.completeJson({
      system: SUMMARY_SYSTEM_PROMPT,
      user: renderTranscript(transcript),
      schema: analysisSchema,
      fallback: {
        summary: '',
        requirement: capturedRequirement,
        outcome: fallbackOutcome,
        reasoning: 'fallback',
      },
      maxTokens: 700,
    });

    await callsService.saveAgentResult(callId, {
      transcript,
      summary: analysis.summary || null,
      // The agent's captured requirement wins: it was confirmed with the customer
      // during the call, whereas the summariser reconstructs after the fact.
      extractedRequirement: capturedRequirement ?? analysis.requirement,
      // Outcome is re-derived from evidence rather than trusted from the agent.
      outcome: analysis.outcome,
    });

    logger.info(
      { callId, outcome: analysis.outcome, reasoning: analysis.reasoning },
      'Call analysed',
    );
  },

  /**
   * Agent lifecycle events double as a call-state signal path. Provider webhooks
   * remain authoritative when configured, but they need public ingress and can be
   * dropped; the agent is already talking to us over an authenticated channel.
   * Status transitions are monotonic, so whichever signal arrives first wins and
   * the other is ignored rather than conflicting.
   */
  async recordEvent(callId: string, input: CallEventInput): Promise<void> {
    await auditService.record({
      actorType: 'AGENT',
      action: `agent.${input.type.toLowerCase()}`,
      subject: callId,
      metadata: { detail: input.detail },
    });

    switch (input.type) {
      case 'AGENT_STARTED':
        // The agent reports this once the customer's leg has joined the room,
        // which is the moment they answered.
        await callsService.applyStatus(callId, 'CONNECTED');
        break;
      case 'AGENT_ENDED':
        await callsService.applyStatus(callId, 'COMPLETED');
        break;
      case 'AGENT_ERROR':
        logger.error({ callId, detail: input.detail }, 'Agent reported an error');
        break;
    }
  },
};
