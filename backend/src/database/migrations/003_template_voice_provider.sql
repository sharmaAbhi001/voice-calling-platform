-- Which voice vendor a template's calls use. Existing templates keep OpenAI.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS voice_provider TEXT NOT NULL DEFAULT 'OPENAI'
  CHECK (voice_provider IN ('OPENAI', 'SARVAM'));
