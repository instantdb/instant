# Field-Level Permissions Implementation Plan

## Overview

This document outlines the implementation plan for adding field-level permissions to Instant. The approach allows extending the `view`, `update`, and other action rules to specify per-field permissions using a `$default` fallback pattern.

### Syntax

```javascript
{
  $users: {
    allow: {
      view: {
        $default: "true",
        email: "isCurrentUser"
      },
      update: {
        $default: "isCurrentUser",
        email: "isCurrentUser"
      }
    },
    bind: [
      "isCurrentUser", "auth.id == data.id"
    ]
  }
}
```

### Evaluation Strategy

**Two-pass approach:**
1. **First pass**: Evaluate the `$default` rule for the action
2. **Second pass**: For each field accessed, evaluate the field-specific rule

**Key principle**: Field-level rules run AFTER the default rule passes. If `$default` fails, the entire object access is denied without checking field rules.

---

## 1. Backend Changes

### 1.1 Data Structure Changes

#### Current Structure (rule.clj)
```clojure
{
  "documents" {
    "bind" ["canView" "auth.id == data.owner"]
    "allow" {
      "view"   "canView"
      "update" "canView"
    }
  }
}
```

#### New Structure (with field-level rules)
```clojure
{
  "documents" {
    "bind" ["canView" "auth.id == data.owner"]
    "allow" {
      "view" {
        "$default" "true"
        "secretNotes" "canView"
      }
      "update" {
        "$default" "canView"
        "secretNotes" "false"  ; Read-only field
      }
    }
  }
}
```

**Backward compatibility**: String values for actions remain valid and are equivalent to `{"$default": "string-value"}`.

---

### 1.2 Rule Validation Changes (`rule.clj`)

#### Update `patch-code` function
```clojure
(defn patch-code
  "Don't break if the perm check is a simple boolean or string"
  [code]
  (cond
    (boolean? code) (str code)
    (string? code) code
    (map? code) code  ; NEW: Allow maps for field-level rules
    :else code))
```

#### Update `extract` function
```clojure
(defn extract [rule etype action]
  (when-let [expr (patch-code (get-in rule [etype "allow" action]))]
    (cond
      ;; New: Field-level rules (map)
      (map? expr)
      {:type :field-level
       :default (when-let [default (get expr "$default")]
                  (with-binds rule etype action default))
       :fields (into {}
                     (for [[field-name field-expr] (dissoc expr "$default")]
                       [field-name (with-binds rule etype action field-expr)]))}

      ;; Legacy: String rules (backward compatible)
      (string? expr)
      {:type :string
       :expr (with-binds rule etype action expr)})))
```

#### Update `get-program!*` to handle field-level rules
```clojure
(defn get-program!* [[{:keys [code]} paths]]
  (let [[etype _ action & _] (first paths)]
    (loop [paths paths]
      (when-some [[_ allow _ & _ :as path] (first paths)]
        (or
         (case allow
           "allow"
           (when-some [raw-expr (get-in code path)]
             (try
               (let [extracted (extract code etype action)
                     compiler (cel/action->compiler action)]
                 (case (:type extracted)
                   ;; NEW: Field-level rules
                   :field-level
                   (let [default-program (when-let [default-expr (:default extracted)]
                                           (let [ast (cel/->ast compiler default-expr)]
                                             {:code default-expr
                                              :cel-ast ast
                                              :cel-program (cel/->program ast)
                                              :ref-uses (cel/collect-ref-uses ast)
                                              :where-clauses-program (when (= action "view")
                                                                       (cel/where-clauses-program default-expr))}))
                         field-programs (into {}
                                              (for [[field-name field-expr] (:fields extracted)]
                                                [field-name
                                                 (let [ast (cel/->ast compiler field-expr)]
                                                   {:code field-expr
                                                    :cel-ast ast
                                                    :cel-program (cel/->program ast)
                                                    :ref-uses (cel/collect-ref-uses ast)})]))]
                     {:etype etype
                      :action action
                      :type :field-level
                      :default-program default-program
                      :field-programs field-programs
                      :display-code raw-expr})

                   ;; Legacy: String rules
                   :string
                   (let [code (:expr extracted)
                         ast (cel/->ast compiler code)]
                     {:etype etype
                      :action action
                      :type :string
                      :code code
                      :display-code raw-expr
                      :cel-ast ast
                      :cel-program (cel/->program ast)
                      :ref-uses (cel/collect-ref-uses ast)
                      :where-clauses-program (when (= action "view")
                                               (cel/where-clauses-program code))})))
               (catch CelValidationException e
                 (ex/throw-validation-err!
                  :permission
                  (first paths)
                  (->> (.getErrors e)
                       (map (fn [^CelIssue cel-issue]
                              {:message (.getMessage cel-issue)})))))))

           "fallback"
           (fallback-program etype action))
         (recur (next paths)))))))
```

