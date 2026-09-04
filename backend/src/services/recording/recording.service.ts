import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import { capabilities, env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface RecordingHandle {
  egressId: string;
  /** Where the finished file will land. Not yet playable when recording starts. */
  objectKey: string;
}

const s3Configured = (): boolean =>
  Boolean(env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY);

let egress: EgressClient | null = null;
const client = (): EgressClient => {
  egress ??= new EgressClient(env.LIVEKIT_URL!, env.LIVEKIT_API_KEY!, env.LIVEKIT_API_SECRET!);
  return egress;
};

/**
 * Call recording via LiveKit room-composite egress, audio only.
 *
 * LiveKit Cloud uploads directly to object storage, so without S3-compatible
 * credentials there is nowhere to put the file and recording is skipped rather
 * than silently failing mid-call.
 */
export const recordingService = {
  isAvailable(): boolean {
    return capabilities.livekit && s3Configured();
  },

  async start(roomName: string): Promise<RecordingHandle | null> {
    if (!this.isAvailable()) {
      logger.info({ roomName }, 'Recording skipped: object storage is not configured');
      return null;
    }

    const objectKey = `recordings/${roomName}.ogg`;
    try {
      const info = await client().startRoomCompositeEgress(
        roomName,
        {
          file: new EncodedFileOutput({
            fileType: EncodedFileType.OGG,
            filepath: objectKey,
            output: {
              case: 's3',
              value: new S3Upload({
                accessKey: env.STORAGE_ACCESS_KEY!,
                secret: env.STORAGE_SECRET_KEY!,
                bucket: env.STORAGE_BUCKET!,
                region: env.STORAGE_REGION,
                endpoint: env.STORAGE_ENDPOINT,
                forcePathStyle: Boolean(env.STORAGE_ENDPOINT),
              }),
            },
          }),
        },
        { audioOnly: true },
      );
      return { egressId: info.egressId, objectKey };
    } catch (error) {
      // A failed recording must never take the call down with it.
      logger.error({ err: error, roomName }, 'Failed to start recording');
      return null;
    }
  },

  async stop(egressId: string): Promise<void> {
    try {
      await client().stopEgress(egressId);
    } catch (error) {
      logger.warn({ err: error, egressId }, 'Failed to stop egress (it may have ended already)');
    }
  },
};
