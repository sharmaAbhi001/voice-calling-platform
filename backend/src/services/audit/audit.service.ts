import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';
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
      await prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorType: entry.actorType ?? 'USER',
          action: entry.action,
          subject: entry.subject ?? null,
          metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Auditing must never break the operation it is describing.
      logger.error({ err: error, action: entry.action }, 'Failed to write audit log');
    }
  },
};