#### Add validation for field-level rules
```clojure
(defn field-level-validation-errors [rules]
  (reduce-kv
   (fn [errors etype {:strs [allow]}]
     (reduce-kv
      (fn [errors action rule-value]
        (if (map? rule-value)
          ;; Validate each field expression
          (reduce-kv
           (fn [errors field-name field-expr]
             (try
               (when field-expr
                 (let [code (with-binds rules etype action field-expr)
                       compiler (cel/action->compiler action)
                       ast (cel/->ast compiler code)
                       _program (cel/->program ast)
                       validation-errors (cel/validation-errors compiler ast)]
                   (if (seq validation-errors)
                     (into errors
                           (map (fn [^CelIssue cel-issue]
                                  {:message (.getMessage cel-issue)
                                   :in [etype :allow action field-name]})
                                validation-errors))
                     errors)))
               (catch CelValidationException e
                 (into errors
                       (map (fn [^CelIssue cel-issue]
                              {:message (.getMessage cel-issue)
                               :in [etype :allow action field-name]})
                            (.getErrors e))))))
           errors
           rule-value)
          errors))
      errors
      allow))
   []
   rules))

(defn validation-errors [rules]
  (concat (bind-validation-errors rules)
          (rule-validation-errors rules)
          (field-level-validation-errors rules)))  ; NEW
```

---

### 1.3 Permission Checking Changes (`permissioned_transaction.clj`)

#### Update `pre-checks` to handle field-level permissions

For **update** checks, we need to:
1. Check `$default` rule first
2. For each changed attribute, check the field-specific rule

```clojure
(defn field-level-check
  "Given a field-level program and a set of fields to check,
   return checks for each field"
  [ctx program etype eid bindings fields]
  (let [{:keys [default-program field-programs]} program
        default-check (when default-program
                        {:scope :object
                         :action (:action program)
                         :etype etype
                         :eid eid
                         :program default-program
                         :bindings bindings})]
    (concat
     (when default-check [default-check])
     (for [field-name fields
           :let [field-program (get field-programs (name field-name))]
           :when field-program]
       {:scope :attr
        :action (:action program)
        :etype etype
        :eid eid
        :attr field-name
        :program field-program
        :bindings bindings}))))

(defn pre-checks
  [{:keys [attrs rules] :as ctx} admin? rule-params entity-lookups tx-steps]
  ;; ... existing code ...

  ;; For update checks:
  (when (and (= :update action)
             (not admin?)
             (not= etype "attrs")
             (not= catalog :system))
    (let [program (rule-model/get-program! rules etype "update")
          data (or (get entity-lookups [etype eid])
                   (entity-model/get-by-id app-id etype eid))
          new-data (get-in updated-entity-lookups [[etype eid] :data])
          bindings {:data data
                    :new-data new-data
                    :rule-params rule-params}]
      (case (:type program)
        ;; NEW: Field-level checks
        :field-level
        (let [changed-attrs (keys (d/diff-state-maps data new-data))]
          (field-level-check ctx program etype eid bindings changed-attrs))

        ;; Legacy: Single check for entire object
        :string
        [{:scope :object
          :action :update
          :etype etype
          :eid eid
          :program program
          :bindings bindings}])))

  ;; ... rest of pre-checks ...
  )
```

#### Handle field-level checks in check evaluation
```clojure
(defn eval-checks! [ctx checks]
  (let [evaluated (cel/eval-programs! ctx
                                      (map :program checks))]
    (map (fn [check result]
           (assoc check
                  :result (:result result)
                  :check-result (:result result)
                  :check-pass? (true? (:result result))))
         checks
         evaluated)))

(defn filter-failed-checks [checks]
  (remove :check-pass? checks))

(defn throw-on-failed-checks! [checks]
  (when-let [failed (seq (filter-failed-checks checks))]
    (ex/throw-validation-err!
     :transaction
     nil
     (map (fn [check]
            {:message (case (:scope check)
                        :object (format "Permission denied for %s on %s"
                                        (:action check)
                                        (:etype check))
                        :attr (format "Permission denied for %s on %s.%s"
                                      (:action check)
                                      (:etype check)
                                      (:attr check)))
             :hint (:program check)})
          failed))))
```

---

### 1.4 Query Changes (`instaql.clj`)

For **view** rules, we need a two-pass approach:

1. **WHERE clause optimization**: Use `$default` rule for SQL WHERE clauses
2. **Post-filtering**: Apply field-level rules after fetching data

