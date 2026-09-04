import type { AgentLanguage } from './language.js';

/**
 * Which vendor provides the voice for a call. Chosen per template, so an English
 * campaign and a Hinglish one can use different stacks on the same platform.
 *
 * OPENAI   - broad and cheap, but trained mostly on Western speech. On Indian
 *            languages it transcribes into whatever script it guesses, which is how
 *            Hindi ends up written in Urdu, and its Hindi voice has a clear accent.
 * DEEPGRAM - the strongest English transcription of the three, and low latency.
 *            English only: every Aura voice is an -en model, so it cannot be paired
 *            with a Hindi or Hinglish template.
 * SARVAM   - built for Indian languages. Its speech model has a dedicated code-mix
 *            mode for Hindi/English switching, and its voices are native.
 *
 * Each provider supplies both ends of the call - listening and speaking. Mixing
 * vendors across those two was deliberately not offered: it doubles the number of
 * states to reason about, and the panel would then have to explain which half of
 * "OpenAI" was actually running.
 */
export const VOICE_PROVIDER = ['OPENAI', 'DEEPGRAM', 'SARVAM'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDER)[number];

export const VOICE_PROVIDER_LABEL: Record<VoiceProvider, string> = {
  OPENAI: 'OpenAI (general purpose)',
  DEEPGRAM: 'Deepgram (best English, English only)',
  SARVAM: 'Sarvam AI (Indian languages)',
};

/** Deepgram's Aura voices are all English; a Hindi template cannot use them. */
export const VOICE_PROVIDER_LANGUAGES: Record<VoiceProvider, AgentLanguage[]> = {
  OPENAI: ['EN', 'HI', 'HINGLISH'],
  DEEPGRAM: ['EN'],
  SARVAM: ['EN', 'HI', 'HINGLISH'],
};

/**
 * Which vendor runs the conversation itself. Separate from the voice, because the
 * trade-offs differ: the voice decides how the call sounds, the model decides what
 * it says and whether it uses tools correctly.
 *
 * Both options support tool calling, which is not optional here - the entire
 * anti-hallucination design rests on the model calling look_up_knowledge before
 * stating a fact. A model without reliable tool use cannot be offered.
 */
export const LLM_PROVIDER = ['OPENAI', 'SARVAM'] as const;
export type LlmProvider = (typeof LLM_PROVIDER)[number];

export const LLM_PROVIDER_LABEL: Record<LlmProvider, string> = {
  OPENAI: 'OpenAI · gpt-4o-mini',
  SARVAM: 'Sarvam AI · sarvam-105b-conversations',
};

/** Sarvam BCP-47 code per language. */
export const SARVAM_LANGUAGE: Record<AgentLanguage, string> = {
  EN: 'en-IN',
  HI: 'hi-IN',
  HINGLISH: 'hi-IN',
};

/**
 * Sarvam speech-to-text mode.
 *
 * "codemix" is the one that matters here: it expects a single utterance to switch
 * between Hindi and English and writes each part in its own script, instead of
 * forcing the whole turn into one language.
 */
export const SARVAM_STT_MODE: Record<AgentLanguage, 'transcribe' | 'codemix'> = {
  EN: 'transcribe',
  HI: 'transcribe',
  HINGLISH: 'codemix',
};

/** Voices offered in the template editor, per provider. */
export const SARVAM_VOICES = [
  { id: 'ritu', label: 'Ritu (female)' },
  { id: 'priya', label: 'Priya (female)' },
  { id: 'neha', label: 'Neha (female)' },
  { id: 'kavya', label: 'Kavya (female)' },
  { id: 'shreya', label: 'Shreya (female)' },
  { id: 'shubh', label: 'Shubh (male)' },
  { id: 'aditya', label: 'Aditya (male)' },
  { id: 'rahul', label: 'Rahul (male)' },
  { id: 'rohan', label: 'Rohan (male)' },
] as const;

export const OPENAI_VOICES = [
  { id: 'alloy', label: 'Alloy (neutral)' },
  { id: 'nova', label: 'Nova (female)' },
  { id: 'shimmer', label: 'Shimmer (female)' },
  { id: 'coral', label: 'Coral (female)' },
  { id: 'sage', label: 'Sage (neutral)' },
  { id: 'echo', label: 'Echo (male)' },
  { id: 'onyx', label: 'Onyx (male)' },
] as const;

/** For Deepgram the voice *is* the model name. */
export const DEEPGRAM_VOICES = [
  { id: 'aura-2-asteria-en', label: 'Asteria (female)' },
  { id: 'aura-2-luna-en', label: 'Luna (female)' },
  { id: 'aura-2-hera-en', label: 'Hera (female)' },
  { id: 'aura-2-cordelia-en', label: 'Cordelia (female)' },
  { id: 'aura-2-orion-en', label: 'Orion (male)' },
  { id: 'aura-2-arcas-en', label: 'Arcas (male)' },
  { id: 'aura-2-zeus-en', label: 'Zeus (male)' },
] as const;

export const VOICES_BY_PROVIDER: Record<
  VoiceProvider,
  ReadonlyArray<{ id: string; label: string }>
> = {
  OPENAI: OPENAI_VOICES,
  DEEPGRAM: DEEPGRAM_VOICES,
  SARVAM: SARVAM_VOICES,
};

/**
 * Ambience mixed under the call.
 *
 * A voice on a perfectly silent line sounds synthetic - people expect a human
 * calling from a workplace to have a workplace behind them. Light office noise
 * makes the call read as real; anything louder competes with the speech and makes
 * the customer ask "sorry, where are you calling from?".
 */
export const BACKGROUND_AUDIO = ['NONE', 'OFFICE'] as const;
export type BackgroundAudio = (typeof BACKGROUND_AUDIO)[number];

export const BACKGROUND_AUDIO_LABEL: Record<BackgroundAudio, string> = {
  NONE: 'Silent line',
  OFFICE: 'Office ambience',
};
