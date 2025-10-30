# Field-Level View Rule Implementation Plan

This plan captures every change needed to support `{ view: { $default, field } }` style rules, from backend evaluation through client + dashboard tooling. Follow the sections in order—each bullet is intended to be copied into your TODO list and checked off as you go.

---

## 1. Backend – Rule Compilation (`server/src/instant/model/rule.clj`)

- [ ] **Treat `view` allow blocks as either string/boolean or field map.**
  - When `get-program!*` walks the resolution paths, allow nodes like `["users" "allow" "view" "email"]`.
  - Skip non-scalar values when you hit them via the legacy paths so we still get the base entity program.
- [ ] **Add helper for field overrides.**
  - Implement something like:
    ```clojure
    (defn view-field-rule-paths [etype field]
      [[etype "allow" "view" field]
       [etype "allow" "view" "$default"]
       [etype "allow" "$default"]
       ["$default" "allow" "view" "$default"]
       ["$default" "allow" "$default"]
       [etype "fallback" "view"]])
    ```
  - Expose `get-field-program!` (parallel to `get-program!`) that compiles CEL with proper binds and caches using `[rules paths]` as the key.
- [ ] **Validation updates.**
  - When `rule-validation-errors` encounters a map under `allow.view`, validate `$default` plus every other key as independent CEL expressions.
  - Error paths should look like `["users" :allow "view" "email"]`.
  - Preserve existing bind validation.
- [ ] **Cache safety.**
  - Ensure the cache key for field programs includes the whole path so there is no cache collision with the base `view` program.

---

## 2. Backend – Apply Field Overrides in Query Pipeline

### 2.1 Collect Field Programs (`server/src/instant/db/instaql.clj`)
- [ ] Extend `extract-permission-helpers` to include, per etype, the set of field names that have overrides.
- [ ] Derive a map `{field-name -> attr-id}` once per etype (use `attr-model/seek-by-fwd-ident-name` in a memoized helper).

### 2.2 Evaluate Programs (`get-etype+eid-check-result!`)
- [ ] Build the existing entity program entry (unchanged) and add additional `:programs` entries of the form:
  ```clojure
  {:key [:field etype eid field]
   :program (rule-model/get-field-program! rules etype field)
   :bindings {:rule-params rule-params
              :data data}}
  ```
- [ ] After `cel/eval-programs!`, assemble a result map shaped like:
  ```clojure
  {[etype eid]
   {:result entity-result
    :program entity-program
    :field-results {"email" true/false
                    "ssn"   true/false}}}
  ```
- [ ] Ensure we treat missing field programs as `true` so legacy rules keep working.

### 2.3 Filter Query Output (`permissioned-node`)
- [ ] When computing `cleaned-join-rows`, drop triples whose attr id corresponds to a field override that evaluated to `false`.
- [ ] Do the same for `page-info-rows` so pagination metadata remains accurate.
- [ ] Preserve child nodes only if the parent kept at least one row.

### 2.4 Debug Endpoint (`permissioned-query-check`)
- [ ] Extend each `check-result` with a `:field-checks` map mirroring `field-results`.
- [ ] Include the code snippet for each field program in the response (use `select-keys` on the compiled program).

### 2.5 Rule-Wheres Guardrails
- [ ] When building rule wheres, only attempt the translation for scalar view expressions. Skip field overrides and log (or attach metadata) so we don’t attempt to auto-generate where clauses for them yet.

---

## 3. Backend Tests

### 3.1 Rule Compiler Tests (`server/test/instant/model/rule_test.clj`)
- [ ] Add `deftest view-field-map` that:
  - Confirms `get-program!` returns the base program (`$default`) and `get-field-program!` returns the field-specific program.
  - Asserts validation errors point to `["etype" :allow "view" "field"]` when you pass an invalid CEL string.

### 3.2 InstaQL Tests (`server/test/instant/db/instaql_test.clj`)
- [ ] Add fixture rules:
  ```clojure
  (rule-model/put!
    (aurora/conn-pool :write)
    {:app-id app-id
     :code {:users {:allow {:view {"$default" "true"
                                   "email"   "auth.id == data.id"
                                   "ssn"     "false"}}}}})
  ```
