import type { User } from '@prisma/client';
import { prisma } from '../../database/client.js';
import type {
  PasswordResetTokenRecord,
  UserRecord,
  UserRole,
  UserStatus,
} from './auth.types.js';

// role/status are CHECK-constrained TEXT columns, so Prisma types them as string.
const toRecord = (row: User): UserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  passwordHash: row.passwordHash,
  role: row.role as UserRole,
  status: row.status as UserStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const authRepository = {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    return row ? toRecord(row) : null;
  },

  async findById(id: string): Promise<UserRecord | null> {
    const row = await prisma.user.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  },

  async upsert(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRecord['role'];
  }): Promise<UserRecord> {
    const row = await prisma.user.upsert({
      where: { email: input.email },
      create: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
      },
      // Deliberately narrower than `create`: re-seeding must not reset a role.
      update: { name: input.name, passwordHash: input.passwordHash },
    });
    return toRecord(row);
  },

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, updatedAt: new Date() },
    });
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
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: input.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
        },
      }),
    ]);
  },

  async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt,
    };
  },

  async consumePasswordResetToken(id: string): Promise<boolean> {
    // The used_at guard makes this the atomic step: two concurrent resets with the
    // same link produce exactly one winner.
    const { count } = await prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return count > 0;
  },
};
