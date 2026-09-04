-- Per-template plugin selection: which model runs the conversation, which voice
-- speaks it, and what the customer hears behind it.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS llm_provider TEXT NOT NULL DEFAULT 'OPENAI'
  CHECK (llm_provider IN ('OPENAI', 'SARVAM'));

-- NULL means "use the provider's default voice", so changing the default in
-- configuration does not silently rewrite every template.
ALTER TABLE templates ADD COLUMN IF NOT EXISTS voice_name TEXT;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS background_audio TEXT NOT NULL DEFAULT 'NONE'
  CHECK (background_audio IN ('NONE', 'OFFICE'));
