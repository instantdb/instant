# CLI Refactoring Summary

## What Was Changed

Successfully refactored the CLI to separate initialization (prompting) behavior from push/pull (validation-only) behavior.

---

## Key Changes

### 1. **Renamed Helper Functions** (cleaner, shorter names)

| Old Name | New Name |
|----------|----------|
| `packageDirectoryWithErrorLogging()` | `getPackageDir()` |
| `getPackageJSONWithErrorLogging()` | `getPackageJson()` |
| `getInstantModuleName()` | `findPackage()` |
| `detectAppIdFromOptsWithErrorLogging()` | `getAppIdFromOpts()` |
| `detectAppIdFromEnvWithErrorLogging()` | `getAppIdFromEnv()` |
| `readInstantConfigFile()` | `getConfigFile()` |

### 2. **Renamed Prompting Functions** (for `init` command)

| Old Name | New Name |
|----------|----------|
| `resolvePackageAndAuthInfoWithErrorLogging()` | `promptForPackageAndAuth()` |
| `getOrInstallInstantModuleWithErrorLogging()` | `getOrInstallPackage()` |
| `readAuthTokenOrLoginWithErrorLogging()` | `getOrPromptLogin()` |
| `detectOrCreateAppWithErrorLogging()` | `promptForApp()` |
| `detectOrCreateAppAndWriteToEnv()` | `getOrCreateApp()` |

### 3. **Added NEW Validation Functions** (for `push`/`pull` commands)

These functions validate prerequisites WITHOUT any prompting or installation:

- **`requirePackage(pkgDir)`** - Checks if Instant SDK exists, throws helpful error if missing
- **`requireAuthToken()`** - Checks if logged in, throws helpful error if not
- **`validatePrereqs(opts)`** - Orchestrates validation of package and auth
- **`requireAppId(opts)`** - Gets app ID from opts/env, throws helpful error if missing

### 4. **New Command Handler**

Created **`handleInit(opts)`** - Uses prompting functions (install packages, create apps, etc.)

### 5. **Refactored Command Handlers**

**`handlePush(bag, opts)` - Now uses validation-only functions:**
```javascript
async function handlePush(bag, opts) {
  const pkgAndAuthInfo = await validatePrereqs(opts);  // ✅ No prompts
  if (!pkgAndAuthInfo) return process.exit(1);

  const appId = await requireAppId(opts);              // ✅ No prompts
  if (!appId) return process.exit(1);

  await push(bag, appId, opts);
}
```

**`handlePull(bag, opts)` - Now uses validation-only functions:**
```javascript
async function handlePull(bag, opts) {
  const pkgAndAuthInfo = await validatePrereqs(opts);  // ✅ No prompts
  if (!pkgAndAuthInfo) return process.exit(1);

  const appId = await requireAppId(opts);              // ✅ No prompts
  if (!appId) return process.exit(1);

  await pull(bag, appId, pkgAndAuthInfo);
}
```

### 6. **Removed Redundant Validation**

- Removed `validateAppLinked()` calls from `push` and `pull` commands
- The new `requireAppId()` function handles this better with clearer error messages

---

## Command Behavior Changes

### `instant-cli init`
✅ **No behavior change** - Still prompts to install packages, create apps, create .env files

Uses: `handleInit()` → `promptForPackageAndAuth()` → `getOrCreateApp()`

### `instant-cli push`
❌ **Changed** - Now **only validates**, never prompts or installs

- ❌ Won't prompt to install packages → Shows error: "Run `instant-cli init`"
- ❌ Won't prompt to login → Shows error: "Run `instant-cli login`"
- ❌ Won't prompt to create apps → Shows error: "Run `instant-cli init`"
- ❌ Won't create .env files → Shows error: "Set *_INSTANT_APP_ID in .env"

Uses: `handlePush()` → `validatePrereqs()` → `requireAppId()`

### `instant-cli pull`
❌ **Changed** - Now **only validates**, never prompts or installs

- ❌ Won't prompt to install packages → Shows error: "Run `instant-cli init`"
- ❌ Won't prompt to login → Shows error: "Run `instant-cli login`"
- ❌ Won't prompt to create apps → Shows error: "Run `instant-cli init`"
- ❌ Won't create .env files → Shows error: "Set *_INSTANT_APP_ID in .env"

Uses: `handlePull()` → `validatePrereqs()` → `requireAppId()`

---

## Error Messages

New, clearer error messages for `push`/`pull`:

```
❌ Couldn't find an Instant SDK in your package.json.
   Run `instant-cli init` to set up your project.

❌ Not logged in.
   Run `instant-cli login` to authenticate.

❌ No app ID found.
   Run `instant-cli init` to link an app, or set `*_INSTANT_APP_ID` in your .env file.
```

---

## Files Modified

- `src/index.js` - All changes in one file

---

## Build Status

✅ **Build successful** - `npm run build` passes with no errors

---

## Migration Notes

### For Users

If you were relying on `instant-cli push` or `instant-cli pull` to automatically:
- Install packages
- Prompt you to login
- Create apps
- Create .env files

You'll need to run `instant-cli init` first to set up your project.

### For Developers

If you're working on the CLI:
- Prompting functions use the pattern: `getOr*`, `promptFor*`
- Validation functions use the pattern: `require*`, `validate*`
- Helper functions use simple: `get*`, `find*`
- See `REFACTORING_NAMES.md` for complete naming guide

---

## Benefits

1. ✅ **Clear separation** - `init` handles setup, `push`/`pull` handle operations
2. ✅ **Predictable** - `push`/`pull` never modify your project unexpectedly
3. ✅ **Better errors** - Users know exactly what's missing and how to fix it
4. ✅ **Cleaner code** - 50% shorter function names, clearer intent
5. ✅ **Backwards compatible** - `init` keeps all functionality

---

## Testing Checklist

- [ ] `instant-cli init` - Should prompt for package, login, app, create .env
- [ ] `instant-cli push` (no setup) - Should show helpful errors
- [ ] `instant-cli pull` (no setup) - Should show helpful errors
- [ ] `instant-cli push` (after init) - Should work without prompts
- [ ] `instant-cli pull` (after init) - Should work without prompts
- [ ] Build passes - ✅ Confirmed
