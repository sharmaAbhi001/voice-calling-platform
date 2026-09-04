import type {
  Call,
  CallDirection,
  CallOutcome,
  CallStatus,
  TranscriptTurn,
} from '@voiceops/shared';
import { query } from '../../database/client.js';

interface CallRow {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  template_id: string | null;
  template_name: string | null;
  knowledge_base_id: string | null;
  phone: string;
  provider_call_id: string | null;
  room_name: string | null;
  sip_participant_id: string | null;
  direction: CallDirection;
  status: CallStatus;
  outcome: CallOutcome;
  failure_reason: string | null;
  variables: Record<string, string>;
  started_at: Date | null;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: TranscriptTurn[] | null;
  summary: string | null;
  extracted_requirement: string | null;
  created_at: Date;
}

const CALL_FIELDS = `
  c.id, c.contact_id, ct.name AS contact_name, c.template_id, t.name AS template_name,
  c.knowledge_base_id, c.phone, c.provider_call_id, c.room_name, c.sip_participant_id,
  c.direction, c.status, c.outcome, c.failure_reason, c.variables,
  c.started_at, c.answered_at, c.ended_at, c.duration_seconds, c.recording_url,
  c.transcript, c.summary, c.extracted_requirement, c.created_at`;

/**
 * The same projection, read either from the table or from a data-modifying CTE.
 * Postgres does not show rows written by a CTE to the rest of the statement, so
 * an INSERT/UPDATE that wants the joined row back must select from its own
 * RETURNING output rather than from `calls`.
 */
const selectCallFrom = (source: string): string => `
  SELECT ${CALL_FIELDS}
  FROM ${source} c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN templates t ON t.id = c.template_id`;

const SELECT_CALL = selectCallFrom('calls');

