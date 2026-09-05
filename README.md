# VoiceOps — AI voice calling platform (MVP)

Outbound AI phone calls: the admin picks a template and a number, the backend opens
a LiveKit room and dials out over a SIP trunk, a Node.js voice agent holds the
conversation grounded in a knowledge base, and the call's status, transcript,
summary and business outcome land back in Postgres.

This repository implements the **MVP**: one real call, end to end, with the agent
answering only from approved knowledge. Campaigns are deliberately not built yet —
see [Scope](#scope).

```text
Admin UI  ->  Node API  ->  LiveKit  --SIP-->  Carrier  --PSTN-->  Customer phone
                  |             |
              Postgres      Voice agent (STT -> LLM -> TTS)
                                  |
                            Knowledge base (retrieval)
```

## Quick start

Requires Node 22+ and Docker.

```bash
git clone <this repo> && cd voice-calling-platform
npm install                 # also builds the shared package

cp .env.example .env        # then fill it in - see docs/SETUP-ACCOUNTS.md
npm run db:up               # Postgres + pgvector in Docker
npm run migrate
npm run seed                # admin user, demo knowledge base, demo template

npm run dev                 # backend :4000, agent worker, frontend :5173
```

Sign in at http://localhost:5173 with the credentials from `.env`
(`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, default `admin@example.com` /
`Admin@12345`).

Everything except calling works with no provider keys at all: you can browse, write
knowledge base documents and test retrieval (on keyword search) immediately. The
`/health` endpoint reports which capabilities are live:

```json
{ "status": "ok", "capabilities": { "livekit": false, "sip": false, "carrier": "plivo", "embeddings": false } }
```

**To make a real call**, you need the four provider accounts. The setup is written
out step by step, including the SIP trunk setup for Twilio, Plivo or Exotel, in
**[docs/SETUP-ACCOUNTS.md](docs/SETUP-ACCOUNTS.md)**.

## Documentation

| Document | What is in it |
| --- | --- |
| [docs/DEVELOPER-GUIDE-HINGLISH.md](docs/DEVELOPER-GUIDE-HINGLISH.md) | Onboarding walkthrough in Hinglish — how the whole thing works, with flow diagrams, for someone new to voice/AI |
| [docs/AGENT-INTERNALS-HINGLISH.md](docs/AGENT-INTERNALS-HINGLISH.md) | File-by-file map of every folder, plus a deep walkthrough of the agent: how the prompt is assembled, where each piece is stored, step-back prompting, and the TypeScript patterns used throughout |
| [docs/CALL-FLOW-HLD-LLD.md](docs/CALL-FLOW-HLD-LLD.md) | HLD + LLD for one outbound call: every step from the Call button to the saved transcript, each with the file, function and line that implements it |
| [docs/SETUP-ACCOUNTS.md](docs/SETUP-ACCOUNTS.md) | Where to create each account, what to configure, which `.env` key each value goes into |
| [docs/GUARDRAILS.md](docs/GUARDRAILS.md) | How the agent is kept from making things up: grounding, step-back prompting, query classification, outcome verification |
| [docs/INDIA-COMPLIANCE.md](docs/INDIA-COMPLIANCE.md) | Consent, DND, caller ID and recording disclosure — what the code enforces and what you must decide |

## Repository layout

Three applications plus a shared contract package. The frontend, backend and agent
run as separate processes and share nothing but types.

```text
frontend/   React + Vite + TypeScript + Tailwind, shadcn/ui-style components
backend/    Node.js + Express + TypeScript, layered domain modules
agent/      LiveKit voice agent (separate process from the backend)
shared/     TypeScript types and constants used by all three
docker/     nginx config for the production frontend image
docs/       Setup, guard rails, compliance
```

### Backend layering

Every domain module owns its full vertical slice:

```text
backend/src/modules/<module>/
  <module>.routes.ts       HTTP surface, middleware wiring
  <module>.controller.ts   request in, response out - no business logic
  <module>.service.ts      use cases and business rules
  <module>.repository.ts   SQL; nothing above this layer knows Postgres exists
  <module>.validation.ts   zod schemas; controllers only ever read req.validated
```

Modules: `auth`, `contacts`, `templates`, `knowledge-base`, `calls`, `webhooks`,
`internal` (the machine-to-machine surface the voice agent talks to).

Provider SDKs are confined to `backend/src/services/`:

```text
services/livekit/     rooms, agent dispatch, SIP dialling  (TelephonyProvider interface)
services/telephony/   PSTN carrier: webhook verification, call lookup (CarrierProvider)
services/recording/   LiveKit egress -> object storage
services/storage/     pre-signed playback URLs (SigV4, no AWS SDK)
services/ai/          OpenAI embeddings and JSON-mode completions
services/audit/       append-only action log
```

No carrier or LiveKit import appears in any controller, service or repository outside
those folders, so replacing a provider means writing one more implementation.

## How a call flows

1. `POST /calls` — validation, then guard rails: E.164 normalisation, destination
   allowlist, contact consent, required template variables, daily and concurrency
   limits.
2. A `calls` row is written as `QUEUED` **before** anything is dialled, so a provider
   failure is a visible record rather than a lost request.
3. LiveKit room created with `{ callId }` as metadata; the agent worker is dispatched
   to that room by name.
4. `SipClient.createSipParticipant` dials out through the configured SIP trunk. The call
   moves to `RINGING`.
5. The agent fetches its context from `GET /internal/calls/:id/context` — rendered
   scripts, objective, tone, knowledge base id. It holds no database or provider
   credentials of its own.
6. The customer answers; LiveKit's `participant_joined` webhook moves the call to
   `CONNECTED`. The agent speaks the opening line verbatim, then converses.
7. On hang-up the agent posts the transcript to `POST /internal/calls/:id/result`.
   The backend generates the summary and re-derives the business outcome from the
   transcript.
8. `participant_left` / `room_finished` closes the call as `COMPLETED`, `NO_ANSWER`
   or `FAILED`, with the duration.

**Call status and business outcome are separate columns.** `COMPLETED` +
`NOT_INTERESTED` is a normal, meaningful row.

### State transitions are one-way

`callsService.applyStatus()` is the single writer for call status, and a status may
only move forward. A replayed or late webhook cannot drag a `COMPLETED` call back to
`RINGING`. On top of that, `webhook_events` has a unique `(provider, event_key)`, so
a duplicate delivery is discarded before it is processed at all.

A reconciliation job runs every 5 minutes and closes out calls stuck in flight for
more than 30 minutes, so a dropped webhook cannot occupy the concurrency budget
forever.

## API

```text
POST   /auth/login              POST /auth/logout            GET  /auth/me
POST   /auth/forgot-password    POST /auth/reset-password    <- emailed via Resend

GET    /calls                   POST /calls                  GET  /calls/:id
POST   /calls/:id/end           GET  /calls/:id/recording    GET  /calls/stats

GET    /contacts                POST /contacts               POST /contacts/import
GET    /contacts/:id            PATCH /contacts/:id

GET    /templates               POST /templates              GET  /templates/:id
PATCH  /templates/:id           DELETE /templates/:id
POST   /templates/:id/duplicate POST /templates/:id/preview

GET    /knowledge-bases         POST /knowledge-bases        GET  /knowledge-bases/:id
POST   /knowledge-bases/:id/documents
PATCH  /knowledge-bases/:id/documents/:documentId
DELETE /knowledge-bases/:id/documents/:documentId
POST   /knowledge-bases/:id/search      <- retrieval preview, same pipeline as the agent
POST   /knowledge-bases/:id/reindex     GET /knowledge-bases/:id/health

POST   /webhooks/livekit        POST /webhooks/carrier       <- signature-verified

GET    /internal/calls/:id/context      <- agent only (x-agent-key)
POST   /internal/calls/:id/result
POST   /internal/calls/:id/events
POST   /internal/knowledge/retrieve
```

## Security

- Provider secrets are server-side only. The frontend bundle contains one variable,
  `VITE_API_BASE_URL`.
- Sessions are JWT, sent as an httpOnly cookie for the browser and as a bearer token
  for API clients. Login is rate limited separately from the rest of the API.
- No secret is ever committed. Everything lives in `.env`, including the carrier SIP
  trunk credentials: `npm run trunk:build` renders them into the gitignored
  `outbound-trunk.json` that the LiveKit CLI consumes, so the credentials themselves
  never reach a tracked file.
- Password reset emails one-time links via Resend. Only the SHA-256 hash of the token
  is stored, the link expires after 30 minutes, issuing a new one retires the old,
  and the token is consumed atomically. The response is identical for registered and
  unregistered addresses, so the endpoint cannot be used to enumerate accounts; it is
  rate limited on successes as well as failures.
- The agent authenticates with `AGENT_API_KEY` and can only reach `/internal/*`.
  That surface should not be exposed publicly in production.
- Webhooks are verified by signature (`WebhookReceiver` for LiveKit,
  the carrier's own scheme). LiveKit's raw body is preserved because the
  signature covers the exact bytes.
- Recording links are pre-signed and expire in 15 minutes; bucket URLs are never
  returned.
- Phone numbers are masked in logs, error messages and list views.

## Accessibility

The admin UI is an operations console, so it is built for keyboard use: semantic
HTML, a skip link, visible focus rings on everything focusable, real `<label>`s
wired to inputs, `aria-invalid` and `role="alert"` on field errors, `role="status"`
live regions for async results, and confirmation steps on destructive actions.

Status is always spelled out in words — `Interested`, `Not interested`,
`Converted` — with colour as a secondary signal only. Every screen has explicit
loading, empty, error and success states.

## Scope

**Built:** authentication, contacts with consent tracking and CSV import, call
templates with variables, knowledge base with chunking/embeddings/retrieval, one
end-to-end outbound call, recording, transcript, summary, outcome, and the admin UI
for all of it.

**Deliberately out of scope: campaigns.** No campaign CRUD, no calling queue, no
retry policy, no bulk dialling. The MVP places **one call at a time**, started by a
person, which is the scope the project owner set.

The ground is prepared for campaigns without any of it being built:
`callsService.createCall()` is the unit a future campaign worker would call in a
loop, and the concurrency and daily limits it already enforces are the same ones a
campaign would have to respect.

Two other honest gaps:

- **Recording requires object storage.** LiveKit Cloud uploads egress directly to
  S3-compatible storage, so with no bucket configured recording is skipped (loudly,
  in the logs and in the UI) rather than half-working.
- **Without `OPENAI_API_KEY`**, retrieval falls back to keyword search and no
  summary is generated. Both are reported by `/health` and on the knowledge base
  screen rather than failing silently.

## A note on the PRD

The PRD's frontend section contains a contradiction: it lists Vite in the stack, the
repository layout includes `vite.config.ts`, and the diagrams say "React + Vite" — but
one line says "Do not use React + Vite."

**Resolved: React + Vite**, confirmed by the project owner. The stray line is a typo
in the document.

shadcn/ui components were hand-written into `frontend/src/components/ui/index.tsx`
rather than generated through the shadcn CLI, so the repository builds offline with a
single `npm install`. They keep the same API (`className` passthrough, `cva`
variants) and `components.json` is present, so CLI-generated components can be added
alongside them at any time.

## Troubleshooting

**`ERR_DLOPEN_FAILED` from `onnxruntime-node` when starting the agent on Windows.**

The agent's voice-activity detection (Silero) and semantic turn detection are small
local audio models — not language models; the LLM, STT and TTS are all APIs. They run
through ONNX Runtime, which is compiled native code, and on Windows it needs the
Microsoft Visual C++ 2015-2022 redistributable. Windows reports a missing *dependency*
of a module as "The specified module could not be found", which reads as though the
`.node` file itself is absent. It is not.

**On Windows, run the agent in Docker.** The image is Linux and carries its own
runtime, so nothing has to be installed on the host:

```bash
npm run dev:local       # backend + frontend on the host
npm run agent:docker    # agent in Docker, in a second terminal
```

`docker-compose.agent.yml` runs the worker on its own and points `BACKEND_URL` at
`host.docker.internal:4000`, so it talks to the host-run backend rather than starting
a second one. `agent/src` and `shared` are still bind-mounted, so hot reload works as
it does natively; `node_modules` stays the image's own, so the host's Windows
onnxruntime binary never shadows the Linux one. Stop it with `npm run agent:docker:down`.

Use `npm run dev:local` rather than `npm run dev` in this split: `npm-run-all
--parallel` kills every sibling when one child exits, so the crashing native agent
would take the backend and frontend down with it.

(`docker compose -f docker-compose.dev.yml up` still runs all four services in
containers, if you would rather not run anything on the host.)

To run it natively on the host instead, install the redistributable and restart the
terminal:

```powershell
winget install Microsoft.VCRedist.2015+.x64
```

Backend and frontend are unaffected either way — the agent is the only process that
loads native code, so `npm run dev:backend` and `npm run dev:frontend` work on the
host regardless.

**The agent starts but never joins a call.** Check that `LIVEKIT_SIP_TRUNK_ID` is
set and that the worker logged `registered worker`. The backend dispatches by agent
name (`voiceops-agent`), so a worker started without `agentName` will never be
picked.

**Calls stay `RINGING` and never move.** The LiveKit webhook is not reaching the
backend. In local development the backend needs a public URL — see step 4 of
[docs/SETUP-ACCOUNTS.md](docs/SETUP-ACCOUNTS.md). Calls will still be closed out by
the reconciliation job after 30 minutes, but not in real time.

## Commands

```bash
npm run dev            # all three apps
npm run dev:local      # backend + frontend only (pair with npm run agent:docker)
npm run dev:backend    # backend only
npm run dev:agent      # agent worker only
npm run dev:frontend   # frontend only

npm run agent:docker       # agent in Docker - Windows hosts without the VC++ runtime
npm run agent:docker:down

npm run migrate        # apply SQL migrations
npm run seed           # admin user + demo knowledge base + demo template
npm run typecheck      # all workspaces
npm run build          # all workspaces

npm run trunk:build    # render outbound-trunk.json from .env for `lk sip outbound create`
npm run trunk:build -- --print   # same, printed with the password masked

npm run db:up          # Postgres (pgvector) in Docker
npm run db:down

docker compose -f docker-compose.dev.yml up   # everything in containers, hot reload
docker compose up                             # production images
```
