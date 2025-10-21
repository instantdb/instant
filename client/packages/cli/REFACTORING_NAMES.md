# CLI Refactoring: Function Naming

This document proposes cleaner, more concise names for the refactored CLI functions.

---

## Naming Principles

1. **Drop "WithErrorLogging" suffix** - Error logging is implied for user-facing functions
2. **Be explicit about behavior** - "validate" vs "getOrCreate" vs "prompt"
3. **Shorter is better** - Remove redundant words like "Instant" when context is clear
4. **Consistency** - Similar operations should have similar naming patterns

---

## Naming Patterns

### Pattern: "require*" = throws if missing
- `requirePackage()` - throws if no Instant SDK found
- `requireAuthToken()` - throws if not logged in
- `requireAppId()` - throws if no app linked

### Pattern: "getOrCreate*" / "getOrPrompt*" = prompts user
- `getOrCreateApp()` - prompts to create if needed
- `getOrInstallPackage()` - prompts to install if needed
- `getOrPromptLogin()` - prompts to login if needed

### Pattern: "get*" = simple retrieval
- `getPackageDir()` - finds package directory
- `getPackageJson()` - reads package.json
- `getAppIdFromOpts()` - checks opts for app ID
- `getAppIdFromEnv()` - checks env for app ID

### Pattern: "find*" = search, may return undefined
- `findPackage()` - searches package.json, returns name or undefined

### Pattern: "prompt*" = explicit prompting
- `promptForApp()` - shows UI to select/create app
- `promptForPackageAndAuth()` - orchestrates prompts for setup

### Pattern: "validate*" = checks without modification
- `validatePrereqs()` - verifies prerequisites exist

---

## Complete Mapping: Old → New

### Functions RENAMED (for `init` command - prompting behavior)

```
OLD NAME                                          NEW NAME
════════════════════════════════════════════════════════════════════════════
resolvePackageAndAuthInfoWithErrorLogging()   →   promptForPackageAndAuth()
getOrInstallInstantModuleWithErrorLogging()   →   getOrInstallPackage()
readAuthTokenOrLoginWithErrorLogging()        →   getOrPromptLogin()
detectOrCreateAppAndWriteToEnv()              →   getOrCreateApp()
detectOrCreateAppWithErrorLogging()           →   promptForApp()
packageDirectoryWithErrorLogging()            →   getPackageDir()
getPackageJSONWithErrorLogging()              →   getPackageJson()
getInstantModuleName()                        →   findPackage()
detectAppIdFromOptsWithErrorLogging()         →   getAppIdFromOpts()
detectAppIdFromEnvWithErrorLogging()          →   getAppIdFromEnv()
readInstantConfigFile()                       →   getConfigFile()
```

### Functions CREATED (for `push`/`pull` - validation only)

```
NEW FUNCTION
════════════════════════════════════════════════════════════════════════════
validatePrereqs()        - Validates package, auth without prompting
requirePackage()         - Gets package name or throws
requireAppId()           - Gets app ID or throws
requireAuthToken()       - Gets auth token or throws
```

---

## Summary Table

| Current Name | New Name | Used By |
|--------------|----------|---------|
| **Prompting (init)** |
| `resolvePackageAndAuthInfoWithErrorLogging()` | `promptForPackageAndAuth()` | init |
| `getOrInstallInstantModuleWithErrorLogging()` | `getOrInstallPackage()` | init |
| `readAuthTokenOrLoginWithErrorLogging()` | `getOrPromptLogin()` | init |
| `detectOrCreateAppAndWriteToEnv()` | `getOrCreateApp()` | init |
| `detectOrCreateAppWithErrorLogging()` | `promptForApp()` | init |
| **Validation (push/pull)** |
| *(new)* | `validatePrereqs()` | push, pull |
| *(new)* | `requirePackage()` | push, pull |
| *(new)* | `requireAppId()` | push, pull |
| *(new)* | `requireAuthToken()` | push, pull |
| **Shared Helpers** |
| `packageDirectoryWithErrorLogging()` | `getPackageDir()` | all |
| `getPackageJSONWithErrorLogging()` | `getPackageJson()` | all |
| `getInstantModuleName()` | `findPackage()` | all |
| `detectAppIdFromOptsWithErrorLogging()` | `getAppIdFromOpts()` | all |
| `detectAppIdFromEnvWithErrorLogging()` | `getAppIdFromEnv()` | all |
| `readInstantConfigFile()` | `getConfigFile()` | all |
