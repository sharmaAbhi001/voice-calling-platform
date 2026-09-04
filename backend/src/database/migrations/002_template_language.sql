-- Language a template's calls are conducted in. Existing templates keep English.
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'EN'
  CHECK (language IN ('EN', 'HI', 'HINGLISH'));
