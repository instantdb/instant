# Allowing User Extensions on System Namespaces

## Context
- Today the backend blocks any attribute changes whose forward namespace starts with `$`. This prevents customers from adding columns to namespaces such as `$users` or `$files`.
- The product team would like to let apps extend system namespaces while protecting critical system-managed fields (e.g. `$files.location-id`, `$users.email`).
- We need a plan that covers backend validation, schema push, permissions, and client expectations so the change is safe and testable end-to-end.

## Goals
- Allow app developers to define new attributes on existing system namespaces.
- Permit reads/writes of those new attributes through normal transactions and schema push.
- Preserve invariants for system-managed fields so built-in auth, storage, and OAuth flows keep working.
- Update client tooling so system namespaces can be inspected and edited without surprising restrictions.

## Non-goals
- Introducing entirely new system namespaces or letting customers create namespaces whose name starts with `$`.
- Making system-managed columns (IDs, auth tokens, storage identifiers, etc.) freely mutable.
- Redesigning the authentication or storage subsystems; the work should focus on enabling safe extensions.

## Existing Restrictions

### Backend
- Attribute creation/update rejects any namespace name that starts with `$` (`server/src/instant/db/model/attr.clj:262-277`).
- Transactions forbid non-admin callers from touching system namespaces other than `$files` (`server/src/instant/db/permissioned_transaction.clj:34-49`).
- Schema ops always block adding or editing attributes where the namespace starts with `$` (`server/src/instant/db/transaction.clj:220-227`).
- `$files` has extra runtime guards to restrict which attributes can be mutated (`server/src/instant/db/transaction.clj:368-385`) and higher-level helpers rely on passing `{:allow-$files-update? true}` (`server/src/instant/model/app_file.clj:16-90`).
- Schema planning strips system namespaces entirely before diffing (`server/src/instant/model/schema.clj:406-419`), so schema push cannot describe changes for `$users`, `$files`, etc.
- Permission rules refuse to compile user-authored policies for most system namespaces (`server/src/instant/model/rule.clj:224-289`).

### Client
- The dashboard hides every `catalog === 'system'` attribute except for `$users` and `$files`, and even there it removes several `$files` columns (`client/www/lib/schema.tsx:177-204`).
- Explorer treats system namespaces (other than `$users`/`$files`) as read-only (`client/www/components/dash/explorer/Explorer.tsx:669-743`).
- The namespace editor disallows renaming to a `$` prefix (`client/www/components/dash/explorer/EditNamespaceDialog.tsx:106-121`) and blocks attribute edits in system namespaces via `isSystemCatalogNs` gate (`client/www/components/dash/explorer/EditNamespaceDialog.tsx:1700-1744`).
- Platform helpers drop inferred types for any attr tagged `catalog === 'system'` (`client/packages/platform/src/util.ts:52-76`), which prevents scaffolding for those attributes.

## Repercussions & Required Invariants
- `$users`
  - System relies on `id`, `email`, `type`, `imageURL`, `linkedPrimaryUser`. Changing `email` or `id` can break login, magic codes, and OAuth lookups.
  - Recommendation: mark core attributes immutable to user transactions; only allow system-owned flows (running with explicit override) to touch them. Custom attributes can be added freely.
- `$files`
  - Storage lifecycle depends on `path`, `location-id`, `size`, `key-version`, and metadata columns. Mutating `location-id` or `key-version` would orphan S3 objects; changing `size` breaks checks.
  - Keep the existing guard for system columns, but make it explicit list-based so we can still allow custom attributes.
- OAuth / auth support namespaces (`$magicCodes`, `$userRefreshTokens`, `$oauth*`)
  - These namespaces carry security-sensitive secrets and relationships. We should continue to treat all built-in columns as immutable and probably make the entire namespace read-only for user transactions. Allowing extra attributes is safe if we block writes to the core IDs and code hashes.
- Future system namespaces
  - Need a central registry that classifies each built-in attribute as `:immutable`, `:managed`, or `:extensible` so we can reason about them consistently.

## Design Options
1. **Guarded Extensions (recommended)**
   - Allow user-defined attributes in system namespaces.
   - Maintain a whitelist of system-owned attribute IDs that stay read-only or require elevated opts.
   - Transactions check the attribute ID to decide whether the operation is allowed.
   - Schema tooling recognises system namespaces but only emits diffs for user-owned attributes.
   - Pros: balances flexibility with safety, minimal behaviour change for system flows.
   - Cons: requires new metadata to classify attributes, more validation code.

2. **Full Unlock with Warnings**
   - Remove all guards and rely on documentation/tests to keep invariants.
   - Pros: minimal code change.
   - Cons: high risk—apps can break authentication/storage with a single update.

3. **Opt-in Configuration**
   - Require per-app flag to enable system namespace edits; still enforce immutable lists internally.
   - Pros: reduces surprise.
   - Cons: extra surface area (flags, migrations) without much benefit once we trust the guards.

We should pursue **Option 1**.

