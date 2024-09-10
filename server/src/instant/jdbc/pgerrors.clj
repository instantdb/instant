(ns instant.jdbc.pgerrors
  (:require [instant.util.json :refer [<-json]]
            [medley.core :as medley])
  (:import [org.postgresql.util PSQLException]))

;; ---------- 
;; Generated from https://www.postgresql.org/docs/current/errcodes-appendix.html 
;; 
;; Use this snippet to generate `map-str`
;; 
;; function getMap() {
;;   const table = document.getElementById('ERRCODES-TABLE');
;;   const errorCodes = {};
;;
;;   let currentClass = null;
;;
;;   const trs = [...table.querySelectorAll('tr')]
;;   trs.forEach(row => {
;;       const cells = row.querySelectorAll('td, th');
;;
;;       if (cells.length === 1) {
;;           // this must be the class header
;;           currentClass = cells[0].innerText.trim();
;;           errorCodes[currentClass] = {};
;;       } else if (cells.length === 2 && currentClass) {
;;           // This must be an entry
;;           const code = cells[0].innerText.trim();
;;           const conditionName = cells[1].innerText.trim();
;;           errorCodes[currentClass][code] = conditionName.replaceAll('_', '-') ;
;;       }
;;   });
;;
;;   return errorCodes;
;; }
;; copy(JSON.stringify(JSON.stringify(getMap())))

(comment
  ;; Then you can use this to generate the def 
  (def map-str "paste-here")
  (def class->sql-state->condition
    (->> map-str
         <-json
         (medley/map-vals
          (fn [sql-state->cond]
            (medley/map-vals keyword sql-state->cond)))
         (sort-by first)
         (into (sorted-map)))))

