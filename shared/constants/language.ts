/**
 * The language a template's calls are conducted in.
 *
 * HINGLISH is a first-class option rather than a variant of Hindi: Indian business
 * conversation routinely mixes Hindi grammar with English nouns ("aapka pricing
 * kya hai?"), and both the speech recogniser and the model need to be told to
 * expect that, or each turn gets forced into one language and mangled.
 */
export const AGENT_LANGUAGE = ['EN', 'HI', 'HINGLISH'] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGE)[number];

export const AGENT_LANGUAGE_LABEL: Record<AgentLanguage, string> = {
  EN: 'English (Indian)',
  HI: 'Hindi',
  HINGLISH: 'Hinglish (Hindi + English mix)',
};

/** Deepgram language codes. "multi" enables code-switching within a turn. */
export const DEEPGRAM_LANGUAGE: Record<AgentLanguage, string> = {
  EN: 'en-IN',
  HI: 'multi',
  HINGLISH: 'multi',
};

/**
 * OpenAI transcription language hint (ISO-639-1). Undefined means auto-detect,
 * which is what a code-switched conversation needs.
 */
export const OPENAI_STT_LANGUAGE: Record<AgentLanguage, string | undefined> = {
  EN: 'en',
  HI: 'hi',
  HINGLISH: undefined,
};
