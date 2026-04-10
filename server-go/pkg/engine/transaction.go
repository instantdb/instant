package engine

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

// TxProcessor handles InstaML transaction processing.
type TxProcessor struct {
	db *storage.DB
}

// NewTxProcessor creates a new transaction processor.
func NewTxProcessor(db *storage.DB) *TxProcessor {
	return &TxProcessor{db: db}
}

// TxInput is the raw transaction from the client.
type TxInput struct {
	Steps []json.RawMessage `json:"tx-steps"`
}

// TxResult is the result of a successful transaction.
type TxResult struct {
	TxID    int64             `json:"tx-id"`
	Attrs   []*storage.Attr   `json:"attrs,omitempty"`
	Changes []storage.ChangelogEntry `json:"changes,omitempty"`
}

// ParseTxStep parses a raw transaction step from the client.
// Steps come as arrays like ["add-triple", entityID, attrID, value]
func ParseTxStep(raw json.RawMessage) (*storage.TxStep, error) {
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return nil, fmt.Errorf("tx step must be array: %w", err)
	}
	if len(arr) < 1 {
		return nil, fmt.Errorf("tx step must have at least 1 element")
	}

	var op string
	if err := json.Unmarshal(arr[0], &op); err != nil {
		return nil, fmt.Errorf("tx step op must be string: %w", err)
	}

	step := &storage.TxStep{Op: op}

	switch op {
	case "add-triple", "retract-triple", "deep-merge-triple":
		if len(arr) < 4 {
			return nil, fmt.Errorf("%s requires [op, entityID, attrID, value]", op)
		}
		// Entity ID can be a string UUID or a lookup ref [attrID, value]
		var eid interface{}
		var eidStr string
		if err := json.Unmarshal(arr[1], &eidStr); err == nil {
			eid = eidStr
		} else {
			var lookup []json.RawMessage
			if err := json.Unmarshal(arr[1], &lookup); err == nil {
				eid = lookup
			} else {
				return nil, fmt.Errorf("entity-id must be string or [attrID, value]")
			}
		}
		step.EntityID = eid

		var attrID string
		if err := json.Unmarshal(arr[2], &attrID); err != nil {
			return nil, fmt.Errorf("attr-id must be string: %w", err)
		}
		step.AttrID = attrID
		step.Value = arr[3]

		// Parse opts (5th element if present)
		if len(arr) >= 5 {
			var opts storage.TxOpts
			json.Unmarshal(arr[4], &opts)
			step.Opts = &opts
		}

	case "delete-entity":
		if len(arr) < 2 {
			return nil, fmt.Errorf("delete-entity requires [op, entityID]")
		}
		var eid interface{}
		var eidStr string
		if err := json.Unmarshal(arr[1], &eidStr); err == nil {
			eid = eidStr
		} else {
			var lookup []json.RawMessage
			if err := json.Unmarshal(arr[1], &lookup); err == nil {
				eid = lookup
			}
		}
		step.EntityID = eid
		if len(arr) >= 3 {
			json.Unmarshal(arr[2], &step.Etype)
		}

	case "add-attr":
		if len(arr) < 2 {
			return nil, fmt.Errorf("add-attr requires [op, attrDef]")
		}
		var attr storage.Attr
		if err := json.Unmarshal(arr[1], &attr); err != nil {
			return nil, fmt.Errorf("invalid attr definition: %w", err)
		}
		step.Attr = &attr

	case "update-attr":
		if len(arr) < 2 {
			return nil, fmt.Errorf("update-attr requires [op, attrUpdate]")
		}
		var attr storage.Attr
		if err := json.Unmarshal(arr[1], &attr); err != nil {
			return nil, fmt.Errorf("invalid attr update: %w", err)
		}
		step.AttrUpdate = &attr

	case "delete-attr":
		if len(arr) < 2 {
			return nil, fmt.Errorf("delete-attr requires [op, attrID]")
		}
		json.Unmarshal(arr[1], &step.AttrID)

	default:
		return nil, fmt.Errorf("unknown tx op: %s", op)
	}

	return step, nil
}

