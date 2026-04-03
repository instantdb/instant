---
title: Migrating from Supabase
description: A prompt for your AI coding assistant to migrate a Supabase project to InstantDB.
---

Want to give Instant a try but already have a Supabase project? No problem!
Copy this prompt into your AI coding assistant to migrate a Supabase project to InstantDB.

```markdown {% showCopy=true %}
# Supabase to InstantDB Migration

Migrate a Supabase project to InstantDB in a new directory.

**Primary reference**: Fetch `https://www.instantdb.com/llms.txt` for the full
doc index. Use it to find relevant docs for each step below.

## Inputs

Ask the user for source and target directories.

## Process

1. **Setup**: Run `npx instant-cli info` to check login. If not logged in,
   direct user to https://instantdb.com then `npx instant-cli login`.
   Create app: `npx instant-cli init-without-files --title "<Name>"`

2. **Copy project**: Copy source to target (excluding `node_modules`, `.next`).
   Remove `@supabase/*` deps, add the appropriate `@instantdb/*` SDK.
   Add app ID and admin token to env. Install deps.

3. **Schema**: Create `instant.schema.ts` — profiles merge into `$users`,
   foreign keys become links, join tables become many-to-many links.
   Push: `npx instant-cli push schema --yes`

4. **Permissions**: Create `instant.perms.ts` — translate RLS policies to CEL.
   `auth.uid()` → `auth.id`, ownership checks → `data.ref('link.id')`.
   Push: `npx instant-cli push perms --yes`

5. **Rewrite app**: Server components become client components with `db.useQuery()`.
   Supabase inserts/updates/deletes become `db.transact()`. Auth becomes magic
   codes or OAuth. Remove middleware, proxy, session management. Remove all
   `router.refresh()` — queries are live.

6. **Migrate data**: Ask the user if they have data to migrate. If yes, ask for
   their Supabase service role key. Write and run export + import scripts.
   If app uses Supabase Storage, migrate files too.

7. **Verify**: Build must pass. Test all pages and auth flows.

8. **Agent rules**: Ask the user if they want to install Instant agent rules:
   `npx skills add instantdb/skills --yes`

## Rules

- Ask one question at a time — don't batch user prompts
- Fetch docs just-in-time from `llms.txt` index, not all at once
- `$files` permissions default to all false — must enable explicitly
```