(def class->sql-state->condition
  {"Class 00 — Successful Completion"
   {"00000" :successful-completion},
   "Class 01 — Warning"
   {"01000" :warning,
    "0100C" :dynamic-result-sets-returned,
    "01008" :implicit-zero-bit-padding,
    "01003" :null-value-eliminated-in-set-function,
    "01007" :privilege-not-granted,
    "01006" :privilege-not-revoked,
    "01004" :string-data-right-truncation,
    "01P01" :deprecated-feature},
   "Class 02 — No Data (this is also a warning class per the SQL standard)"
   {"02000" :no-data,
    "02001" :no-additional-dynamic-result-sets-returned},
   "Class 03 — SQL Statement Not Yet Complete"
   {"03000" :sql-statement-not-yet-complete},
   "Class 08 — Connection Exception"
   {"08000" :connection-exception,
    "08003" :connection-does-not-exist,
    "08006" :connection-failure,
    "08001" :sqlclient-unable-to-establish-sqlconnection,
    "08004" :sqlserver-rejected-establishment-of-sqlconnection,
    "08007" :transaction-resolution-unknown,
    "08P01" :protocol-violation},
   "Class 09 — Triggered Action Exception"
   {"09000" :triggered-action-exception},
   "Class 0A — Feature Not Supported" {"0A000" :feature-not-supported},
   "Class 0B — Invalid Transaction Initiation"
   {"0B000" :invalid-transaction-initiation},
   "Class 0F — Locator Exception"
   {"0F000" :locator-exception, "0F001" :invalid-locator-specification},
   "Class 0L — Invalid Grantor"
   {"0L000" :invalid-grantor, "0LP01" :invalid-grant-operation},
   "Class 0P — Invalid Role Specification"
   {"0P000" :invalid-role-specification},
   "Class 0Z — Diagnostics Exception"
   {"0Z000" :diagnostics-exception,
    "0Z002" :stacked-diagnostics-accessed-without-active-handler},
   "Class 20 — Case Not Found" {"20000" :case-not-found},
   "Class 21 — Cardinality Violation" {"21000" :cardinality-violation},
   "Class 22 — Data Exception"
   {"22031" :invalid-argument-for-sql-json-datetime-function,
    "22P01" :floating-point-exception,
    "22039" :sql-json-array-not-found,
    "2203G" :sql-json-item-cannot-be-cast-to-target-type,
    "2201F" :invalid-argument-for-power-function,
    "2203B" :sql-json-number-not-found,
    "2203A" :sql-json-member-not-found,
    "22022" :indicator-overflow,
    "2201X" :invalid-row-count-in-result-offset-clause,
    "22001" :string-data-right-truncation,
    "2200C" :invalid-use-of-escape-character,
    "22005" :error-in-assignment,
    "22032" :invalid-json-text,
    "22030" :duplicate-json-object-key-value,
    "2200L" :not-an-xml-document,
    "22034" :more-than-one-sql-json-item,
    "2200H" :sequence-generator-limit-exceeded,
    "22035" :no-sql-json-item,
    "22018" :invalid-character-value-for-cast,
    "2200B" :escape-character-conflict,
    "22024" :unterminated-c-string,
    "2200G" :most-specific-type-mismatch,
    "2203E" :too-many-json-object-members,
    "2200F" :zero-length-character-string,
    "22036" :non-numeric-sql-json-item,
    "22003" :numeric-value-out-of-range,
    "22P06" :nonstandard-use-of-escape-character,
    "22027" :trim-error,
    "2203C" :sql-json-object-not-found,
    "22026" :string-data-length-mismatch,
    "2201E" :invalid-argument-for-logarithm,
    "22000" :data-exception,
    "2203D" :too-many-json-array-elements,
    "2202E" :array-subscript-error,
    "2200N" :invalid-xml-content,
    "22015" :interval-field-overflow,
    "2200T" :invalid-xml-processing-instruction,
    "22019" :invalid-escape-character,
    "22033" :invalid-sql-json-subscript,
    "22025" :invalid-escape-sequence,
    "22016" :invalid-argument-for-nth-value-function,
    "22037" :non-unique-keys-in-a-json-object,
    "22002" :null-value-no-indicator-parameter,
    "22P02" :invalid-text-representation,
    "2202G" :invalid-tablesample-repeat,
    "2200D" :invalid-escape-octet,
    "22P05" :untranslatable-character,
    "22010" :invalid-indicator-parameter-value,
    "22P04" :bad-copy-file-format,
    "22023" :invalid-parameter-value,
    "22009" :invalid-time-zone-displacement-value,
    "22014" :invalid-argument-for-ntile-function,
    "2200S" :invalid-xml-comment,
    "22021" :character-not-in-repertoire,
    "22012" :division-by-zero,
    "2202H" :invalid-tablesample-argument,
    "22011" :substring-error,
    "22004" :null-value-not-allowed,
    "2201G" :invalid-argument-for-width-bucket-function,
    "2201W" :invalid-row-count-in-limit-clause,
    "22013" :invalid-preceding-or-following-size,
    "22008" :datetime-field-overflow,
    "2203F" :sql-json-scalar-required,
    "2200M" :invalid-xml-document,
    "22007" :invalid-datetime-format,
    "2201B" :invalid-regular-expression,
    "22P03" :invalid-binary-representation,
    "22038" :singleton-sql-json-item-required},
   "Class 23 — Integrity Constraint Violation"
   {"23000" :integrity-constraint-violation,
    "23001" :restrict-violation,
    "23502" :not-null-violation,
    "23503" :foreign-key-violation,
    "23505" :unique-violation,
    "23514" :check-violation,
    "23P01" :exclusion-violation},
   "Class 24 — Invalid Cursor State" {"24000" :invalid-cursor-state},
   "Class 25 — Invalid Transaction State"
   {"25003" :inappropriate-access-mode-for-branch-transaction,
    "25P02" :in-failed-sql-transaction,
    "25008" :held-cursor-requires-same-isolation-level,
    "25004" :inappropriate-isolation-level-for-branch-transaction,
    "25005" :no-active-sql-transaction-for-branch-transaction,
    "25001" :active-sql-transaction,
    "25002" :branch-transaction-already-active,
    "25000" :invalid-transaction-state,
    "25P03" :idle-in-transaction-session-timeout,
    "25007" :schema-and-data-statement-mixing-not-supported,
    "25P01" :no-active-sql-transaction,
    "25006" :read-only-sql-transaction},
   "Class 26 — Invalid SQL Statement Name"
   {"26000" :invalid-sql-statement-name},
   "Class 27 — Triggered Data Change Violation"
   {"27000" :triggered-data-change-violation},
   "Class 28 — Invalid Authorization Specification"
   {"28000" :invalid-authorization-specification,
    "28P01" :invalid-password},
   "Class 2B — Dependent Privilege Descriptors Still Exist"
   {"2B000" :dependent-privilege-descriptors-still-exist,
    "2BP01" :dependent-objects-still-exist},
   "Class 2D — Invalid Transaction Termination"
   {"2D000" :invalid-transaction-termination},
   "Class 2F — SQL Routine Exception"
   {"2F000" :sql-routine-exception,
    "2F005" :function-executed-no-return-statement,
    "2F002" :modifying-sql-data-not-permitted,
    "2F003" :prohibited-sql-statement-attempted,
    "2F004" :reading-sql-data-not-permitted},
   "Class 34 — Invalid Cursor Name" {"34000" :invalid-cursor-name},
   "Class 38 — External Routine Exception"
   {"38000" :external-routine-exception,
    "38001" :containing-sql-not-permitted,
    "38002" :modifying-sql-data-not-permitted,
    "38003" :prohibited-sql-statement-attempted,
    "38004" :reading-sql-data-not-permitted},
   "Class 39 — External Routine Invocation Exception"
   {"39000" :external-routine-invocation-exception,
    "39001" :invalid-sqlstate-returned,
    "39004" :null-value-not-allowed,
    "39P01" :trigger-protocol-violated,
    "39P02" :srf-protocol-violated,
    "39P03" :event-trigger-protocol-violated},
   "Class 3B — Savepoint Exception"
   {"3B000" :savepoint-exception,
    "3B001" :invalid-savepoint-specification},
   "Class 3D — Invalid Catalog Name" {"3D000" :invalid-catalog-name},
   "Class 3F — Invalid Schema Name" {"3F000" :invalid-schema-name},
   "Class 40 — Transaction Rollback"
   {"40000" :transaction-rollback,
    "40001" :serialization-failure,
    "40002" :transaction-integrity-constraint-violation,
    "40003" :statement-completion-unknown,
    "40P01" :deadlock-detected},
   "Class 42 — Syntax Error or Access Rule Violation"
   {"42601" :syntax-error,
    "42804" :datatype-mismatch,
    "42809" :wrong-object-type,
    "42710" :duplicate-object,
    "42P12" :invalid-database-definition,
    "42000" :syntax-error-or-access-rule-violation,
    "42883" :undefined-function,
    "42602" :invalid-name,
    "42723" :duplicate-function,
    "42P13" :invalid-function-definition,
    "42803" :grouping-error,
    "42P08" :ambiguous-parameter,
    "42P04" :duplicate-database,
    "42P22" :indeterminate-collation,
    "42703" :undefined-column,
    "42P02" :undefined-parameter,
    "42P10" :invalid-column-reference,
    "42P06" :duplicate-schema,
    "42702" :ambiguous-column,
    "42611" :invalid-column-definition,
    "42P16" :invalid-table-definition,
    "42P07" :duplicate-table,
    "42725" :ambiguous-function,
    "42P15" :invalid-schema-definition,
    "42P20" :windowing-error,
    "42P14" :invalid-prepared-statement-definition,
    "42704" :undefined-object,
    "42846" :cannot-coerce,
    "42622" :name-too-long,
    "42P01" :undefined-table,
    "42501" :insufficient-privilege,
    "42P18" :indeterminate-datatype,
    "42701" :duplicate-column,
    "42939" :reserved-name,
    "42P21" :collation-mismatch,
    "42P09" :ambiguous-alias,
    "42P05" :duplicate-prepared-statement,
    "42P17" :invalid-object-definition,
    "428C9" :generated-always,
    "42830" :invalid-foreign-key,
    "42P03" :duplicate-cursor,
    "42712" :duplicate-alias,
    "42P19" :invalid-recursion,
    "42P11" :invalid-cursor-definition},
   "Class 44 — WITH CHECK OPTION Violation"
   {"44000" :with-check-option-violation},
   "Class 53 — Insufficient Resources"
   {"53000" :insufficient-resources,
    "53100" :disk-full,
    "53200" :out-of-memory,
    "53300" :too-many-connections,
    "53400" :configuration-limit-exceeded},
   "Class 54 — Program Limit Exceeded"
   {"54000" :program-limit-exceeded,
    "54001" :statement-too-complex,
    "54011" :too-many-columns,
    "54023" :too-many-arguments},
   "Class 55 — Object Not In Prerequisite State"
   {"55000" :object-not-in-prerequisite-state,
    "55006" :object-in-use,
    "55P02" :cant-change-runtime-param,
    "55P03" :lock-not-available,
    "55P04" :unsafe-new-enum-value-usage},
   "Class 57 — Operator Intervention"
   {"57000" :operator-intervention,
    "57014" :query-canceled,
    "57P01" :admin-shutdown,
    "57P02" :crash-shutdown,
    "57P03" :cannot-connect-now,
    "57P04" :database-dropped,
    "57P05" :idle-session-timeout},
   "Class 58 — System Error (errors external to PostgreSQL itself)"
   {"58000" :system-error,
    "58030" :io-error,
    "58P01" :undefined-file,
    "58P02" :duplicate-file},
   "Class 72 — Snapshot Failure" {"72000" :snapshot-too-old},
   "Class F0 — Configuration File Error"
   {"F0000" :config-file-error, "F0001" :lock-file-exists},
   "Class HV — Foreign Data Wrapper Error (SQL/MED)"
   {"HV00M" :fdw-unable-to-create-reply,
    "HV00Q" :fdw-schema-not-found,
    "HV007" :fdw-invalid-column-name,
    "HV00B" :fdw-invalid-handle,
    "HV091" :fdw-invalid-descriptor-field-identifier,
    "HV090" :fdw-invalid-string-length-or-buffer-length,
    "HV00D" :fdw-invalid-option-name,
    "HV00N" :fdw-unable-to-establish-connection,
    "HV000" :fdw-error,
    "HV024" :fdw-invalid-attribute-value,
    "HV00C" :fdw-invalid-option-index,
    "HV00P" :fdw-no-schemas,
    "HV001" :fdw-out-of-memory,
    "HV004" :fdw-invalid-data-type,
    "HV00J" :fdw-option-name-not-found,
    "HV008" :fdw-invalid-column-number,
    "HV021" :fdw-inconsistent-descriptor-information,
    "HV009" :fdw-invalid-use-of-null-pointer,
    "HV00A" :fdw-invalid-string-format,
    "HV006" :fdw-invalid-data-type-descriptors,
    "HV014" :fdw-too-many-handles,
    "HV00L" :fdw-unable-to-create-execution,
    "HV010" :fdw-function-sequence-error,
    "HV00R" :fdw-table-not-found,
    "HV005" :fdw-column-name-not-found,
    "HV00K" :fdw-reply-handle,
    "HV002" :fdw-dynamic-parameter-value-needed},
   "Class P0 — PL/pgSQL Error"
   {"P0000" :plpgsql-error,
    "P0001" :raise-exception,
    "P0002" :no-data-found,
    "P0003" :too-many-rows,
    "P0004" :assert-failure},
   "Class XX — Internal Error"
   {"XX000" :internal-error,
    "XX001" :data-corrupted,
    "XX002" :index-corrupted}})

(def sql-state->condition
  (->> class->sql-state->condition
       (map second)
       (reduce merge)))

(defn extract-data [^PSQLException e]
  (let [sql-state (.getSQLState e)
        condition (or (sql-state->condition sql-state) :unknown)
        server-err (.getServerErrorMessage e)]
    (cond->
     {:sql-state sql-state
      :condition condition}
      server-err
      (assoc
       :table (.getTable server-err)
       :constraint (.getConstraint server-err)
       :server-message (.getMessage server-err)))))
