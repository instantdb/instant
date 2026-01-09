# Platform schemaPush overwrite + renames design

## Goal
- Extend `PlatformApi.schemaPush` and `PlatformApi.planSchemaPush` so callers can
  apply full schema changes (deletes + renames) the same way the CLI does.
- Keep the current additive behavior as the default.

## Background / current behavior
- Platform SDK `schemaPush` + `planSchemaPush` call
  `/superadmin/apps/:app_id/schema/push/{plan,apply}`.
  - Server-side `schema-model/plan!` only adds/updates; it does **not**
    generate delete or rename steps.
- CLI uses `diffSchemas` + `convertTxSteps` and then calls
  `/dash/apps/:app_id/schema/steps/apply`, which runs
  `schema-model/apply-plan-with-deletes!` and supports deletes + renames.
- CLI also prompts/accepts renames and uses current attrs to avoid
  system-catalog changes.

## Proposed API
```ts
api.schemaPush(appId, {
  schema,
  overwrite: true,
  renames: {
    "posts.name": "posts.title",
  },
});

api.planSchemaPush(appId, {
  schema,
  overwrite: true,
  renames: {
    "posts.name": "posts.title",
  },
});
```

Notes:
- `overwrite: true` switches from additive to full diff (adds/updates/deletes).
- `renames` is a map of **old -> new** fully-qualified names (`namespace.attr`).
- If `renames` is provided without `overwrite`, treat it as overwrite mode.

## Platform SDK changes

### Types + API surface
- Update `InstantAPISchemaPushBody` in `client/packages/platform/src/api.ts`:
  - Add `overwrite?: boolean`.
  - Add `renames?: Record<string, string>`.
- Update `PlatformApi.planSchemaPush` and `PlatformApi.schemaPush` docstrings to
  mention `overwrite` and `renames`.

### New helper logic (client-side diff path)
When `overwrite` is true or `renames` is present:

1. **Fetch current schema + attrs**
   - `GET /dash/apps/:app_id/schema/pull` (same as CLI; no endpoint changes).
   - Use `apiSchemaToInstantSchemaDef` to get `currentSchema`.
   - Keep `attrs` for `convertTxSteps`.

2. **Build `systemCatalogIdentNames`**
   - Port `collectSystemCatalogIdentNames` from
     `client/packages/cli/src/index.js` into platform (new util).
   - Needed for `validateSchema` and to avoid deleting system attrs in `diffSchemas`.

3. **Validate schema (match CLI)**
   - Call `validateSchema(newSchema, systemCatalogIdentNames)` before diffing.
   - Surface `SchemaValidationError` early (same behavior as CLI).

4. **Resolve renames**
   - Build a rename resolver from `renames` map (old -> new).
   - Convert to the `RenameResolveFn` format expected by `diffSchemas`
     (it matches created items, so map new -> old internally).
   - Support link renames using the same string format as CLI:
     `posts.author<->users.posts` (if needed).

5. **Generate steps**
   - `diffSchemas(currentSchema, newSchema, renameResolver, systemCatalogIdentNames)`
   - `convertTxSteps(diffResult, currentAttrs)` to get `PlanStep[]`.

6. **Plan response**
   - `translatePlanSteps(steps)` for the public response.
   - Return `{ newSchema, currentSchema, steps }`.

7. **Apply response**
   - POST to `/dash/apps/:app_id/schema/steps/apply` with `{ steps }`.
   - Reuse existing progress + indexing job tracking (response includes
     `indexing-jobs` and `steps` with `job-id`).
   - Fetch the final schema using `GET /superadmin/apps/:app_id/schema`
     (or reuse `/dash` pull if we want attrs).

### Default (additive) path
When `overwrite` is not set and `renames` is absent, keep the existing behavior:
- `planSchemaPush` -> `/superadmin/apps/:app_id/schema/push/plan`
- `schemaPush` -> `/superadmin/apps/:app_id/schema/push/apply`

## Docs updates

### Platform API docs
- `client/www/pages/docs/platform-api.md`
  - Update the `schemaPush` example to show `overwrite` + `renames`.
  - Add a short note that `overwrite` can delete entities/attrs and should be
    paired with `planSchemaPush` first.

### Platform SDK README
- `client/packages/platform/README.md`
  - Extend `planSchemaPush` and `schemaPush` sections with `overwrite` and
    `renames` usage.
  - Mention the renames map format and that deletes are enabled only when
    `overwrite: true`.

## Clojure / server changes
- **No changes required**; reuse existing `/dash/apps/:app_id/schema/pull`
  and `/dash/apps/:app_id/schema/steps/apply` endpoints.
- Optional future work: add `overwrite` + `renames` support to
  `/superadmin/.../schema/push/*` so the server can generate steps directly.

## Test plan (SDK)
- Add unit tests in `client/packages/platform/__tests__` for:
  - Renames map handling (old -> new) for attrs and links.
  - `overwrite` mode generating delete steps via `diffSchemas`.
  - `planSchemaPush` output using local diff path (mocked fetch).