#### Update `get-rule-wheres` to use $default
```clojure
(defn get-rule-wheres [ctx rule-params rules query]
  (let [etypes (extract-query-etypes query)]
    (into {}
          (for [etype etypes
                :let [program (rule-model/get-program! rules etype "view")]
                :when program]
            (case (:type program)
              ;; NEW: Use $default for WHERE clause
              :field-level
              (if-let [default-program (:default-program program)]
                (let [where-clauses (eval-where-clauses
                                     ctx
                                     (:where-clauses-program default-program)
                                     rule-params)]
                  [etype {:where-clauses where-clauses
                          :short-circuit? (= where-clauses false)
                          :has-field-rules? true}])  ; Flag for post-filtering
                ;; No default means allow all (will be filtered by field rules)
                [etype {:where-clauses nil
                        :short-circuit? false
                        :has-field-rules? true}])

              ;; Legacy: Use rule as-is
              :string
              (let [where-clauses (eval-where-clauses
                                   ctx
                                   (:where-clauses-program program)
                                   rule-params)]
                [etype {:where-clauses where-clauses
                        :short-circuit? (= where-clauses false)}]))))))
```

#### Update post-filtering to check field-level rules
```clojure
(defn apply-field-level-filtering
  "For each entity, check which fields the user can view"
  [ctx rule-params program entities]
  (let [{:keys [field-programs]} program
        auth (get-auth ctx)]
    (for [entity entities
          :let [data (:data entity)
                accessible-fields (into #{}
                                        (for [[field-name field-program] field-programs
                                              :let [bindings {:data data
                                                              :auth auth
                                                              :rule-params rule-params}
                                                    result (cel/eval-program! ctx field-program bindings)]
                                              :when (true? (:result result))]
                                          field-name))
                ;; Filter entity data to only include accessible fields
                filtered-data (select-keys data
                                           (concat ["id"] ; Always include id
                                                   accessible-fields))]]
      (assoc entity :data filtered-data))))

(defn permissioned-node [ctx rule-params perm-helpers rules node]
  ;; ... existing code for pre-filtering with WHERE clauses ...

  ;; NEW: Apply field-level filtering after fetching
  (let [etypes-with-field-rules (into #{}
                                      (for [[etype info] rule-wheres
                                            :when (:has-field-rules? info)]
                                        etype))]
    (walk node
          (fn [node]
            (when (contains? etypes-with-field-rules (:etype node))
              (let [program (rule-model/get-program! rules (:etype node) "view")]
                (when (= :field-level (:type program))
                  (update node :results
                          #(apply-field-level-filtering ctx rule-params program %))))))))

  ;; ... rest of permissioned-node ...
  )
```

---

### 1.5 Test Changes (`rule_test.clj`)

#### Add tests for field-level permissions

