import rateLimit from 'express-rate-limit';

const message = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down' },
};

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/** Login is the cheapest thing to brute force, so it gets its own tighter bucket. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Requesting a reset link. Unlike authLimiter this counts successes too: the abuse
 * here is mailbombing an address (or probing for accounts), and both look like
 * successes.
 */
export const passwordResetRequestLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/**
 * Submitting a new password gets its own bucket, so someone who asked for a couple
 * of links and then mistyped the new password is not locked out mid-reset. Guessing
 * a 256-bit token is not the threat this defends against; it just caps the noise.
 */
export const passwordResetSubmitLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});

/** Placing calls costs real money - keep the ceiling low. */
export const callLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message,
});
