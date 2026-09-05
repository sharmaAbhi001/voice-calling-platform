import type {
  Call,
  CallDirection,
  CallOutcome,
  CallStatus,
  TranscriptTurn,
} from '@voiceops/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';

/** The joined shape every read in this file returns: the call plus the two names. */
const CALL_INCLUDE = {
  contact: { select: { name: true } },
  template: { select: { name: true } },
} satisfies Prisma.CallInclude;

type CallRow = Prisma.CallGetPayload<{ include: typeof CALL_INCLUDE }>;

export const toCall = (row: CallRow): Call => ({
  id: row.id,
  contactId: row.contactId,
  contactName: row.contact?.name ?? null,
  templateId: row.templateId,
  templateName: row.template?.name ?? null,
  knowledgeBaseId: row.knowledgeBaseId,
  phone: row.phone,
  providerCallId: row.providerCallId,
  roomName: row.roomName,
  direction: row.direction as CallDirection,
  status: row.status as CallStatus,
  outcome: row.outcome as CallOutcome,
  failureReason: row.failureReason,
  startedAt: row.startedAt?.toISOString() ?? null,
  answeredAt: row.answeredAt?.toISOString() ?? null,
  endedAt: row.endedAt?.toISOString() ?? null,
  durationSeconds: row.durationSeconds,
  recordingUrl: row.recordingUrl,
  transcript: (row.transcript as TranscriptTurn[] | null) ?? null,
  summary: row.summary,
  extractedRequirement: row.extractedRequirement,
  createdAt: row.createdAt.toISOString(),
});

