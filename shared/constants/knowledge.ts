/** Categories drive the retrieval classifier, so keep them stable. */
export const KB_CATEGORY = [
  'COMPANY',
  'PRODUCT',
  'PRICING',
  'FEATURES',
  'FAQ',
  'POLICY',
  'SUPPORT',
  'OTHER',
] as const;
export type KbCategory = (typeof KB_CATEGORY)[number];

export const KB_CATEGORY_LABEL: Record<KbCategory, string> = {
  COMPANY: 'Company information',
  PRODUCT: 'Product information',
  PRICING: 'Pricing',
  FEATURES: 'Features',
  FAQ: 'FAQs',
  POLICY: 'Policies',
  SUPPORT: 'Support information',
  OTHER: 'Other',
};

export const DOCUMENT_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number];

/**
 * Below this cosine similarity a chunk is treated as "no answer found".
 * The agent must then say it does not have the information.
 */
export const KB_MIN_SIMILARITY = 0.35;
export const KB_TOP_K = 5;
