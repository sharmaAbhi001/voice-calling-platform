#!/usr/bin/env node
/**
 * Builds the LiveKit outbound SIP trunk payload from .env, so no carrier
 * credential is ever written into a file that git can see.
 *
 *   npm run trunk:build            # writes outbound-trunk.json (gitignored)
 *   npm run trunk:build -- --print # prints it instead, secrets masked
 *
 * Then: lk sip outbound create outbound-trunk.json
 * It prints ST_xxxxxxxx -> put that in .env as LIVEKIT_SIP_TRUNK_ID.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });

const env = process.env;
const print = process.argv.includes('--print');

const missing = ['SIP_TRUNK_ADDRESS', 'SIP_CALLER_ID'].filter((key) => !env[key]?.trim());
if (missing.length > 0) {
  console.error(
    `Cannot build the trunk: ${missing.join(', ')} missing from .env.\n` +
      'See the "Telephony carrier" section of .env.example.',
  );
  process.exit(1);
}

// Exotel authenticates by source IP, so it has no trunk credentials at all.
// Emitting empty auth_ fields would make LiveKit try (and fail) to authenticate.
const username = env.SIP_TRUNK_AUTH_USERNAME?.trim();
const password = env.SIP_TRUNK_AUTH_PASSWORD?.trim();
if (Boolean(username) !== Boolean(password)) {
  console.error(
    'Set SIP_TRUNK_AUTH_USERNAME and SIP_TRUNK_AUTH_PASSWORD together, or neither ' +
      '(neither = IP-whitelist carriers such as Exotel).',
  );
  process.exit(1);
}

const trunk = {
  name: env.SIP_TRUNK_NAME?.trim() || 'outbound',
  address: env.SIP_TRUNK_ADDRESS.trim(),
  numbers: env.SIP_CALLER_ID.split(',')
    .map((number) => number.trim())
    .filter(Boolean),
  ...(username ? { auth_username: username, auth_password: password } : {}),
  ...(env.SIP_TRUNK_TRANSPORT?.trim() ? { transport: env.SIP_TRUNK_TRANSPORT.trim() } : {}),
  ...(env.SIP_TRUNK_MEDIA_ENCRYPTION?.trim()
    ? { media_encryption: env.SIP_TRUNK_MEDIA_ENCRYPTION.trim() }
    : {}),
};

if (print) {
  const masked = { ...trunk, ...(username ? { auth_password: '********' } : {}) };
  console.log(JSON.stringify({ trunk: masked }, null, 2));
  process.exit(0);
}

const outputPath = path.join(root, 'outbound-trunk.json');
writeFileSync(outputPath, `${JSON.stringify({ trunk }, null, 2)}\n`, { mode: 0o600 });
console.log(
  `Wrote ${path.relative(root, outputPath)} (gitignored).\n` +
    'Next: lk sip outbound create outbound-trunk.json',
);
