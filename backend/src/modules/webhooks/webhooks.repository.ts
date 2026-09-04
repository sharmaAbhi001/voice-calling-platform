import { query } from '../../database/client.js';

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
    const { rowCount } = await query(
      `INSERT INTO webhook_events (provider, event_key, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (provider, event_key) DO NOTHING`,
      [input.provider, input.eventKey, input.eventType, JSON.stringify(input.payload)],
    );
    return (rowCount ?? 0) > 0;
  },
};
