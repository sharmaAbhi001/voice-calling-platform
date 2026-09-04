import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { badRequest, forbidden } from './errors.js';
import { env } from '../config/env.js';

/** Normalises any user input to E.164, defaulting to India when no country code is given. */
export const toE164 = (input: string, defaultCountry: 'IN' = 'IN'): string => {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) {
    throw badRequest(`"${input}" is not a valid phone number`);
  }
  return parsed.number;
};

/**
 * Outbound protection. A number must match an allowed country prefix and, when a
 * hard allowlist is configured, be on it. Keeps a dev mistake from dialling the world.
 */
export const assertDialable = (e164: string): void => {
  const prefixes = env.allowedDestinationPrefixes;
  if (prefixes.length > 0 && !prefixes.some((prefix) => e164.startsWith(prefix))) {
    throw forbidden(`Destination ${maskPhone(e164)} is outside the allowed calling region`);
  }
  const allowlist = env.destinationAllowlist;
  if (allowlist.length > 0 && !allowlist.includes(e164)) {
    throw forbidden(`Destination ${maskPhone(e164)} is not on the destination allowlist`);
  }
};

/** For logs and error messages - never log a full customer number. */
export const maskPhone = (e164: string): string =>
  e164.length <= 5 ? e164 : `${e164.slice(0, 3)}${'X'.repeat(e164.length - 5)}${e164.slice(-2)}`;