// ProcessTransaction executes a transaction against the database.
func (tp *TxProcessor) ProcessTransaction(ctx context.Context, appID string, steps []json.RawMessage, attrs []*storage.Attr) (*TxResult, error) {
	attrMap := storage.BuildAttrMap(attrs)
	result := &TxResult{}
	var changes []storage.ChangelogEntry

	err := tp.db.ExecTx(ctx, func(tx *sql.Tx) error {
		for _, rawStep := range steps {
			step, err := ParseTxStep(rawStep)
			if err != nil {
				return fmt.Errorf("parse step: %w", err)
			}

			switch step.Op {
			case "add-triple":
				if err := tp.execAddTriple(ctx, tx, appID, step, attrMap, &changes); err != nil {
					return err
				}
			case "deep-merge-triple":
				if err := tp.execDeepMergeTriple(ctx, tx, appID, step, attrMap, &changes); err != nil {
					return err
				}
			case "retract-triple":
				if err := tp.execRetractTriple(ctx, tx, appID, step, attrMap, &changes); err != nil {
					return err
				}
			case "delete-entity":
				if err := tp.execDeleteEntity(ctx, tx, appID, step, &changes); err != nil {
					return err
				}
			case "add-attr":
				if err := tp.execAddAttr(ctx, tx, appID, step); err != nil {
					return err
				}
			case "update-attr":
				if err := tp.execUpdateAttr(ctx, tx, step); err != nil {
					return err
				}
			case "delete-attr":
				if err := tp.execDeleteAttr(ctx, tx, step); err != nil {
					return err
				}
			default:
				return fmt.Errorf("unknown op: %s", step.Op)
			}
		}
		return nil
	})

	if err != nil {
		return nil, err
	}

	result.Changes = changes

	// Notify subscribers of changes
	for _, ch := range changes {
		tp.db.NotifyChange(ch)
	}

	return result, nil
}

func (tp *TxProcessor) resolveEntityID(ctx context.Context, tx *sql.Tx, appID string, eid interface{}, attrMap map[string]*storage.Attr) (string, error) {
	switch v := eid.(type) {
	case string:
		return v, nil
	case []json.RawMessage:
		// Lookup ref: [attrID, value]
		if len(v) != 2 {
			return "", fmt.Errorf("lookup ref must be [attrID, value]")
		}
		var attrID string
		if err := json.Unmarshal(v[0], &attrID); err != nil {
			return "", err
		}
		valMD5 := storage.JSONValue(nil)
		json.Unmarshal(v[1], &valMD5)
		md5 := fmt.Sprintf("%x", md5Sum(valMD5))

		var entityID string
		err := tx.QueryRowContext(ctx,
			`SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND value_md5 = ?`,
			appID, attrID, md5).Scan(&entityID)
		if err == sql.ErrNoRows {
			return "", fmt.Errorf("entity not found for lookup [%s, %s]", attrID, string(valMD5))
		}
		return entityID, err
	default:
		return "", fmt.Errorf("unsupported entity-id type: %T", eid)
	}
}

func (tp *TxProcessor) execAddTriple(ctx context.Context, tx *sql.Tx, appID string, step *storage.TxStep, attrMap map[string]*storage.Attr, changes *[]storage.ChangelogEntry) error {
	entityID, err := tp.resolveEntityID(ctx, tx, appID, step.EntityID, attrMap)
	if err != nil {
		return err
	}

	attr := attrMap[step.AttrID]

	// For cardinality:one, retract existing value first
	if attr != nil && attr.Cardinality == "one" {
		tx.ExecContext(ctx,
			`DELETE FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ?`,
			appID, entityID, step.AttrID)
	}

	ea, eav, av, ave, vae := storage.IndexFlags(attr)
	md5 := fmt.Sprintf("%x", md5Sum(step.Value))

	_, err = tx.ExecContext(ctx,
		`INSERT INTO triples(app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now')*1000)
		 ON CONFLICT(app_id, entity_id, attr_id, value_md5) DO UPDATE SET value=excluded.value`,
		appID, entityID, step.AttrID, string(step.Value), md5,
		boolToInt(ea), boolToInt(eav), boolToInt(av), boolToInt(ave), boolToInt(vae))

	return err
}

func (tp *TxProcessor) execDeepMergeTriple(ctx context.Context, tx *sql.Tx, appID string, step *storage.TxStep, attrMap map[string]*storage.Attr, changes *[]storage.ChangelogEntry) error {
	entityID, err := tp.resolveEntityID(ctx, tx, appID, step.EntityID, attrMap)
	if err != nil {
		return err
	}

	attr := attrMap[step.AttrID]

	// Get existing value
	var existingVal string
	err = tx.QueryRowContext(ctx,
		`SELECT value FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ? LIMIT 1`,
		appID, entityID, step.AttrID).Scan(&existingVal)

	var merged json.RawMessage
	if err == sql.ErrNoRows {
		merged = step.Value
	} else if err != nil {
		return err
	} else {
		merged = storage.DeepMerge(json.RawMessage(existingVal), step.Value)
	}

	// Retract existing
	tx.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ?`,
		appID, entityID, step.AttrID)

	ea, eav, av, ave, vae := storage.IndexFlags(attr)
	md5 := fmt.Sprintf("%x", md5Sum(merged))

	_, err = tx.ExecContext(ctx,
		`INSERT INTO triples(app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s','now')*1000)`,
		appID, entityID, step.AttrID, string(merged), md5,
		boolToInt(ea), boolToInt(eav), boolToInt(av), boolToInt(ave), boolToInt(vae))

	return err
}

