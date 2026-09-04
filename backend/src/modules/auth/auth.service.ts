import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { emailService } from '../../services/email/email.service.js';
import { logger } from '../../utils/logger.js';
import { badRequest, forbidden, unauthorized } from '../../utils/errors.js';
import { authRepository } from './auth.repository.js';
import type { AuthenticatedUser, UserRecord } from './auth.types.js';
import type { ForgotPasswordInput, LoginInput, ResetPasswordInput } from './auth.validation.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const toPublicUser = (user: UserRecord) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt.toISOString(),
});

export const authService = {
  async login(input: LoginInput) {
    const user = await authRepository.findByEmail(input.email);
    // Same message for unknown email and wrong password: do not leak which accounts exist.
    if (!user) throw unauthorized('Email or password is incorrect');

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) throw unauthorized('Email or password is incorrect');
    if (user.status !== 'ACTIVE') throw forbidden('This account has been disabled');

    const payload: AuthenticatedUser = { id: user.id, email: user.email, role: user.role };
    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return { token, user: toPublicUser(user) };
  },

  /**
   * Always resolves the same way, whether or not the address belongs to an account:
   * the response is the only signal an anonymous caller gets, so it must not reveal
   * which emails are registered.
   */
  async requestPasswordReset(input: ForgotPasswordInput): Promise<void> {
    const user = await authRepository.findByEmail(input.email);
    if (!user || user.status !== 'ACTIVE') {
      logger.info({ email: input.email }, 'Password reset requested for unknown or disabled account');
      return;
    }

    // 32 random bytes, base64url. Only its hash reaches the database.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000);
    await authRepository.createPasswordResetToken({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt,
    });

    const resetUrl = `${env.passwordResetUrl}?token=${encodeURIComponent(token)}`;
    await emailService.sendPasswordReset({
      to: user.email,
      name: user.name,
      resetUrl,
      ttlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    });
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const expired = badRequest('This reset link is invalid or has expired. Request a new one.');

    const record = await authRepository.findPasswordResetToken(sha256(input.token));
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) throw expired;

    const user = await authRepository.findById(record.userId);
    if (!user || user.status !== 'ACTIVE') throw expired;

    // Consume first: if another request already claimed this link, stop here.
    if (!(await authRepository.consumePasswordResetToken(record.id))) throw expired;

    await authRepository.updatePassword(user.id, await authService.hashPassword(input.password));
    logger.info({ userId: user.id }, 'Password reset completed');
  },

  async me(userId: string) {
    const user = await authRepository.findById(userId);
    if (!user) throw unauthorized('Session is no longer valid');
    return toPublicUser(user);
  },

  verifyToken(token: string): AuthenticatedUser {
    try {
      return jwt.verify(token, env.JWT_SECRET) as AuthenticatedUser;
    } catch {
      throw unauthorized('Session expired, please sign in again');
    }
  },

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  },
};
