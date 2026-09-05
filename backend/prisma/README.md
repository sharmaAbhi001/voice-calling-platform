# Prisma

The backend talks to Postgres through Prisma Client. `schema.prisma` is the model
definition; `migrations/` is the forward-only history that ships with the image
and is applied on every deploy.

## Everyday commands

```bash
npm run migrate -w backend          # apply pending migrations (what deploy runs)
npm run seed -w backend             # admin user, demo knowledge base, templates
npm run db:generate -w backend      # regenerate the client after a schema edit
npm run db:studio -w backend        # browse the data
npm run migrate:dev -w backend -- --name add_something   # author a new migration
```

`npm install` regenerates the client automatically (the backend's `postinstall`),
so a fresh clone needs no extra step.

## What the database owns, and Prisma does not

Some of this schema cannot be expressed in `schema.prisma`. It lives in the SQL
migrations and must be written by hand when it changes:

| Thing | Where |
|---|---|
| `CHECK` constraints on status/role/category columns | `migrations/0_init` |
| `embedding vector(1536)` reads and writes | raw SQL in `knowledge-base.repository.ts` |
| ivfflat index on `embedding` | `migrations/0_init` |
| gin full-text index on `knowledge_chunks.content` | `migrations/0_init` |
| `contacts (lower(name))` expression index | `migrations/0_init` |
| partial index on unused password reset tokens | `migrations/0_init` |
| `set_updated_at()` triggers | `migrations/0_init` |

The ivfflat index is a special case: it is declared in `schema.prisma` by name
(`@@index([embedding], map: "knowledge_chunks_embedding_idx")`) even though Prisma
models it as an ordinary index. That declaration is load-bearing - without it every
`migrate dev` generates a `DROP INDEX knowledge_chunks_embedding_idx` for an index
it does not know it has, and retrieval silently falls back to a sequential scan.
Do not remove it, and never accept a `migrate dev` prompt to reset the database.

The enum-like columns (`status`, `outcome`, `role`, `category`, ...) are `String`
in the schema on purpose. The union types in `@voiceops/shared` are the source of
truth for the application; the `CHECK` constraints are the source of truth for the
database. Making them native Postgres enums would need a migration on every new
value and would break the existing rows.

## Baselining an existing database

`0_init` is the concatenation of the six SQL migrations this project used before
Prisma, so a database created by the old runner already has exactly this schema.
`src/database/migrate.ts` detects that shape - application tables present, no
`_prisma_migrations` table - and marks `0_init` as applied before deploying the
rest. Nothing is dropped or recreated, and the step is a no-op on every later run.
