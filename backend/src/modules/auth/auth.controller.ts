import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { unauthorized } from '../../utils/errors.js';
import { authService } from './auth.service.js';
import type { ForgotPasswordInput, LoginInput, ResetPasswordInput } from './auth.validation.js';

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const body = req.validated?.body as LoginInput;
    const { token, user } = await authService.login(body);

    // Cookie for the browser; the token is also returned for non-browser clients.
    res.cookie('voiceops_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.isProduction,
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.status(200).json({ token, user });
  },

  async logout(_req: Request, res: Response): Promise<void> {
    res.clearCookie('voiceops_token');
    res.status(204).send();
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    await authService.requestPasswordReset(req.validated?.body as ForgotPasswordInput);
    // Deliberately identical for known and unknown addresses.
    res.status(202).json({
      message: 'If that email belongs to an account, a reset link is on its way.',
    });
  },

  async resetPassword(req: Request, res: Response): Promise<void> {
    await authService.resetPassword(req.validated?.body as ResetPasswordInput);
    // The old session cookie is no longer trustworthy once the password changed.
    res.clearCookie('voiceops_token');
    res.status(200).json({ message: 'Password updated. You can sign in with it now.' });
  },

  async me(req: Request, res: Response): Promise<void> {
    if (!req.user) throw unauthorized();
    res.status(200).json(await authService.me(req.user.id));
  },
};
