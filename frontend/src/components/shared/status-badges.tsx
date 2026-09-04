import {
  CALL_OUTCOME_LABEL,
  CALL_STATUS_LABEL,
  ELIGIBILITY_LABEL,
  type CallOutcome,
  type CallStatus,
  type EligibilityStatus,
} from '@voiceops/shared';
import { Badge } from '@/components/ui';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const STATUS_TONE: Record<CallStatus, Tone> = {
  QUEUED: 'neutral',
  RINGING: 'info',
  CONNECTED: 'info',
  COMPLETED: 'success',
  FAILED: 'danger',
  BUSY: 'warning',
  NO_ANSWER: 'warning',
  CANCELLED: 'neutral',
};

const OUTCOME_TONE: Record<CallOutcome, Tone> = {
  ATTEMPTED: 'neutral',
  CONNECTED: 'info',
  INTERESTED: 'success',
  NOT_INTERESTED: 'warning',
  CONVERTED: 'success',
  ENDED: 'neutral',
};

const ELIGIBILITY_TONE: Record<EligibilityStatus, Tone> = {
  ELIGIBLE: 'success',
  PENDING: 'warning',
  SUPPRESSED: 'danger',
};

/** The word is the status; the colour only reinforces it. */
export const CallStatusBadge = ({ status }: { status: CallStatus }) => (
  <Badge tone={STATUS_TONE[status]}>{CALL_STATUS_LABEL[status]}</Badge>
);

export const CallOutcomeBadge = ({ outcome }: { outcome: CallOutcome }) => (
  <Badge tone={OUTCOME_TONE[outcome]}>{CALL_OUTCOME_LABEL[outcome]}</Badge>
);

export const EligibilityBadge = ({ status }: { status: EligibilityStatus }) => (
  <Badge tone={ELIGIBILITY_TONE[status]}>{ELIGIBILITY_LABEL[status]}</Badge>
);
