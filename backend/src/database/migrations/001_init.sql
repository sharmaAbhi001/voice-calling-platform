-- Core schema for the MVP: users, contacts, knowledge base, templates, calls.
-- Campaigns are intentionally out of scope for this phase.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'OPERATOR')),
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL UNIQUE,
  company            TEXT,
  email              TEXT,
  tags               TEXT[] NOT NULL DEFAULT '{}',
  eligibility_status TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (eligibility_status IN ('ELIGIBLE', 'PENDING', 'SUPPRESSED')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_name_idx ON contacts (lower(name));

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  category          TEXT NOT NULL DEFAULT 'OTHER'
                    CHECK (category IN ('COMPANY','PRODUCT','PRICING','FEATURES','FAQ','POLICY','SUPPORT','OTHER')),
  content           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'PUBLISHED'
                    CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  version           INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_documents_kb_idx ON knowledge_documents (knowledge_base_id, status);

-- Retrieval unit. Only chunks of PUBLISHED documents are ever searched.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  category          TEXT NOT NULL,
  chunk_index       INTEGER NOT NULL,
  content           TEXT NOT NULL,
  embedding         vector(1536),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_kb_idx ON knowledge_chunks (knowledge_base_id, category);
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Lexical fallback so retrieval still works before embeddings are configured.
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
  ON knowledge_chunks USING gin (to_tsvector('english', content));

CREATE TABLE IF NOT EXISTS templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL UNIQUE,
  objective               TEXT NOT NULL,
  opening_script          TEXT NOT NULL,
  system_prompt           TEXT NOT NULL,
  closing_script          TEXT NOT NULL,
  tone                    TEXT NOT NULL DEFAULT 'Professional and friendly',
  qualification_questions TEXT[] NOT NULL DEFAULT '{}',
  variable_schema         JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_base_id       UUID REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  template_id           UUID REFERENCES templates(id) ON DELETE SET NULL,
  knowledge_base_id     UUID REFERENCES knowledge_bases(id) ON DELETE SET NULL,
  created_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  phone                 TEXT NOT NULL,
  provider_call_id      TEXT,
  room_name             TEXT UNIQUE,
  sip_participant_id    TEXT,
  direction             TEXT NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND','INBOUND')),
  status                TEXT NOT NULL DEFAULT 'QUEUED'
                        CHECK (status IN ('QUEUED','RINGING','CONNECTED','COMPLETED','FAILED','BUSY','NO_ANSWER','CANCELLED')),
  outcome               TEXT NOT NULL DEFAULT 'ATTEMPTED'
                        CHECK (outcome IN ('ATTEMPTED','CONNECTED','INTERESTED','NOT_INTERESTED','CONVERTED','ENDED')),
  failure_reason        TEXT,
  variables             JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at            TIMESTAMPTZ,
  answered_at           TIMESTAMPTZ,
  ended_at              TIMESTAMPTZ,
  duration_seconds      INTEGER,
  recording_url         TEXT,
  transcript            JSONB,
  summary               TEXT,
  extracted_requirement TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls (created_at DESC);
CREATE INDEX IF NOT EXISTS calls_status_idx ON calls (status);
CREATE INDEX IF NOT EXISTS calls_outcome_idx ON calls (outcome);
CREATE INDEX IF NOT EXISTS calls_phone_idx ON calls (phone);

-- Idempotency ledger for provider webhooks: a replayed event is a no-op.
CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  event_key    TEXT NOT NULL,
  event_type   TEXT,
  payload      JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_key)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'USER',
  action     TEXT NOT NULL,
  subject    TEXT,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);

-- Keep updated_at honest without remembering it in every repository method.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DO $migrate$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','contacts','knowledge_bases','knowledge_documents','templates','calls']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t);
  END LOOP;
END $migrate$;