export const toCall = (row: CallRow): Call => ({
  id: row.id,
  contactId: row.contact_id,
  contactName: row.contact_name,
  templateId: row.template_id,
  templateName: row.template_name,
  knowledgeBaseId: row.knowledge_base_id,
  phone: row.phone,
  providerCallId: row.provider_call_id,
  roomName: row.room_name,
  direction: row.direction,
  status: row.status,
  outcome: row.outcome,
  failureReason: row.failure_reason,
  startedAt: row.started_at?.toISOString() ?? null,
  answeredAt: row.answered_at?.toISOString() ?? null,
  endedAt: row.ended_at?.toISOString() ?? null,
  durationSeconds: row.duration_seconds,
  recordingUrl: row.recording_url,
  transcript: row.transcript,
  summary: row.summary,
  extractedRequirement: row.extracted_requirement,
  createdAt: row.created_at.toISOString(),
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

export const callsRepository = {
  async list(filters: CallFilters): Promise<{ items: Call[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.search) {
      params.push(`%${filters.search.toLowerCase()}%`);
      conditions.push(`(c.phone LIKE $${params.length} OR lower(ct.name) LIKE $${params.length})`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`c.status = $${params.length}`);
    }
    if (filters.outcome) {
      params.push(filters.outcome);
      conditions.push(`c.outcome = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`c.created_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`c.created_at <= $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalResult = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM calls c
       LEFT JOIN contacts ct ON ct.id = c.contact_id ${where}`,
      params,
    );

    params.push(filters.limit, filters.offset);
    const { rows } = await query<CallRow>(
      `${SELECT_CALL} ${where} ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items: rows.map(toCall), total: totalResult.rows[0]?.count ?? 0 };
  },

  async findById(id: string): Promise<Call | null> {
    const { rows } = await query<CallRow>(`${SELECT_CALL} WHERE c.id = $1`, [id]);
    return rows[0] ? toCall(rows[0]) : null;
  },

  async findByRoomName(roomName: string): Promise<Call | null> {
    const { rows } = await query<CallRow>(`${SELECT_CALL} WHERE c.room_name = $1`, [roomName]);
    return rows[0] ? toCall(rows[0]) : null;
  },

  async create(input: CreateCallRow): Promise<Call> {
    const { rows } = await query<CallRow>(
      `WITH inserted AS (
         INSERT INTO calls (contact_id, template_id, knowledge_base_id, created_by, phone,
                            room_name, variables, status, outcome)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'QUEUED', 'ATTEMPTED')
         RETURNING *
       )
       ${selectCallFrom('inserted')}`,
      [
        input.contactId,
        input.templateId,
        input.knowledgeBaseId,
        input.createdBy,
        input.phone,
        input.roomName,
        JSON.stringify(input.variables),
      ],
    );
    return toCall(rows[0] as CallRow);
  },

  async patch(id: string, patch: CallStatusPatch): Promise<Call | null> {
    const columnByField: Record<keyof CallStatusPatch, string> = {
      status: 'status',
      outcome: 'outcome',
      failureReason: 'failure_reason',
      providerCallId: 'provider_call_id',
      sipParticipantId: 'sip_participant_id',
      startedAt: 'started_at',
      answeredAt: 'answered_at',
      endedAt: 'ended_at',
      durationSeconds: 'duration_seconds',
      recordingUrl: 'recording_url',
    };

    const assignments: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(columnByField) as Array<
      [keyof CallStatusPatch, string]
    >) {
      const value = patch[field];
      if (value === undefined) continue;
      params.push(value);
      assignments.push(`${column} = $${params.length}`);
    }
    if (assignments.length === 0) return this.findById(id);

    params.push(id);
    const { rows } = await query<CallRow>(
      `WITH updated AS (
         UPDATE calls SET ${assignments.join(', ')} WHERE id = $${params.length} RETURNING *
       )
       ${selectCallFrom('updated')}`,
      params,
    );
    return rows[0] ? toCall(rows[0]) : null;
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
    const { rows } = await query<CallRow>(
      `WITH updated AS (
         UPDATE calls
         SET transcript = $2::jsonb, summary = $3, extracted_requirement = $4, outcome = $5
         WHERE id = $1
         RETURNING *
       )
       ${selectCallFrom('updated')}`,
      [
        id,
        JSON.stringify(result.transcript),
        result.summary,
        result.extractedRequirement,
        result.outcome,
      ],
    );
    return rows[0] ? toCall(rows[0]) : null;
  },

  /** Template variables are not part of the public Call shape, so they load separately. */
  async getVariables(id: string): Promise<Record<string, string>> {
    const { rows } = await query<{ variables: Record<string, string> }>(
      'SELECT variables FROM calls WHERE id = $1',
      [id],
    );
    return rows[0]?.variables ?? {};
  },

  /** Outbound protection counters. */
  async countToday(): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM calls WHERE created_at >= date_trunc('day', now())`,
    );
    return rows[0]?.count ?? 0;
  },

  async countActive(): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM calls
       WHERE status IN ('QUEUED', 'RINGING', 'CONNECTED')`,
    );
    return rows[0]?.count ?? 0;
  },

  /**
   * Rows stuck in a non-terminal state past a cutoff. A dropped webhook must not
   * leave a call "ringing" forever and eat the concurrency budget.
   */
  async findStale(olderThanMinutes: number): Promise<Call[]> {
    const { rows } = await query<CallRow>(
      `${SELECT_CALL}
       WHERE c.status IN ('QUEUED', 'RINGING', 'CONNECTED')
         AND c.created_at < now() - ($1 || ' minutes')::interval`,
      [String(olderThanMinutes)],
    );
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
    const { rows } = await query<{
      calls_today: number;
      connected: number;
      interested: number;
      converted: number;
      avg_duration: number | null;
      live_calls: number;
    }>(
      `SELECT
         count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS calls_today,
         count(*) FILTER (WHERE answered_at IS NOT NULL)::int AS connected,
         count(*) FILTER (WHERE outcome = 'INTERESTED')::int AS interested,
         count(*) FILTER (WHERE outcome = 'CONVERTED')::int AS converted,
         avg(duration_seconds) FILTER (WHERE duration_seconds IS NOT NULL) AS avg_duration,
         count(*) FILTER (WHERE status IN ('QUEUED','RINGING','CONNECTED'))::int AS live_calls
       FROM calls`,
    );
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
