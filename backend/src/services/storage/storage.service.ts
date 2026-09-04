import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Recordings live in private object storage. The API never returns a raw bucket
 * URL; it mints a short-lived pre-signed GET so a leaked link expires.
 *
 * SigV4 is implemented here directly to avoid pulling the AWS SDK into the
 * backend for one operation.
 */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

const sha256Hex = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');

const hmac = (key: crypto.BinaryLike | Buffer, value: string): Buffer =>
  crypto.createHmac('sha256', key).update(value, 'utf8').digest();

const encodeKey = (objectKey: string): string =>
  objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

export interface StorageService {
  isConfigured(): boolean;
  getSignedUrl(objectKey: string): string | null;
}

export const storageService: StorageService = {
  isConfigured() {
    return Boolean(env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY);
  },

  getSignedUrl(objectKey) {
    if (!this.isConfigured()) return null;

    const region = env.STORAGE_REGION || 'us-east-1';
    const bucket = env.STORAGE_BUCKET as string;
    const accessKey = env.STORAGE_ACCESS_KEY as string;
    const secretKey = env.STORAGE_SECRET_KEY as string;

    // Path-style for custom endpoints (MinIO, R2), virtual-host style for AWS.
    const { host, basePath } = env.STORAGE_ENDPOINT
      ? {
          host: new URL(env.STORAGE_ENDPOINT).host,
          basePath: `/${bucket}/${encodeKey(objectKey)}`,
        }
      : { host: `${bucket}.s3.${region}.amazonaws.com`, basePath: `/${encodeKey(objectKey)}` };

    const now = new Date();
    const amzDate = `${now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15)}Z`;
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(SIGNED_URL_TTL_SECONDS),
      'X-Amz-SignedHeaders': 'host',
    });

    const canonicalRequest = [
      'GET',
      basePath,
      params.toString(),
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), 's3'),
      'aws4_request',
    );
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const scheme = env.STORAGE_ENDPOINT ? new URL(env.STORAGE_ENDPOINT).protocol : 'https:';
    return `${scheme}//${host}${basePath}?${params.toString()}&X-Amz-Signature=${signature}`;
  },
};
