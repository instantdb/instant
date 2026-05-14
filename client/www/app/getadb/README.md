# getadb

This directory backs the **[getadb.com](https://getadb.com)**. It's hosted in the same
Next.js app as `instantdb.com`. Our `middleware.ts` detects requests
to a `getadb.*` host and rewrites them under this folder.

## Local development

You can use `getadb.localhost:3000` to load the getadb micro-site.

- http://getadb.localhost:3000/ — human landing page (browser)
- http://getadb.localhost:3000/figma — Figma Make landing page (browser)
- `curl http://getadb.localhost:3000/` — markdown guide (curl/agents)
- `curl http://getadb.localhost:3000/make` — provisions credentials with
  Figma Make notes and the full Instant docs