```clojure
(deftest field-level-view-rules
  (testing "field-level view rules allow per-field access"
    (let [rules {"users"
                 {"allow"
                  {"view"
                   {"$default" "true"
                    "email" "auth.id == data.id"
                    "ssn" "false"}}}}

          ctx {:auth {:id "user-123"}}

          ;; User viewing their own profile
          own-profile {:id "user-123" :name "Alice" :email "alice@example.com" :ssn "123-45-6789"}

          ;; User viewing someone else's profile
          other-profile {:id "user-456" :name "Bob" :email "bob@example.com" :ssn "987-65-4321"}]

      ;; Should see everything for own profile
      (is (= {:id "user-123" :name "Alice" :email "alice@example.com"}
             (apply-view-rules ctx rules "users" own-profile)))

      ;; Should see only name for other's profile (not email or ssn)
      (is (= {:id "user-456" :name "Bob"}
             (apply-view-rules ctx rules "users" other-profile))))))

(deftest field-level-update-rules
  (testing "field-level update rules control which fields can be updated"
    (let [rules {"users"
                 {"allow"
                  {"update"
                   {"$default" "auth.id == data.id"
                    "email" "auth.id == data.id"
                    "role" "false"}}}}  ; role is read-only

          ctx {:auth {:id "user-123"}}

          current-data {:id "user-123" :name "Alice" :email "alice@old.com" :role "member"}

          ;; Try to update multiple fields
          tx-steps [{:action :update
                     :eid "user-123"
                     :changes {:name "Alice Updated"
                               :email "alice@new.com"
                               :role "admin"}}]]

      ;; Name and email updates should succeed
      ;; Role update should fail
      (is (thrown-with-msg?
           Exception
           #"Permission denied for update on users.role"
           (check-transaction ctx rules current-data tx-steps))))))

(deftest field-level-with-binds
  (testing "field-level rules work with bind expressions"
    (let [rules {"posts"
                 {"bind" ["isOwner" "auth.id == data.authorId"
                          "isPublic" "data.visibility == 'public'"]
                  "allow"
                  {"view"
                   {"$default" "isPublic"
                    "draft" "isOwner"
                    "privateNotes" "isOwner"}}}}

          ctx {:auth {:id "user-123"}}

          ;; Public post by someone else
          public-post {:id "post-1"
                       :title "Public Post"
                       :draft false
                       :visibility "public"
                       :authorId "user-456"
                       :privateNotes "Internal notes"}]

      ;; Should see title and public fields, but not draft or privateNotes
      (is (= {:id "post-1" :title "Public Post" :visibility "public"}
             (apply-view-rules ctx rules "posts" public-post))))))

(deftest field-level-default-fallback
  (testing "$default rule is checked first, field rules second"
    (let [rules {"docs"
                 {"allow"
                  {"view"
                   {"$default" "auth.id != null"  ; Must be logged in
                    "secretField" "auth.role == 'admin'"}}}}  ; Admin-only field

          anonymous-ctx {:auth nil}
          user-ctx {:auth {:id "user-123" :role "member"}}
          admin-ctx {:auth {:id "admin-1" :role "admin"}}

          doc {:id "doc-1" :title "Document" :secretField "Top Secret"}]

      ;; Anonymous: $default fails, entire object denied
      (is (nil? (apply-view-rules anonymous-ctx rules "docs" doc)))

      ;; Regular user: $default passes, secretField filtered
      (is (= {:id "doc-1" :title "Document"}
             (apply-view-rules user-ctx rules "docs" doc)))

      ;; Admin: $default passes, secretField allowed
      (is (= {:id "doc-1" :title "Document" :secretField "Top Secret"}
             (apply-view-rules admin-ctx rules "docs" doc))))))

(deftest backward-compatibility
  (testing "string rules still work (backward compatible)"
    (let [old-style-rules {"docs"
                           {"allow"
                            {"view" "auth.id != null"
                             "update" "auth.id == data.ownerId"}}}

          new-style-rules {"docs"
                           {"allow"
                            {"view" {"$default" "auth.id != null"}
                             "update" {"$default" "auth.id == data.ownerId"}}}}]

      ;; Both should behave identically
      (is (= (apply-view-rules ctx old-style-rules "docs" doc)
             (apply-view-rules ctx new-style-rules "docs" doc))))))

(deftest field-level-validation-errors
  (testing "validation catches CEL errors in field rules"
    (let [invalid-rules {"users"
                         {"allow"
                          {"view"
                           {"$default" "true"
                            "email" "data.invalid().syntax()"}}}}]

      (is (seq (rule-model/validation-errors invalid-rules)))
      (is (some #(string/includes? (:message %) "email")
                (rule-model/validation-errors invalid-rules))))))

(deftest no-update-check-for-unchanged-fields
  (testing "update rules not checked for fields with identical values"
    (let [rules {"users"
                 {"allow"
                  {"update"
                   {"$default" "auth.id == data.id"
                    "email" "false"}}}}  ; Email locked, can't change

          ctx {:auth {:id "user-123"}}

          current-data {:id "user-123" :name "Alice" :email "alice@example.com"}

          ;; Update that doesn't change email (just name)
          tx-steps [{:action :update
                     :eid "user-123"
                     :changes {:name "Alice Updated"
                               :email "alice@example.com"}}]]  ; Same email

      ;; Should succeed because email wasn't actually changed
      (is (check-transaction ctx rules current-data tx-steps)))))
```

---

## 2. Client SDK Changes

### 2.1 Type Definition Updates (`rulesTypes.ts`)

```typescript
// Current types
type InstantRulesAttrsAllowBlock = {
  $default?: string | null | undefined;
  view?: string | null | undefined;
  create?: string | null | undefined;
  update?: string | null | undefined;
  delete?: string | null | undefined;
};

export type InstantRulesAllowBlock = InstantRulesAttrsAllowBlock & {
  link?: { [key: string]: string } | null | undefined;
  unlink?: { [key: string]: string } | null | undefined;
};

// NEW: Field-level rules support
type FieldLevelRule = {
  $default?: string;
  [fieldName: string]: string | undefined;
};

type InstantRulesAttrsAllowBlockWithFields = {
  $default?: string | FieldLevelRule | null | undefined;
  view?: string | FieldLevelRule | null | undefined;
  create?: string | FieldLevelRule | null | undefined;
  update?: string | FieldLevelRule | null | undefined;
  delete?: string | FieldLevelRule | null | undefined;
};

export type InstantRulesAllowBlockWithFields = InstantRulesAttrsAllowBlockWithFields & {
  link?: { [key: string]: string } | null | undefined;
  unlink?: { [key: string]: string } | null | undefined;
};

export type InstantRules<
  Schema extends InstantSchemaDef<any, any, any> = InstantUnknownSchema,
> = {
  $default?: { bind?: string[]; allow: InstantRulesAllowBlockWithFields };
  attrs?: { bind?: string[]; allow: InstantRulesAttrsAllowBlockWithFields };
} & {
  [EntityName in keyof Schema['entities']]: {
    bind?: string[];
    allow: InstantRulesAllowBlockWithFields;
  };
};
```

