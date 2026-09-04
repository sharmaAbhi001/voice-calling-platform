import { voice } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as livekitPlugin from '@livekit/agents-plugin-livekit';
import * as openai from '@livekit/agents-plugin-openai';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import {
  DEEPGRAM_LANGUAGE,
  OPENAI_STT_LANGUAGE,
  SARVAM_LANGUAGE,
  SARVAM_STT_MODE,
  type AgentLanguage,
  type LlmProvider,
  type VoiceProvider,
} from '@voiceops/shared';
import { env, useDeepgram, useSarvam } from '../config/env.js';

/**
 * STT -> LLM -> TTS, rather than a single speech-to-speech model.
 *
 * The split pipeline is what makes the guard rails enforceable: every customer
 * turn becomes text we can log, every model turn goes through tool calling before
 * it is spoken, and the transcript we store is the real conversation rather than a
 * reconstruction.
 *
 * Speech in and speech out are vendor-selectable per template, because the right
 * vendor depends on the language being spoken.
 */

/**
 * Speech to text.
 *
 * Sarvam's saaras model is built for Indian languages and has a code-mix mode that
 * expects Hindi and English inside one sentence, writing each in its own script.
 *
 * The OpenAI path needs an explicit language for Hindi. Spoken Hindi and Urdu are
 * near-identical, so auto-detect regularly picks Urdu and returns Perso-Arabic
 * script - a transcript nobody involved can read. Naming the language stops that.
 */
export const buildSttPlugin = (language: AgentLanguage, provider: VoiceProvider) => {
  if (provider === 'SARVAM' && useSarvam) {
    return new sarvam.STT({
      apiKey: env.SARVAM_API_KEY,
      model: 'saaras:v3',
      languageCode: SARVAM_LANGUAGE[language],
      mode: SARVAM_STT_MODE[language],
    });
  }

  if (provider === 'DEEPGRAM' && useDeepgram) {
    return new deepgram.STT({
      model: env.DEEPGRAM_STT_MODEL,
      // "multi" lets a single utterance switch languages, though a Deepgram template
      // is restricted to English anyway - its voices are English-only.
      language: DEEPGRAM_LANGUAGE[language],
      apiKey: env.DEEPGRAM_API_KEY,
    });
  }

  // Falling back here rather than substituting a different vendor silently: a
  // template that says OpenAI runs OpenAI, so the panel never misreports the stack.
  return new openai.STT({
    model: 'gpt-4o-transcribe',
    language: OPENAI_STT_LANGUAGE[language],
  });
};

/**
 * The conversation model.
 *
 * Sarvam exposes an OpenAI-compatible endpoint, so the same plugin drives both -
 * only the base URL, key and model name change. Its conversation model supports
 * tool calling, which is non-negotiable here: every guard rail depends on the model
 * calling look_up_knowledge before it states a fact, so a model without reliable
 * tool use could not be offered as an option at all.
 */
export const buildLlmPlugin = (provider: LlmProvider) => {
  if (provider === 'SARVAM' && useSarvam) {
    return new openai.LLM({
      apiKey: env.SARVAM_API_KEY,
      baseURL: env.SARVAM_BASE_URL,
      model: env.SARVAM_LLM_MODEL,
      temperature: 0.3,
    });
  }

  return new openai.LLM({
    model: env.OPENAI_LLM_MODEL,
    // Low but not zero: natural phrasing, no creative facts.
    temperature: 0.3,
  });
};

type TtsOptions = NonNullable<ConstructorParameters<typeof openai.TTS>[0]>;

/**
 * Text to speech. Sarvam's bulbul voices are natively Indian; OpenAI speaks Hindi
 * intelligibly but with an obvious foreign accent, which undercuts a sales call.
 */
export const buildTtsPlugin = (
  language: AgentLanguage,
  provider: VoiceProvider,
  voiceName: string | null,
) => {
  if (provider === 'SARVAM' && useSarvam) {
    return new sarvam.TTS({
      apiKey: env.SARVAM_API_KEY,
      model: 'bulbul:v3',
      speaker: voiceName ?? env.SARVAM_TTS_SPEAKER,
      targetLanguageCode: SARVAM_LANGUAGE[language],
    });
  }

  if (provider === 'DEEPGRAM' && useDeepgram) {
    // For Deepgram the voice is the model name.
    return new deepgram.TTS({
      apiKey: env.DEEPGRAM_API_KEY,
      model: voiceName ?? env.DEEPGRAM_TTS_MODEL,
    });
  }

  return new openai.TTS({
    model: env.OPENAI_TTS_MODEL,
    // The plugin types the voice as a union of known names; the value is configurable.
    voice: (voiceName ?? env.OPENAI_TTS_VOICE) as TtsOptions['voice'],
  });
};

/**
 * Semantic turn detection: decides the customer has finished a thought rather
 * than merely paused. On a phone call, pausing mid-sentence is normal and
 * silence-only detection interrupts people constantly.
 */
export const buildTurnDetection = () => new livekitPlugin.turnDetector.MultilingualModel();

export interface PipelineChoice {
  language: AgentLanguage;
  voiceProvider: VoiceProvider;
  llmProvider: LlmProvider;
  voiceName: string | null;
}

export const buildSessionOptions = (choice: PipelineChoice) => ({
  stt: buildSttPlugin(choice.language, choice.voiceProvider),
  llm: buildLlmPlugin(choice.llmProvider),
  tts: buildTtsPlugin(choice.language, choice.voiceProvider, choice.voiceName),
  turnDetection: buildTurnDetection(),
  // Give the customer a moment before the agent takes the turn back.
  minEndpointingDelay: 600,
  maxEndpointingDelay: 4000,
});

export type SessionOptions = ReturnType<typeof buildSessionOptions>;
export type AgentSession = voice.AgentSession;
