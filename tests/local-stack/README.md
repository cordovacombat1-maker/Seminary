# Local test stack (developers only)

Runs the app locally against Netlify's own local database (started by `netlify dev`) and a fake
AI service, so everything can be tested end-to-end without deploying. Not used in production.

- `mock-ai.mjs` — a fake Anthropic Messages API (streaming, tool use and JSON output), standing in for Netlify AI Gateway.
- `run.sh` — starts the fake AI and writes `.env.local-stack` (fake AI URL, download cache for the loader).
- `e2e.mjs` — drives the Netlify functions through sign-up → loading texts → tutor lesson → quiz → paper → drill → certificate.

```
bash tests/local-stack/run.sh
set -a; . tests/local-stack/.env.local-stack; set +a
netlify dev --offline            # in one terminal
netlify database reset && netlify database migrations apply   # fresh local database
node tests/local-stack/e2e.mjs
```
