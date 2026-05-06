# getadb

This directory backs the **getadb.com** micro-site. It's hosted in the same
Next.js app as `instantdb.com`. The repo-root `middleware.ts` detects requests
to a `getadb.*` host and rewrites them under this folder.

## Local development

The dev server (`pnpm dev` here, or `make dev` from `client/`) runs on port
3000. Hit it via the special host alias:

- http://getadb.localhost:3000/ — human landing page (browser)
- `curl http://getadb.localhost:3000/` — markdown guide (curl/agents)
- `curl http://getadb.localhost:3000/guide` — markdown guide directly
- `curl "http://getadb.localhost:3000/provision/$(uuidgen)"` — provisions a fresh app

`getadb.localhost` resolves to 127.0.0.1 on macOS without any /etc/hosts edits.

## Routing

Browser hits to `getadb.com/` get the human page; everything else (curl,
agents) gets the markdown guide. Both are decided in `middleware.ts` from the
`Accept` header. Other paths just rewrite `getadb.com/<x>` → `/getadb/<x>`.
Unknown paths 404 via Next's normal route resolution.

## Files

- `page.tsx` — human landing page (browser-facing).
- `HumanForm.tsx` — client component (textarea + copy-for-agent button).
- `guide/route.ts` — markdown guide for agents.
- `guideMarkdown.ts` — shared guide content.
- `provision/[token]/route.ts` — provisions a fresh Instant app, returns env vars + rules.
- `meta/route.ts` — variant of provision tailored for no-build/UMD apps.
- `createGDBApp.ts` — server-side helper that calls the backend's app-creation endpoint.
- `generateMarkdown.ts` — assembles the rules markdown returned by `provision`.