### 2.2 Enhanced Type Safety (Optional Future Work)

For better type safety, we could generate field-specific types based on the schema:

```typescript
// Generated types based on schema
type UserFields = 'id' | 'email' | 'name' | 'createdAt';

type FieldLevelRuleFor<Fields extends string> = {
  $default?: string;
} & {
  [K in Fields]?: string;
};

// Usage in rules
const rules = {
  users: {
    allow: {
      view: {
        $default: "true",
        email: "auth.id == data.id"  // TypeScript knows "email" is valid
      } satisfies FieldLevelRuleFor<UserFields>
    }
  }
} satisfies InstantRules<typeof schema>;
```

### 2.3 Usage Examples

```typescript
import { init } from '@instantdb/react';

const schema = i.schema({
  entities: {
    users: i.entity({
      email: i.string(),
      name: i.string(),
      bio: i.string(),
      privateNotes: i.string(),
    }),
    posts: i.entity({
      title: i.string(),
      content: i.string(),
      draft: i.boolean(),
      authorId: i.string(),
    }),
  },
});

const rules = {
  users: {
    bind: [
      "isCurrentUser", "auth.id == data.id"
    ],
    allow: {
      view: {
        $default: "true",  // Anyone can see users
        email: "isCurrentUser",  // Only you see your email
        privateNotes: "isCurrentUser",  // Only you see your private notes
      },
      update: {
        $default: "isCurrentUser",  // Only you can update yourself
        email: "isCurrentUser",  // Only you can update your email
      },
    },
  },
  posts: {
    bind: [
      "isAuthor", "auth.id == data.authorId",
      "isPublished", "!data.draft"
    ],
    allow: {
      view: {
        $default: "isPublished",  // Anyone can see published posts
        draft: "isAuthor",  // Only author sees draft status
      },
      update: {
        $default: "isAuthor",  // Only author can update
      },
    },
  },
} satisfies InstantRules<typeof schema>;

const db = init({
  appId: APP_ID,
  schema,
  rules  // Type-checked
});
```

---

## 3. Dashboard Changes

### 3.1 JSON Schema Update (`Perms.tsx`)

Update the `rulesSchema()` function to accept field-level rules:

```typescript
function rulesSchema(appSchema) {
  const actionRule = {
    oneOf: [
      { type: 'string' },  // Legacy: "auth.id == data.id"
      {
        type: 'object',  // NEW: Field-level
        properties: {
          $default: { type: 'string' },
        },
        additionalProperties: { type: 'string' },  // Field names -> rules
      },
    ],
  };

  return {
    type: 'object',
    properties: {
      ...namespaces.reduce((acc, ns) => {
        acc[ns] = {
          type: 'object',
          properties: {
            bind: {
              type: 'array',
              items: { type: 'string' },
            },
            allow: {
              type: 'object',
              properties: {
                view: actionRule,
                create: actionRule,
                update: actionRule,
                delete: actionRule,
                $default: actionRule,
                link: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
                unlink: {
                  type: 'object',
                  additionalProperties: { type: 'string' },
                },
              },
            },
          },
        };
        return acc;
      }, {}),
    },
  };
}
```

### 3.2 UI Enhancements for Field Selection

Add a helper UI to build field-level rules:

```typescript
function FieldLevelRuleEditor({
  namespace,
  action,
  value,
  onChange,
  schema
}: {
  namespace: string;
  action: 'view' | 'create' | 'update' | 'delete';
  value: string | FieldLevelRule;
  onChange: (newValue: string | FieldLevelRule) => void;
  schema: AppSchema;
}) {
  const [mode, setMode] = useState<'simple' | 'field-level'>(
    typeof value === 'string' ? 'simple' : 'field-level'
  );

  const fields = schema?.entities?.[namespace]?.fields || {};
  const fieldNames = Object.keys(fields);

  return (
    <div className="field-level-rule-editor">
      <div className="mode-selector">
        <button
          onClick={() => {
            setMode('simple');
            onChange('true');
          }}
        >
          Simple Rule
        </button>
        <button
          onClick={() => {
            setMode('field-level');
            onChange({ $default: 'true' });
          }}
        >
          Field-Level Rules
        </button>
      </div>

      {mode === 'simple' ? (
        <input
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., auth.id != null"
        />
      ) : (
        <div className="field-rules">
          <div className="default-rule">
            <label>Default Rule:</label>
            <input
              value={typeof value === 'object' ? value.$default : ''}
              onChange={(e) =>
                onChange({
                  ...(typeof value === 'object' ? value : {}),
                  $default: e.target.value
                })
              }
              placeholder="e.g., true"
            />
          </div>

          <div className="field-specific-rules">
            <label>Field-Specific Rules:</label>
            {fieldNames.map((fieldName) => (
              <div key={fieldName} className="field-rule">
                <span className="field-name">{fieldName}</span>
                <input
                  value={typeof value === 'object' ? value[fieldName] || '' : ''}
                  onChange={(e) =>
                    onChange({
                      ...(typeof value === 'object' ? value : { $default: 'true' }),
                      [fieldName]: e.target.value,
                    })
                  }
                  placeholder={`Rule for ${fieldName} (leave empty to use $default)`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

### 3.3 Sandbox Visualization Updates (`Sandbox.tsx`)

Update the permission check visualization to show field-level results:

```typescript
function PermissionCheckResult({ checkResult }) {
  const { etype, eid, action, scope, result, attr } = checkResult;

  return (
    <div className={`permission-check ${result ? 'pass' : 'fail'}`}>
      <div className="check-header">
        <span className="etype">{etype}</span>
        {scope === 'attr' && (
          <span className="attr-scope"> .{attr}</span>
        )}
        <span className="action"> ({action})</span>
        <span className={`result ${result ? 'pass' : 'fail'}`}>
          {result ? '✓' : '✗'}
        </span>
      </div>

      {scope === 'object' && (
        <div className="check-info">
          Checking {action} permission on entire object
        </div>
      )}

      {scope === 'attr' && (
        <div className="check-info">
          Checking {action} permission on field: <code>{attr}</code>
        </div>
      )}
    </div>
  );
}

