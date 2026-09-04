import crypto from 'node:crypto';
import type {
  Call,
  CallContext,
  CallOutcome,
  CallResultPayload,
  CallStatus,
  DashboardStats,
  Paginated,
} from '@voiceops/shared';
import { TERMINAL_CALL_STATUSES } from '@voiceops/shared';
import { env } from '../../config/env.js';
import { badRequest, forbidden, notFound, unprocessable } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { assertDialable, maskPhone, toE164 } from '../../utils/phone.js';
import { auditService } from '../../services/audit/audit.service.js';
import { livekitService } from '../../services/livekit/livekit.service.js';
import { recordingService } from '../../services/recording/recording.service.js';
import { storageService } from '../../services/storage/storage.service.js';
import { contactsRepository } from '../contacts/contacts.repository.js';
import { knowledgeBaseRepository } from '../knowledge-base/knowledge-base.repository.js';
import { renderTemplateText, templatesService } from '../templates/templates.service.js';
import { callsRepository } from './calls.repository.js';
import type { CreateCallInput, ListCallsQuery } from './calls.validation.js';

/** Egress ids are only needed between call start and call end, so memory is enough. */
const activeRecordings = new Map<string, string>();

/**
 * Status is a one-way street. A late RINGING webhook must never drag a COMPLETED
 * call backwards, which is what makes webhook replay safe.
 */
const STATUS_RANK: Record<CallStatus, number> = {
  QUEUED: 0,
  RINGING: 1,
  CONNECTED: 2,
  COMPLETED: 3,
  FAILED: 3,
  BUSY: 3,
  NO_ANSWER: 3,
  CANCELLED: 3,
};

const canAdvance = (from: CallStatus, to: CallStatus): boolean => {
  if (from === to) return false;
  if (TERMINAL_CALL_STATUSES.includes(from)) return false;
  return STATUS_RANK[to] >= STATUS_RANK[from];
};

