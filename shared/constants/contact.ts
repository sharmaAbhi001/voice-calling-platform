/**
 * India DND/consent rules mean "we have the number" is not "we may call it".
 * Only ELIGIBLE contacts can be dialled.
 */
export const ELIGIBILITY_STATUS = ['ELIGIBLE', 'PENDING', 'SUPPRESSED'] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUS)[number];

export const ELIGIBILITY_LABEL: Record<EligibilityStatus, string> = {
  ELIGIBLE: 'Eligible to call',
  PENDING: 'Consent pending',
  SUPPRESSED: 'Suppressed / opted out',
};