func (tp *TxProcessor) execRetractTriple(ctx context.Context, tx *sql.Tx, appID string, step *storage.TxStep, attrMap map[string]*storage.Attr, changes *[]storage.ChangelogEntry) error {
	entityID, err := tp.resolveEntityID(ctx, tx, appID, step.EntityID, attrMap)
	if err != nil {
		return err
	}

	md5 := fmt.Sprintf("%x", md5Sum(step.Value))
	_, err = tx.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ? AND value_md5 = ?`,
		appID, entityID, step.AttrID, md5)
	return err
}

func (tp *TxProcessor) execDeleteEntity(ctx context.Context, tx *sql.Tx, appID string, step *storage.TxStep, changes *[]storage.ChangelogEntry) error {
	entityID, ok := step.EntityID.(string)
	if !ok {
		return fmt.Errorf("delete-entity requires string entity-id")
	}

	// Delete all triples for this entity (both as source and as ref target)
	_, err := tx.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ?`,
		appID, entityID)
	if err != nil {
		return err
	}

	// Also delete triples referencing this entity
	_, err = tx.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND json_extract(value, '$') = ? AND vae = 1`,
		appID, entityID)
	return err
}

func (tp *TxProcessor) execAddAttr(ctx context.Context, tx *sql.Tx, appID string, step *storage.TxStep) error {
	attr := step.Attr
	attr.AppID = appID
	_, err := tx.ExecContext(ctx,
		`INSERT INTO attrs(id, app_id, fwd_ident_id, fwd_etype, fwd_label,
		  rev_ident_id, rev_etype, rev_label, value_type, cardinality,
		  is_unique, is_index, is_required, checked_data_type, inferred_types)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING`,
		attr.ID, attr.AppID,
		attr.ForwardIdentity[0], attr.ForwardIdentity[1], attr.ForwardIdentity[2],
		attr.ReverseIdentity[0], attr.ReverseIdentity[1], attr.ReverseIdentity[2],
		attr.ValueType, attr.Cardinality,
		boolToInt(attr.IsUnique), boolToInt(attr.IsIndex),
		boolToInt(attr.IsRequired), attr.CheckedDataType, attr.InferredTypes)
	return err
}

func (tp *TxProcessor) execUpdateAttr(ctx context.Context, tx *sql.Tx, step *storage.TxStep) error {
	attr := step.AttrUpdate
	if attr == nil {
		return fmt.Errorf("update-attr requires attr data")
	}
	_, err := tx.ExecContext(ctx,
		`UPDATE attrs SET
		  fwd_etype = CASE WHEN ? != '' THEN ? ELSE fwd_etype END,
		  fwd_label = CASE WHEN ? != '' THEN ? ELSE fwd_label END,
		  rev_etype = CASE WHEN ? != '' THEN ? ELSE rev_etype END,
		  rev_label = CASE WHEN ? != '' THEN ? ELSE rev_label END,
		  value_type = CASE WHEN ? != '' THEN ? ELSE value_type END,
		  cardinality = CASE WHEN ? != '' THEN ? ELSE cardinality END,
		  is_unique = ?, is_index = ?
		 WHERE id = ?`,
		attr.ForwardIdentity[1], attr.ForwardIdentity[1],
		attr.ForwardIdentity[2], attr.ForwardIdentity[2],
		attr.ReverseIdentity[1], attr.ReverseIdentity[1],
		attr.ReverseIdentity[2], attr.ReverseIdentity[2],
		attr.ValueType, attr.ValueType,
		attr.Cardinality, attr.Cardinality,
		boolToInt(attr.IsUnique), boolToInt(attr.IsIndex),
		attr.ID)
	return err
}

func (tp *TxProcessor) execDeleteAttr(ctx context.Context, tx *sql.Tx, step *storage.TxStep) error {
	// Delete all triples using this attr first
	_, err := tx.ExecContext(ctx,
		`DELETE FROM triples WHERE attr_id = ?`, step.AttrID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`DELETE FROM attrs WHERE id = ?`, step.AttrID)
	return err
}

// ---- helpers ----

func md5Sum(data json.RawMessage) [16]byte {
	return md5.Sum(data)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
