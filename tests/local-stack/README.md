# Local test stack (developers only)

A throw-away imitation of Supabase + Anthropic + Voyage used to test the app end-to-end
without any real accounts or keys. It is **not** used in production.

- `setup-db.sh` — creates a local Postgres database with pgvector, a stand-in `auth` schema, and the real migration.
- `gateway.mjs` — serves `/rest/v1` (proxied to PostgREST) and a minimal `/auth/v1` (sign-up, password login, get user).
- `mock-ai.mjs` — fake Anthropic Messages API (streaming + tool use + JSON output) and fake Voyage embeddings.
- `e2e.test.mjs` — drives the Netlify functions through sign-up → tutor lesson → quiz → paper → drill → certificate.

`run.sh` starts everything with a random JWT secret generated at start-up.
