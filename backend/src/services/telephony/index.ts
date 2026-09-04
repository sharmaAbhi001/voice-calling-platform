import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { CarrierProvider } from './carrier.types.js';
import { sipOnlyCarrier } from './sip-only.carrier.js';
import { twilioCarrier } from './twilio.carrier.js';

/**
 * Resolves the configured PSTN carrier. Adding a provider means adding one case
 * here plus its implementation - nothing in the domain modules changes, because
 * dialling goes through LiveKit rather than through the carrier's API.
 */
const resolveCarrier = (): CarrierProvider => {
  switch (env.SIP_CARRIER) {
    case 'twilio':
      return twilioCarrier;
    case 'exotel':
    case 'plivo':
    case 'telnyx':
      return sipOnlyCarrier(env.SIP_CARRIER);
    case 'none':
    default:
      return sipOnlyCarrier('none');
  }
};

export const carrier = resolveCarrier();

logger.info(
  { carrier: carrier.name, statusWebhooks: carrier.supportsStatusWebhooks },
  'Telephony carrier selected',
);

export type { CarrierProvider } from './carrier.types.js';
