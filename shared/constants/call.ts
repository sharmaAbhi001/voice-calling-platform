/**
 * Technical call status - reflects what the telephony stack did.
 * Never used to express whether the conversation went well.
 */
export const CALL_STATUS = [
  'QUEUED',
  'RINGING',
  'CONNECTED',
  'COMPLETED',
  'FAILED',
  'BUSY',
  'NO_ANSWER',
  'CANCELLED',
] as const;
export type CallStatus = (typeof CALL_STATUS)[number];

/**
 * Business outcome - what the conversation achieved. Stored separately
 * from CallStatus so a COMPLETED call can still be NOT_INTERESTED.
 */
export const CALL_OUTCOME = [
  'ATTEMPTED',
  'CONNECTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'CONVERTED',
  'ENDED',
] as const;
export type CallOutcome = (typeof CALL_OUTCOME)[number];

export const CALL_DIRECTION = ['OUTBOUND', 'INBOUND'] as const;
export type CallDirection = (typeof CALL_DIRECTION)[number];

export const TERMINAL_CALL_STATUSES: CallStatus[] = [
  'COMPLETED',
  'FAILED',
  'BUSY',
  'NO_ANSWER',
  'CANCELLED',
];

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  QUEUED: 'Queued',
  RINGING: 'Ringing',
  CONNECTED: 'Connected',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  BUSY: 'Busy',
  NO_ANSWER: 'No answer',
  CANCELLED: 'Cancelled',
};

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  ATTEMPTED: 'Attempted',
  CONNECTED: 'Connected',
  INTERESTED: 'Interested',
  NOT_INTERESTED: 'Not interested',
  CONVERTED: 'Converted',
  ENDED: 'Ended',
};
