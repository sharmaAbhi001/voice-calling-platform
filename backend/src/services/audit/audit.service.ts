import { query } from '../../database/client.js';
import { logger } from '../../utils/logger.js';

export interface AuditEntry {
  actorId?: string | null;
  actorType?: 'USER' | 'AGENT' | 'SYSTEM';
  action: string;
  subject?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only record of who did what. Placing calls is a regulated action in
 * India, so every dial and every outcome change leaves a trace.
 */
export const auditService = {
  async record(entry: AuditEntry): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (actor_id, actor_type, action, subject, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          entry.actorId ?? null,
          entry.actorType ?? 'USER',
          entry.action,
          entry.subject ?? null,
          JSON.stringify(entry.metadata ?? {}),
        ],
      );
    } catch (error) {
      // Auditing must never break the operation it is describing.
      logger.error({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  },
};