## Recommended Architecture
- Tag each built-in system attribute in `instant.system-catalog` with metadata describing whether it is immutable (`:locked`), writable by system flows only (`:managed`), or fully writable (`:open`). Store that mapping in a new helper (e.g. `system_catalog/attr-policy`).
- Update validation layers to consult this policy:
  - Attribute creation (`validate-reserved-names!`) allows any namespace listed in `system_catalog/all-etypes` but still blocks unknown `$foo`.
  - Attribute updates (`prevent-system-catalog-attrs-updates!`) only reject those targeting attributes whose IDs are in the locked set; user-created attributes (catalog `:user`) pass through.
  - Transaction validation (`permissioned_transaction/validate-reserved-names!`) allows operations on system namespaces when the target attribute is classified as `:open` or is user-defined, otherwise throws unless an override flag (e.g. `:allow-system-managed-write?`) is set. `$files` reuse the same policy so we can consolidate logic instead of hardcoding label checks.
  - `$files` guard becomes policy-driven: `location-id`, `size`, `key-version`, etc. stay `:locked`; `path` can be `:managed` (allow updates when override present).
- Schema planner keeps system namespaces but filters out locked attributes when comparing desired vs current. Only user-defined attrs (catalog `:user`) and any `:open` system attrs will produce ops.
- Rule validation:
  - Allow rules for `$users` and `$files` to remain as-is (only view). For other system namespaces, allow view rules so new attributes can be exposed while still blocking writes.
  - Alternatively, we can maintain current restriction but document that custom system namespace attributes are only usable through server-admin queries until rule support expands.
- Ensure `system_catalog_ops` still runs with overriding options for managed attributes so existing storage/auth flows remain unaffected.

## Implementation Outline

### Backend
1. **System metadata**
   - Add a map in `server/src/instant/system_catalog.clj` that classifies each built-in attribute (`attr-id` or `[etype label]`) as `:locked`, `:managed`, or `:open`.
   - Expose helpers such as `system-catalog/known-system-etype?`, `system-catalog/attr-policy`, and `system-catalog/locked-attr-id?`.

2. **Attribute validation**
   - Update `validate-reserved-names!` in `server/src/instant/db/model/attr.clj:262-277` to:
     - Allow namespaces that start with `$` when `(system-catalog/known-system-etype? fwd-etype)` is true.
     - Continue rejecting unknown `$` namespaces.
   - Guard renames in `server/src/instant/db/model/attr.clj` so renaming a locked attr or changing its namespace is rejected (likely inside `update-multi!` before the SQL executes).

3. **Transaction guards**
   - Replace the string-prefix check in `server/src/instant/db/permissioned_transaction.clj:34-49` with policy-driven logic:
     - Allow operations on user-defined attrs (catalog `:user`) regardless of namespace name.
     - For system attr IDs, reject when policy is `:locked` unless context opts include a matching override.
   - Refactor `$files` guard (`server/src/instant/db/transaction.clj:368-385`) to consult the same policy map. Keep stricter rules (e.g. only allow `path` updates) by marking those attrs `:managed` and checking opts.
   - Extend `system_catalog_ops/update-op` call sites to pass the appropriate override flag for managed attributes.

4. **Schema planning**
   - Revise `remove-system-namespaces` in `server/src/instant/model/schema.clj:406-419` so it keeps system namespaces but strips locked attributes.
   - When computing ops, ensure `:add-attr` / `:update-attr` produced for system namespaces set `{:allow-reserved-names? true}` automatically.

5. **Rule validation**
   - Adjust `system-attribute-validation-errors` in `server/src/instant/model/rule.clj:239-246` to allow view rules for all system namespaces and consider allowing create/update/delete for new user-owned attributes only if we can reliably distinguish them. Initially we can keep create/update/delete blocked while documenting the behaviour.

6. **Testing**
   - Add transaction tests that:
     - Create custom attributes on `$users` and `$files` and verify CRUD succeeds.
     - Attempt to mutate locked columns (`$files.location-id`, `$users.email`) and assert validation errors.
   - Extend schema push tests to cover adding/removing custom system-namespace attrs.
   - Ensure existing storage/auth tests still pass (especially `server/test/instant/model/app_file.clj` and auth flows).

### Client / Tooling
1. Update `client/www/lib/schema.tsx:177-204` and the backend mirror (`server/src/instant/db/model/attr.clj:977-986`) to only hide attributes that the new policy marks as locked. Custom system namespace columns should now surface in Explorer.
2. Relax Explorer’s read-only gate (`client/www/components/dash/explorer/Explorer.tsx:669-743`) to allow editing when the attribute is not locked. This will require passing metadata about attribute policy into the UI (e.g. through the schema fetch).
3. In `EditNamespaceDialog`, permit edits for custom system attributes while keeping rename/delete disabled for locked ones (`client/www/components/dash/explorer/EditNamespaceDialog.tsx`).
4. Update platform utilities (`client/packages/platform/src/util.ts:52-76`) so generated schema types include custom system attributes (skip only locked ones).
5. Adjust docs/examples to mention that system namespaces can be extended but core fields remain immutable.

### Observability & Rollout
- Add logging around rejected operations on locked system attrs so we can spot accidental misuse.
- Consider feature flagging the behaviour per environment during rollout (e.g. env variable that toggles new validation paths) to allow gradual adoption.

### Open Questions
- Do we need a migration to retroactively tag any existing custom system attributes? (We currently block them, so likely none exist, but we should confirm.)
- Should we permit rule create/update/delete once we can guarantee custom attributes are safe? If not, document the limitation clearly.
- Do we need additional UI affordances (badges) to communicate that certain system fields are locked?

## Next Steps
1. Prototype the policy map and validation changes in a branch; run the existing `$files` and auth test suites.
2. Update schema planning and add end-to-end schema push tests.
3. Modify the dashboard and platform packages, then verify Explorer can add/remove a custom `$users.favoriteColor` attribute.
4. Coordinate docs and communication before enabling the change in production.
