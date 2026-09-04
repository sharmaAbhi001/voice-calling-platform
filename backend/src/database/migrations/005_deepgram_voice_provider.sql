-- Deepgram becomes a selectable speech provider alongside OpenAI and Sarvam.
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_voice_provider_check;
ALTER TABLE templates
  ADD CONSTRAINT templates_voice_provider_check
  CHECK (voice_provider IN ('OPENAI', 'DEEPGRAM', 'SARVAM'));
