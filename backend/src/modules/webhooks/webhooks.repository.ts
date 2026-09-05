import { Prisma } from '@prisma/client';
import { prisma } from '../../database/client.js';

export const webhooksRepository = {
  /**
   * Records an event and reports whether this process is the one that claimed it.
   * A unique (provider, event_key) turns webhook replay into a no-op instead of a
   * duplicated state transition.
   */
  async claim(input: {
    provider: string;
    eventKey: string;
    eventType: string | null;
    payload: unknown;
  }): Promise<boolean> {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: input.provider,
          eventKey: input.eventKey,
          eventType: input.eventType,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      });
      return true;
    } catch (error) {
      // P2002 is the unique violation on (provider, event_key): a replay.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return false;
      }
      throw error;
    }
  },
};