function SandboxResults({ results }) {
  // Group checks by etype/eid
  const groupedChecks = groupBy(results.checkResults,
    (check) => `${check.etype}:${check.eid}`
  );

  return (
    <div className="sandbox-results">
      {Object.entries(groupedChecks).map(([key, checks]) => {
        const objectCheck = checks.find(c => c.scope === 'object');
        const fieldChecks = checks.filter(c => c.scope === 'attr');

        return (
          <div key={key} className="entity-checks">
            {objectCheck && <PermissionCheckResult checkResult={objectCheck} />}

            {fieldChecks.length > 0 && (
              <div className="field-checks">
                <div className="field-checks-header">Field Permissions:</div>
                {fieldChecks.map((check, i) => (
                  <PermissionCheckResult key={i} checkResult={check} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### 3.4 Visual Indicators in Schema Explorer

Add indicators showing which fields have custom permission rules:

```typescript
function AttributeRow({ namespace, attribute, rules }) {
  const hasFieldRule = (action: string) => {
    const rule = rules?.[namespace]?.allow?.[action];
    return typeof rule === 'object' && attribute.name in rule;
  };

  const viewRule = hasFieldRule('view');
  const updateRule = hasFieldRule('update');

  return (
    <div className="attribute-row">
      <span className="attr-name">{attribute.name}</span>
      <span className="attr-type">{attribute.type}</span>

      {(viewRule || updateRule) && (
        <span className="permission-indicator">
          {viewRule && <Badge>View Rule</Badge>}
          {updateRule && <Badge>Update Rule</Badge>}
        </span>
      )}
    </div>
  );
}
```

---

## 4. Migration Path

### 4.1 Backward Compatibility

**Existing string rules continue to work unchanged:**

```javascript
// Old format (still works)
{
  users: {
    allow: {
      view: "true",
      update: "auth.id == data.id"
    }
  }
}

// Equivalent new format
{
  users: {
    allow: {
      view: { $default: "true" },
      update: { $default: "auth.id == data.id" }
    }
  }
}
```

### 4.2 Incremental Adoption

Teams can adopt field-level rules incrementally:

```javascript
{
  users: {
    allow: {
      // Mix old and new formats
      view: {
        $default: "true",
        email: "auth.id == data.id"  // NEW
      },
      update: "auth.id == data.id",  // OLD format still works
      delete: "auth.id == data.id"   // OLD format still works
    }
  }
}
```

### 4.3 Migration Script (Optional)

Provide a helper to migrate string rules to field-level format:

```javascript
function migrateToFieldLevel(rules, namespace, action, fieldRules) {
  const currentRule = rules[namespace]?.allow?.[action];

  if (typeof currentRule === 'string') {
    // Convert string to field-level format
    return {
      ...rules,
      [namespace]: {
        ...rules[namespace],
        allow: {
          ...rules[namespace].allow,
          [action]: {
            $default: currentRule,
            ...fieldRules
          }
        }
      }
    };
  }

  // Already field-level, just merge
  return {
    ...rules,
    [namespace]: {
      ...rules[namespace],
      allow: {
        ...rules[namespace].allow,
        [action]: {
          ...(typeof currentRule === 'object' ? currentRule : {}),
          ...fieldRules
        }
      }
    }
  };
}

// Usage
const updatedRules = migrateToFieldLevel(
  existingRules,
  'users',
  'view',
  { email: 'auth.id == data.id' }
);
```

---

## 5. Examples & Use Cases

### 5.1 Private Email Addresses

```javascript
{
  $users: {
    allow: {
      view: {
        $default: "true",  // Anyone can see user profiles
        email: "auth.id == data.id"  // But only you see your email
      }
    }
  }
}
```

### 5.2 Draft Posts

```javascript
{
  posts: {
    bind: [
      "isAuthor", "auth.id == data.authorId",
      "isPublished", "!data.draft"
    ],
    allow: {
      view: {
        $default: "isPublished",  // Public sees published posts
        draft: "isAuthor",  // Only author sees draft status
        analytics: "isAuthor"  // Only author sees analytics
      }
    }
  }
}
```

### 5.3 Salary Information (HR System)

```javascript
{
  employees: {
    bind: [
      "isSelf", "auth.id == data.id",
      "isHR", "auth.role == 'hr'",
      "isManager", "auth.id == data.managerId"
    ],
    allow: {
      view: {
        $default: "true",  // Everyone can see basic info
        salary: "isSelf || isHR || isManager",  // Restricted field
        performanceReview: "isSelf || isHR || isManager",
        ssn: "isSelf || isHR"  // Most restricted
      },
      update: {
        $default: "isSelf",  // Can update own info
        salary: "isHR",  // Only HR can update salary
        role: "isHR",  // Only HR can update role
        managerId: "isHR"  // Only HR can change manager
      }
    }
  }
}
```

### 5.4 Medical Records (HIPAA Compliance)

```javascript
{
  medicalRecords: {
    bind: [
      "isPatient", "auth.id == data.patientId",
      "isDoctor", "auth.role == 'doctor' && auth.id in data.ref('authorizedProviders.id')",
      "isNurse", "auth.role == 'nurse' && auth.departmentId == data.departmentId"
    ],
    allow: {
      view: {
        $default: "isPatient || isDoctor",  // Patient and doctors see everything
        ssn: "isPatient || isDoctor",  // But nurses don't see SSN
        diagnosis: "isPatient || isDoctor",  // Nurses don't see diagnosis
        medications: "isPatient || isDoctor || isNurse"  // Nurses see medications
      },
      update: {
        $default: "isDoctor",  // Only doctors can update
        medications: "isDoctor || isNurse"  // Nurses can update medications
      }
    }
  }
}
```

### 5.5 Multi-tenant SaaS (Organization Data)

```javascript
{
  organizations: {
    bind: [
      "isMember", "auth.orgId == data.id",
      "isAdmin", "isMember && auth.role == 'admin'"
    ],
    allow: {
      view: {
        $default: "isMember",  // Members see org info
        billingInfo: "isAdmin",  // Only admins see billing
        apiKeys: "isAdmin",  // Only admins see API keys
        members: "isMember"  // Everyone sees member list
      },
      update: {
        $default: "isAdmin",  // Only admins can update
        name: "isAdmin",
        billingInfo: "isAdmin",
        settings: "isAdmin"
      }
    }
  }
}
```

### 5.6 Read-Only Fields

```javascript
{
  posts: {
    allow: {
      update: {
        $default: "auth.id == data.authorId",  // Author can update
        authorId: "false",  // But can't change author
        createdAt: "false",  // Can't change creation time
        viewCount: "false"  // Can't manipulate view count
      }
    }
  }
}
```

---

## 6. Implementation Checklist

### Backend
- [ ] Update `rule.clj`:
  - [ ] Modify `patch-code` to handle maps
  - [ ] Update `extract` to return field-level structure
  - [ ] Update `get-program!*` to compile field-level rules
  - [ ] Add `field-level-validation-errors`
  - [ ] Update `validation-errors` to include field validation

- [ ] Update `permissioned_transaction.clj`:
  - [ ] Add `field-level-check` function
  - [ ] Update `pre-checks` to handle field-level updates
  - [ ] Update check evaluation to handle `:attr` scope
  - [ ] Add error messages for field-level denials

- [ ] Update `instaql.clj`:
  - [ ] Update `get-rule-wheres` to use `$default` for WHERE
  - [ ] Add `apply-field-level-filtering` function
  - [ ] Update `permissioned-node` to filter fields post-query

- [ ] Update `cel.clj`:
  - [ ] Ensure WHERE clause generation works with `$default`
  - [ ] Handle field-level ref-uses correctly

### Tests
- [ ] Add `field-level-view-rules` test
- [ ] Add `field-level-update-rules` test
- [ ] Add `field-level-with-binds` test
- [ ] Add `field-level-default-fallback` test
- [ ] Add `backward-compatibility` test
- [ ] Add `field-level-validation-errors` test
- [ ] Add `no-update-check-for-unchanged-fields` test
- [ ] Add integration tests for queries with field-level rules
- [ ] Add integration tests for transactions with field-level rules

### Client SDK
- [ ] Update `rulesTypes.ts`:
  - [ ] Add `FieldLevelRule` type
  - [ ] Update `InstantRulesAttrsAllowBlockWithFields`
  - [ ] Update `InstantRulesAllowBlockWithFields`
  - [ ] Update main `InstantRules` type

- [ ] (Optional) Add field-name type safety based on schema

### Dashboard
- [ ] Update `Perms.tsx`:
  - [ ] Update `rulesSchema()` to accept field-level rules
  - [ ] Add `FieldLevelRuleEditor` component
  - [ ] Update JSON editor validation

- [ ] Update `Sandbox.tsx`:
  - [ ] Update `PermissionCheckResult` to show field checks
  - [ ] Add field-level grouping in results display

- [ ] (Optional) Update Schema Explorer:
  - [ ] Add permission indicators on attributes
  - [ ] Add "Edit Field Permissions" shortcuts

### Documentation
- [ ] Update permissions documentation
- [ ] Add field-level permissions examples
- [ ] Document evaluation order ($default first, then fields)
- [ ] Add migration guide for existing rules
- [ ] Document backward compatibility guarantees

---

## 7. Edge Cases & Considerations

### 7.1 Unchanged Field Updates

**Problem**: User sends an update with the exact same value for a restricted field.

**Solution**: Before checking update permissions, diff `data` vs `new-data`. Only check permissions for fields that actually changed.

```clojure
(let [changed-attrs (keys (d/diff-state-maps data new-data))]
  (field-level-check ctx program etype eid bindings changed-attrs))
```

### 7.2 Null vs Undefined vs Missing Fields

**Handling**:
- If a field-specific rule exists, evaluate it
- If no field-specific rule exists, fallback to `$default`
- If no `$default` exists, deny access to that field
- Always include `id` field in results (unless explicitly denied)

### 7.3 Link/Unlink Rules

**Scope**: Field-level rules initially apply to `view`, `update`, `create`, and `delete`.

**Future work**: Consider field-level rules for `link`/`unlink` to control which relationship fields can be modified.

### 7.4 Performance Considerations

**View queries**:
1. Use `$default` for SQL WHERE clause optimization (fast)
2. Post-filter individual fields after fetching (slower, but necessary)
3. Consider caching field-level permission evaluations per user

**Update transactions**:
1. Only evaluate rules for changed fields
2. Batch evaluate all field checks together
3. Short-circuit if `$default` fails (no need to check fields)

### 7.5 Query Result Consistency

When some fields are filtered out, ensure:
- `id` is always included (unless explicitly denied)
- Queries still return proper data structure
- Nested objects and relationships handle filtered fields correctly

---

## 8. Future Enhancements

### 8.1 Field-Level Create Rules

Allow controlling which fields can be set during entity creation:

```javascript
{
  posts: {
    allow: {
      create: {
        $default: "auth.id != null",
        authorId: "newData.authorId == auth.id"  // Must set author to self
      }
    }
  }
}
```

### 8.2 Field-Level Link Rules

Control which relationship fields can be modified:

```javascript
{
  posts: {
    allow: {
      link: {
        $default: "auth.id == data.authorId",
        coAuthors: "auth.id == data.authorId",  // Only author adds co-authors
        tags: "true"  // Anyone can add tags
      }
    }
  }
}
```

### 8.3 Dynamic Field Visibility Based on State

Allow field rules to depend on entity state:

```javascript
{
  posts: {
    allow: {
      view: {
        $default: "!data.draft",
        draft: "auth.id == data.authorId",
        content: "!data.draft || auth.id == data.authorId"  // Hide content if draft
      }
    }
  }
}
```

### 8.4 Rule Computation Optimization

Cache field-level permission results per user session:

```clojure
;; Cache structure: [auth-id etype eid field-name] -> boolean
(def field-permission-cache
  (cache/make {:max-size 10000 :ttl-ms 60000}))
```

### 8.5 Bulk Field Permissions

Allow setting rules for multiple fields at once:

```javascript
{
  medicalRecords: {
    allow: {
      view: {
        $default: "isPatient",
        $fields: {
          ["ssn", "dob", "address"]: "isPatient || isDoctor",
          ["diagnosis", "prescriptions"]: "isDoctor"
        }
      }
    }
  }
}
```

---

## Summary

This implementation plan provides:

1. ✅ **Backward compatibility**: String rules continue to work
2. ✅ **Clear semantics**: `$default` checked first, field rules second
3. ✅ **Type safety**: Full TypeScript support in client SDK
4. ✅ **Performance**: WHERE clause optimization using `$default`
5. ✅ **Developer UX**: Clear error messages, sandbox visualization
6. ✅ **Incremental adoption**: Can add field rules one at a time

The approach balances simplicity (extend existing rule structure) with power (fine-grained field control) while maintaining the existing developer experience.