export const callsService = {
  async list(filters: ListCallsQuery): Promise<Paginated<Call>> {
    const { items, total } = await callsRepository.list({
      search: filters.search,
      status: filters.status,
      outcome: filters.outcome,
      from: filters.from,
      to: filters.to,
      limit: filters.pageSize,
      offset: (filters.page - 1) * filters.pageSize,
    });
    return { data: items, page: filters.page, pageSize: filters.pageSize, total };
  },

  async getById(id: string): Promise<Call> {
    const call = await callsRepository.findById(id);
    if (!call) throw notFound('Call');
    return call;
  },

  /** Recording links are minted per request and expire; the raw object key never leaves. */
  async getRecordingUrl(id: string): Promise<{ url: string | null; expiresInSeconds: number }> {
    const call = await this.getById(id);
    if (!call.recordingUrl) return { url: null, expiresInSeconds: 0 };
    return { url: storageService.getSignedUrl(call.recordingUrl), expiresInSeconds: 900 };
  },

  stats(): Promise<DashboardStats> {
    return callsRepository.dashboardStats();
  },

  /**
   * Places one outbound call: guard rails, then LiveKit room, then agent, then dial.
   * The call row exists before anything is dialled so a provider failure is still
   * a visible, explainable record rather than a lost request.
   */
  async createCall(input: CreateCallInput, actorId: string | null): Promise<Call> {
    const template = await templatesService.getById(input.templateId);

    let contactId: string | null = null;
    let phone: string;
    const variables: Record<string, string> = { ...input.variables };

    if (input.contactId) {
      const contact = await contactsRepository.findById(input.contactId);
      if (!contact) throw notFound('Contact');
      if (contact.eligibilityStatus !== 'ELIGIBLE') {
        throw forbidden(
          `${contact.name} is marked "${contact.eligibilityStatus}" and cannot be called. Record consent first.`,
        );
      }
      contactId = contact.id;
      phone = contact.phone;
      // Contact fields are offered to the template without overriding explicit input.
      variables.first_name ??= contact.name.split(' ')[0] ?? contact.name;
      variables.full_name ??= contact.name;
      if (contact.company) variables.company ??= contact.company;
    } else {
      phone = toE164(input.phone as string);
    }

    assertDialable(phone);
    templatesService.assertVariablesSatisfied(template, variables);

    // Volume guard rails, checked as late as possible so they reflect reality.
    const [todayCount, activeCount] = await Promise.all([
      callsRepository.countToday(),
      callsRepository.countActive(),
    ]);
    if (todayCount >= env.MAX_CALLS_PER_DAY) {
      throw unprocessable(
        `Daily call limit of ${env.MAX_CALLS_PER_DAY} reached. Raise MAX_CALLS_PER_DAY to continue.`,
      );
    }
    if (activeCount >= env.MAX_CONCURRENT_CALLS) {
      throw unprocessable(
        `${activeCount} calls are already in progress (limit ${env.MAX_CONCURRENT_CALLS}). Try again shortly.`,
      );
    }

    if (template.knowledgeBaseId) {
      const base = await knowledgeBaseRepository.findBaseById(template.knowledgeBaseId);
      if (!base) throw badRequest('The template points at a knowledge base that no longer exists');
    }

    const roomName = `call-${crypto.randomUUID()}`;
    const call = await callsRepository.create({
      contactId,
      templateId: template.id,
      knowledgeBaseId: template.knowledgeBaseId,
      createdBy: actorId,
      phone,
      roomName,
      variables,
    });

    await auditService.record({
      actorId,
      action: 'call.create',
      subject: call.id,
      metadata: { phone: maskPhone(phone), templateId: template.id },
    });

    try {
      // The agent reads its context id from room metadata, so no secrets travel here.
      const metadata = JSON.stringify({ callId: call.id });
      await livekitService.createRoom(roomName, metadata);
      await livekitService.dispatchAgent(roomName, metadata);

      const dial = await livekitService.dial({
        roomName,
        phone,
        participantName: variables.full_name ?? 'Customer',
      });

      const recording = await recordingService.start(roomName);
      if (recording) activeRecordings.set(call.id, recording.egressId);

      const updated = await callsRepository.patch(call.id, {
        status: 'RINGING',
        startedAt: new Date(),
        sipParticipantId: dial.participantId,
        providerCallId: dial.participantId,
        ...(recording ? { recordingUrl: recording.objectKey } : {}),
      });
      return updated ?? call;
    } catch (error) {
      const reason = (error as Error).message;
      logger.error({ err: error, callId: call.id }, 'Failed to place call');
      await callsRepository.patch(call.id, {
        status: 'FAILED',
        failureReason: reason.slice(0, 500),
        endedAt: new Date(),
      });
      // A LiveKit or SIP failure is never a "connected" call - surface it as-is.
      throw error;
    }
  },

  async endCall(id: string, actorId: string | null): Promise<Call> {
    const call = await this.getById(id);
    if (TERMINAL_CALL_STATUSES.includes(call.status)) return call;

    if (call.roomName) {
      await livekitService.hangUp(call.roomName).catch((error) => {
        logger.warn({ err: error, callId: id }, 'Hang up failed, marking call ended anyway');
      });
    }
    await this.stopRecording(id);

    await auditService.record({ actorId, action: 'call.end', subject: id });
    return (
      (await this.applyStatus(id, call.answeredAt ? 'COMPLETED' : 'CANCELLED')) ?? call
    );
  },

  async stopRecording(callId: string): Promise<void> {
    const egressId = activeRecordings.get(callId);
    if (!egressId) return;
    activeRecordings.delete(callId);
    await recordingService.stop(egressId);
  },

  /**
   * The single writer for call status. Idempotent by construction: an event that
   * would move the call backwards, or repeat where it already is, changes nothing.
   */
  async applyStatus(
    id: string,
    status: CallStatus,
    extra: { failureReason?: string; at?: Date } = {},
  ): Promise<Call | null> {
    const call = await callsRepository.findById(id);
    if (!call) return null;
    if (!canAdvance(call.status, status)) {
      logger.debug({ callId: id, from: call.status, to: status }, 'Ignoring stale status event');
      return call;
    }

    const at = extra.at ?? new Date();
    const patch: Parameters<typeof callsRepository.patch>[1] = { status };

    if (status === 'CONNECTED') {
      patch.answeredAt = at;
      // Reaching a human is a business fact too, but never a downgrade.
      if (call.outcome === 'ATTEMPTED') patch.outcome = 'CONNECTED';
    }

    if (TERMINAL_CALL_STATUSES.includes(status)) {
      patch.endedAt = at;
      const startedFrom = call.answeredAt ?? call.startedAt;
      if (startedFrom) {
        patch.durationSeconds = Math.max(
          0,
          Math.round((at.getTime() - new Date(startedFrom).getTime()) / 1000),
        );
      }
      if (extra.failureReason) patch.failureReason = extra.failureReason.slice(0, 500);
      await this.stopRecording(id);
    }

    return callsRepository.patch(id, patch);
  },

  findByRoomName(roomName: string): Promise<Call | null> {
    return callsRepository.findByRoomName(roomName);
  },

  /** Context handed to the agent when it joins the room. */
  async getCallContext(callId: string): Promise<CallContext> {
    const call = await this.getById(callId);
    if (!call.templateId) throw badRequest('This call has no template attached');

    const template = await templatesService.getById(call.templateId);
    const variables = await this.getVariables(callId);
    const contact = call.contactId ? await contactsRepository.findById(call.contactId) : null;
    const base = call.knowledgeBaseId
      ? await knowledgeBaseRepository.findBaseById(call.knowledgeBaseId)
      : null;

    return {
      callId: call.id,
      phone: call.phone,
      contact: contact ? { name: contact.name, company: contact.company } : null,
      template: {
        name: template.name,
        objective: template.objective,
        // Rendered here so the agent never sees an unresolved {{placeholder}}.
        openingScript: renderTemplateText(template.openingScript, variables),
        systemPrompt: renderTemplateText(template.systemPrompt, variables),
        closingScript: renderTemplateText(template.closingScript, variables),
        tone: template.tone,
        language: template.language,
        voiceProvider: template.voiceProvider,
        llmProvider: template.llmProvider,
        voiceName: template.voiceName,
        backgroundAudio: template.backgroundAudio,
        qualificationQuestions: template.qualificationQuestions,
      },
      knowledgeBaseId: call.knowledgeBaseId,
      knowledgeBaseName: base?.name ?? null,
      variables,
    };
  },

  getVariables(callId: string): Promise<Record<string, string>> {
    return callsRepository.getVariables(callId);
  },

  /** Written once by the agent when the conversation ends. */
  async saveAgentResult(callId: string, payload: CallResultPayload): Promise<Call> {
    const call = await this.getById(callId);

    const outcome: CallOutcome = payload.outcome;
    const saved = await callsRepository.saveResult(callId, {
      transcript: payload.transcript,
      summary: payload.summary,
      extractedRequirement: payload.extractedRequirement,
      outcome,
    });

    if (payload.agentError) {
      await callsRepository.patch(callId, { failureReason: payload.agentError.slice(0, 500) });
    }

    await auditService.record({
      actorType: 'AGENT',
      action: 'call.result',
      subject: callId,
      metadata: { outcome, turns: payload.transcript.length },
    });

    return saved ?? call;
  },

  /**
   * Safety net for missed provider events: anything still "in flight" well past a
   * plausible call length is closed out so it stops blocking concurrency.
   */
  async reconcileStaleCalls(olderThanMinutes = 30): Promise<number> {
    const stale = await callsRepository.findStale(olderThanMinutes);
    for (const call of stale) {
      logger.warn({ callId: call.id, status: call.status }, 'Closing stale call');
      await this.applyStatus(call.id, call.answeredAt ? 'COMPLETED' : 'FAILED', {
        failureReason: 'No provider event received; closed by reconciliation',
      });
    }
    return stale.length;
  },
};
