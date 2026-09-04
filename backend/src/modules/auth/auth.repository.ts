import { query } from '../../database/client.js';
import type { PasswordResetTokenRecord, UserRecord } from './auth.types.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRecord['role'];
  status: UserRecord['status'];
  created_at: Date;
  updated_at: Date;
}

const toRecord = (row: UserRow): UserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.password_hash,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const COLUMNS = 'id, name, email, password_hash, role, status, created_at, updated_at';

export const authRepository = {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const { rows } = await query<UserRow>(
      `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  },

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1 LIMIT 1`, [
      id,
    ]);
    return rows[0] ? toRecord(rows[0]) : null;
  },

  async upsert(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRecord['role'];
  }): Promise<UserRecord> {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name
       RETURNING ${COLUMNS}`,
      [input.name, input.email, input.passwordHash, input.role],
    );
    return toRecord(rows[0] as UserRow);
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await query(
      'UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1',
      [userId, passwordHash],
    );
  },

  /**
   * Only the hash of the reset token is stored, so a leaked row cannot be replayed
   * as a link. Issuing a new token retires any outstanding ones for that user.
   */
  async createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [input.userId],
    );
    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [input.userId, input.tokenHash, input.expiresAt],
    );
  },

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const { rows } = await query<{
      id: string;
      user_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
    };
  },

  async consumePasswordResetToken(id: string): Promise<boolean> {
    // The used_at guard makes this the atomic step: two concurrent resets with the
    // same link produce exactly one winner.
    const { rowCount } = await query(
      'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL',
      [id],
    );
    return (rowCount ?? 0) > 0;
  },
};