- [ ] Write the core permission test:
  ```clojure
  (testing "field-level view overrides redact attributes"
    (let [ctx (assoc (make-ctx app-id {:rw :read})
                     :current-user {:id (resolvers/->uuid r "eid-alex")})
          other-ctx (assoc ctx :current-user {:id (resolvers/->uuid r "eid-bob")})]
      (is (= [{:id (str (resolvers/->uuid r "eid-alex"))
               :fullName "Alex"
               :email "alex@instant.dev"}]
             (:users (pretty-perm-q ctx {:users {:$ {:fields ["fullName" "email" "ssn"]}}}))))
      (is (= [{:id (str (resolvers/->uuid r "eid-alex"))
               :fullName "Alex"}]
             (:users (pretty-perm-q other-ctx {:users {:$ {:fields ["fullName" "email" "ssn"]}}})))))))
  ```
- [ ] Add a `permissioned-query-check` assertion verifying the `:field-checks` map shows `{"email" true, "ssn" false}` depending on the user context.
- [ ] Cover the field override + `:fields` query combination to ensure we don’t fetch extra columns.

---

## 4. Client SDK & Tooling

### 4.1 Core Types (`client/packages/core/src/rulesTypes.ts`)
- [ ] Introduce:
  ```ts
  type InstantViewRule =
    | string | null | undefined
    | ({ $default?: string | null } & Record<string, string | null>);
  ```
- [ ] Update `InstantRulesAllowBlock` to use `view?: InstantViewRule;`.
- [ ] Mirror the same type for `$default.allow.view` and `attrs.allow.view`.

### 4.2 Platform SDK (`client/packages/platform/src/perms.ts`)
- [ ] Adjust the `JSON.stringify` schema template so the emitted example shows the object form.
- [ ] Update any inferred TS types (run the build/generate command if required).

### 4.3 MCP Tool (`client/packages/mcp/src/index.ts`)
- [ ] Replace the `view: z.string().nullable().optional()` with a Zod union:
  ```ts
  const viewRule = z.union([
    z.string().nullable(),
    z.object({ $default: z.string().nullable().optional() }).catchall(
      z.string().nullable()
    ),
  ]);
  ```
- [ ] Ensure both `$default` and arbitrary field keys are accepted. Mirror for `$default.allow.view` and `attrs`.

### 4.4 Docs & Templates
- [ ] Update inline comments/examples in `packages/platform/src/perms.ts` and generator templates to show the new syntax:
  ```ts
  view: { $default: 'true', email: 'auth.id == data.id' },
  ```
- [ ] Search the repo for sample rule snippets and refresh them (e.g., onboarding docs, sandbox examples).

---

## 5. Dashboard (`client/www/components/dash/Perms.tsx`)

- [ ] Expand the JSON schema: change `allow.view` to an `anyOf` that accepts a string or an object with string values (pattern for arbitrary fields plus `$default`).
- [ ] Update the instructions text to mention field overrides explicitly.
- [ ] Confirm the JSON editor displays validation errors for bad field expressions at `allow.view.someField`.
- [ ] Test saving the sample rules and ensure the POST body matches the backend expectation.

---

## 6. Verification & Rollout

- [ ] **Server tests:** `cd server && clojure -X:test`.
- [ ] **Focused tests:** run the new instaql tests if the suite is long (`clojure -X:test :only instant.db.instaql-test/fields-with-rules`).
- [ ] **Client tests:** `pnpm --filter @instantdb/core test`, `pnpm --filter @instantdb/platform test`, and rebuild the MCP package if it has type checks (`pnpm --filter @instantdb/mcp build`).
- [ ] **Manual QA:** via the dashboard sandbox:
  1. Paste the new rule object.
  2. Run a query as yourself and as another user to confirm field redaction.
  3. Export rules to ensure the JSON retains object structure.
- [ ] **Docs (optional but recommended):** Update `/docs/permissions` with an example illustrating `$default` plus field overrides.
- [ ] Keep an eye on Honeycomb for `instaql/permissioned-node` spans to ensure evaluate counts do not spike unexpectedly.

---

## 7. Appendix

### Sample Rule
```json
{
  "users": {
    "allow": {
      "view": {
        "$default": "true",
        "email": "auth.id == data.id",
        "ssn": "false"
      },
      "update": "auth.id == data.id"
    }
  }
}
```

### Sample Debug Output Expectation
```clojure
{:entity "$users"
 :id "eid-alex"
 :check true
 :field-checks {"email" true
                "ssn" false}}
```

Copy this plan into your tracking doc and work through the checkboxes—in sequence it will take you from parser to UI without surprises. Good luck!

