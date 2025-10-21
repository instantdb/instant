# CLI Refactoring Plan (Context Composition)

## Current Problem

`handlePush` and `handlePull` both rely on `resolvePackageAndAuthInfoWithErrorLogging()` and `detectOrCreateAppAndWriteToEnv()`. These helpers:
- Prompt to install an Instant SDK (`getOrInstallInstantModuleWithErrorLogging`)
- Log the user in automatically if no token is stored (`readAuthTokenOrLoginWithErrorLogging`)
- Prompt to create or import apps, and scaffold `.env` files (`detectOrCreateAppWithErrorLogging`, `handleEnvFile`)

`init` needs that behaviour, but `push`/`pull` should fail fast if prerequisites are missing instead of silently prompting and mutating the project.

---

## ASCII Tree Diagrams

```
================================================================================
                           CURRENT SHARED FLOW (AS-IS)
================================================================================

command (init/push/pull)
└─ handlePull/handlePush(opts)
   ├─ resolvePackageAndAuthInfoWithErrorLogging(opts)
   │  ├─ packageDirectoryWithErrorLogging()
   │  ├─ getOrInstallInstantModuleWithErrorLogging()   ⚠ installs SDK
   │  └─ readAuthTokenOrLoginWithErrorLogging()        ⚠ prompts login
   ├─ detectOrCreateAppAndWriteToEnv(...)
   │  ├─ detectOrCreateAppWithErrorLogging()           ⚠ creates/imports app
   │  └─ handleEnvFile(...)                            ⚠ writes .env
   └─ push()/pull()
      ├─ pushSchema()/pullSchema()
      └─ pushPerms()/pullPerms()

Result: every command can install packages, log in, create apps, and rewrite `.env`.
```

```
================================================================================
                           PROPOSED FLOW (CONTEXT COMPOSITION)
================================================================================

init command
└─ createInitContext(opts)
   ├─ bootstrapProject(opts)
   │  ├─ packageDirectoryWithErrorLogging()
   │  └─ getOrInstallInstantModuleWithErrorLogging()   (allowed to prompt)
   ├─ resolveAuth()
   ├─ createOrImportApp(opts)
   │  ├─ detectAppIdFromOptsWithErrorLogging()
   │  ├─ detectAppIdFromEnvWithErrorLogging()
   │  └─ promptImportAppOrCreateApp()/promptCreateApp()
   ├─ writeEnvIfNeeded()
   └─ pull('all', appId, projectCtx)

push / pull / push-schema / pull-schema
└─ createRuntimeContext(opts)
   ├─ loadProjectContext()
   │  ├─ packageDirectoryWithErrorLogging()
   │  └─ assertInstantSdkPresent()                     ❌ throws if missing
   ├─ resolveAuth()
   ├─ requireLinkedApp(opts)
   │  ├─ detectAppIdFromOptsWithErrorLogging()
   │  └─ detectAppIdFromEnvWithErrorLogging()
   │     ❌ throws: "Run `instant-cli init`" if none
   └─ runPushOrPull(bag, ctx)
      ├─ pushSchema()/pullSchema()
      └─ pushPerms()/pullPerms()

Result: init remains interactive; runtime commands fail fast with guidance.
```

---

## Helper Breakdown

### Existing Helpers Reused
- `packageDirectoryWithErrorLogging`
- `getOrInstallInstantModuleWithErrorLogging` (init only)
- `readConfigAuthTokenWithErrorLogging`
- `readAuthTokenOrLoginWithErrorLogging`
- `detectAppIdFromOptsWithErrorLogging`
- `detectAppIdFromEnvWithErrorLogging`
- `handleEnvFile`, `promptImportAppOrCreateApp`, `promptCreateApp`

### New / Refactored Helpers
```
loadProjectContext(opts)
├─ packageDirectoryWithErrorLogging()
└─ assertInstantSdkPresent(pkgDir)
   ├─ getPackageJson()
   └─ getInstantModuleName()
   ❌ error: "Install Instant SDK via `instant-cli init`" if missing

bootstrapProject(opts)
├─ packageDirectoryWithErrorLogging()
└─ getOrInstallInstantModuleWithErrorLogging(pkgDir, opts)
   (prompts, installs, shows spinners)

resolveAuth()
└─ readAuthTokenOrLoginWithErrorLogging()

createOrImportApp(opts)
├─ detectAppIdFromOptsWithErrorLogging(opts)
├─ detectAppIdFromEnvWithErrorLogging()
└─ promptImportAppOrCreateApp()/promptCreateApp()

requireLinkedApp(opts)
├─ detectAppIdFromOptsWithErrorLogging(opts)
├─ detectAppIdFromEnvWithErrorLogging()
└─ MissingAppError if neither found

createInitContext(opts)
├─ bootstrapProject(opts)
├─ resolveAuth()
├─ createOrImportApp(opts)
└─ writeEnvIfNeeded(pkgCtx, {appId, appToken})

createRuntimeContext(opts)
├─ loadProjectContext(opts)
├─ resolveAuth()
└─ requireLinkedApp(opts)
```

---

## Command Mapping

| Command                            | Context Builder           | Notes |
|------------------------------------|---------------------------|-------|
| `init`                             | `createInitContext`       | Keeps prompts, installs, env scaffolding |
| `pull`, `pull-schema`              | `createRuntimeContext`    | Throws if SDK/app missing |
| `push`, `push-schema`, `push-perms`| `createRuntimeContext`    | Throws if SDK/app missing |

Downstream helpers (`push`, `pull`, `pushSchema`, `pullSchema`, `pushPerms`, `pullPerms`) receive `{pkgDir, instantModuleName, authToken, appId}` so they no longer re-run discovery.

---

## Error Handling

Runtime commands surface clear errors:
- Missing SDK → "Couldn't find an Instant SDK in package.json. Run `instant-cli init`."
- Not logged in → re-use `readConfigAuthTokenWithErrorLogging` message
- No app linked → "No app ID found. Run `instant-cli init` or set *_INSTANT_APP_ID."

`init` continues to offer install/login/app creation prompts.

---

## Test Adjustments

- CLI tests: add coverage for `push`/`pull` when SDK is absent, when no app is linked, and the happy path once prerequisites exist.
- Ensure existing `init` tests still pass; update fixtures to reflect context changes if needed.

---

## Files to Modify

- `src/index.js`
  - Introduce `loadProjectContext`, `assertInstantSdkPresent`, `bootstrapProject`, `createInitContext`, `createRuntimeContext`, `requireLinkedApp`, `createOrImportApp`, `resolveAuth` helpers.
  - Update command handlers to use the new contexts and simplify downstream functions.
  - Remove now-unused calls to `detectOrCreateAppAndWriteToEnv` from runtime commands.
- `__tests__/` (relevant CLI suites)
  - Add tests for new failure cases and verify `init` retains interactive flow.
- `README.md` / CLI docs (if behaviour expectations need updating).

---

## Benefits

1. **True separation of concerns**: only `init` mutates project state.
2. **Composable contexts**: runtime commands share strict prerequisites without branching logic.
3. **Cleaner handlers**: `push`/`pull` receive fully prepared contexts, reducing duplication.
4. **Predictable UX**: users see actionable errors instead of surprise prompts.
5. **Future-proofing**: easier to plug in additional commands by reusing context builders.