export interface CallFilters {
  search?: string;
  status?: CallStatus;
  outcome?: CallOutcome;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface CreateCallRow {
  contactId: string | null;
  templateId: string;
  knowledgeBaseId: string | null;
  createdBy: string | null;
  phone: string;
  roomName: string;
  variables: Record<string, string>;
}

export interface CallStatusPatch {
  status?: CallStatus;
  outcome?: CallOutcome;
  failureReason?: string | null;
  providerCallId?: string | null;
  sipParticipantId?: string | null;
  startedAt?: Date | null;
  answeredAt?: Date | null;
  endedAt?: Date | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
}

/** Statuses that still consume the concurrency budget. */
const ACTIVE_STATUSES = ['QUEUED', 'RINGING', 'CONNECTED'];

const buildWhere = (filters: CallFilters): Prisma.CallWhereInput => {
  const where: Prisma.CallWhereInput = {};
  if (filters.search) {
    where.OR = [
      { phone: { contains: filters.search } },
      { contact: { name: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.outcome) where.outcome = filters.outcome;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  return where;
};

export const callsRepository = {
  async list(filters: CallFilters): Promise<{ items: Call[]; total: number }> {
    const where = buildWhere(filters);
    const [rows, total] = await prisma.$transaction([
      prisma.call.findMany({
        where,
        include: CALL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: filters.limit,
        skip: filters.offset,
      }),
      prisma.call.count({ where }),
    ]);
    return { items: rows.map(toCall), total };
  },

  async findById(id: string): Promise<Call | null> {
    const row = await prisma.call.findUnique({ where: { id }, include: CALL_INCLUDE });
    return row ? toCall(row) : null;
  },

  async findByRoomName(roomName: string): Promise<Call | null> {
    const row = await prisma.call.findUnique({ where: { roomName }, include: CALL_INCLUDE });
    return row ? toCall(row) : null;
  },

  async create(input: CreateCallRow): Promise<Call> {
    const row = await prisma.call.create({
      data: {
        contactId: input.contactId,
        templateId: input.templateId,
        knowledgeBaseId: input.knowledgeBaseId,
        createdBy: input.createdBy,
        phone: input.phone,
        roomName: input.roomName,
        variables: input.variables,
        status: 'QUEUED',
        outcome: 'ATTEMPTED',
      },
      include: CALL_INCLUDE,
    });
    return toCall(row);
  },

  async patch(id: string, patch: CallStatusPatch): Promise<Call | null> {
    const data: Prisma.CallUncheckedUpdateManyInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.outcome !== undefined) data.outcome = patch.outcome;
    if (patch.failureReason !== undefined) data.failureReason = patch.failureReason;
    if (patch.providerCallId !== undefined) data.providerCallId = patch.providerCallId;
    if (patch.sipParticipantId !== undefined) data.sipParticipantId = patch.sipParticipantId;
    if (patch.startedAt !== undefined) data.startedAt = patch.startedAt;
    if (patch.answeredAt !== undefined) data.answeredAt = patch.answeredAt;
    if (patch.endedAt !== undefined) data.endedAt = patch.endedAt;
    if (patch.durationSeconds !== undefined) data.durationSeconds = patch.durationSeconds;
    if (patch.recordingUrl !== undefined) data.recordingUrl = patch.recordingUrl;
    if (Object.keys(data).length === 0) return this.findById(id);

    // updateMany rather than update so a missing row is null, not a thrown P2025.
    const { count } = await prisma.call.updateMany({ where: { id }, data });
    return count > 0 ? this.findById(id) : null;
  },

  async saveResult(
    id: string,
    result: {
      transcript: TranscriptTurn[];
      summary: string | null;
      extractedRequirement: string | null;
      outcome: CallOutcome;
    },
  ): Promise<Call | null> {
    const { count } = await prisma.call.updateMany({
      where: { id },
      data: {
        transcript: result.transcript as unknown as Prisma.InputJsonValue,
        summary: result.summary,
        extractedRequirement: result.extractedRequirement,
        outcome: result.outcome,
      },
    });
    return count > 0 ? this.findById(id) : null;
  },

  /** Template variables are not part of the public Call shape, so they load separately. */
  async getVariables(id: string): Promise<Record<string, string>> {
    const row = await prisma.call.findUnique({ where: { id }, select: { variables: true } });
    return (row?.variables as Record<string, string> | undefined) ?? {};
  },

  /** Outbound protection counters. */
  async countToday(): Promise<number> {
    // date_trunc stays in SQL so "today" is the database's day, the same boundary
    // the dashboard reports against, regardless of the Node process's timezone.
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM calls WHERE created_at >= date_trunc('day', now())`;
    return rows[0]?.count ?? 0;
  },

  async countActive(): Promise<number> {
    return prisma.call.count({ where: { status: { in: ACTIVE_STATUSES } } });
  },

  /**
   * Rows stuck in a non-terminal state past a cutoff. A dropped webhook must not
   * leave a call "ringing" forever and eat the concurrency budget.
   */
  async findStale(olderThanMinutes: number): Promise<Call[]> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const rows = await prisma.call.findMany({
      where: { status: { in: ACTIVE_STATUSES }, createdAt: { lt: cutoff } },
      include: CALL_INCLUDE,
    });
    return rows.map(toCall);
  },

  async dashboardStats(): Promise<{
    callsToday: number;
    connected: number;
    interested: number;
    converted: number;
    averageDurationSeconds: number;
    liveCalls: number;
  }> {
    // One pass over the table with FILTER clauses: six Prisma counts would be six
    // round trips and six sequential scans.
    const rows = await prisma.$queryRaw<
      Array<{
        calls_today: number;
        connected: number;
        interested: number;
        converted: number;
        avg_duration: number | null;
        live_calls: number;
      }>
    >`
      SELECT
        count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS calls_today,
        count(*) FILTER (WHERE answered_at IS NOT NULL)::int AS connected,
        count(*) FILTER (WHERE outcome = 'INTERESTED')::int AS interested,
        count(*) FILTER (WHERE outcome = 'CONVERTED')::int AS converted,
        avg(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL)::float8 AS avg_duration,
        count(*) FILTER (WHERE status IN ('QUEUED','RINGING','CONNECTED'))::int AS live_calls
      FROM calls`;
    const row = rows[0];
    return {
      callsToday: row?.calls_today ?? 0,
      connected: row?.connected ?? 0,
      interested: row?.interested ?? 0,
      converted: row?.converted ?? 0,
      averageDurationSeconds: Math.round(row?.avg_duration ?? 0),
      liveCalls: row?.live_calls ?? 0,
    };
  },
};
