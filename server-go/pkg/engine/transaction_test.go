package engine

import (
	"context"
	"encoding/json"
	"testing"
)

func TestParseTxStepAddTriple(t *testing.T) {
	raw := json.RawMessage(`["add-triple", "entity-1", "attr-1", "hello"]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "add-triple" {
		t.Errorf("got op %q, want %q", step.Op, "add-triple")
	}
	if step.EntityID != "entity-1" {
		t.Errorf("got entity-id %v, want %q", step.EntityID, "entity-1")
	}
	if step.AttrID != "attr-1" {
		t.Errorf("got attr-id %q, want %q", step.AttrID, "attr-1")
	}
}

func TestParseTxStepDeleteEntity(t *testing.T) {
	raw := json.RawMessage(`["delete-entity", "entity-1", "users"]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "delete-entity" {
		t.Errorf("got op %q, want %q", step.Op, "delete-entity")
	}
	if step.Etype != "users" {
		t.Errorf("got etype %q, want %q", step.Etype, "users")
	}
}

func TestParseTxStepAddAttr(t *testing.T) {
	raw := json.RawMessage(`["add-attr", {"id": "attr-1", "forward-identity": ["fi", "users", "name"], "value-type": "blob", "cardinality": "one", "unique?": false, "index?": false}]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "add-attr" {
		t.Errorf("got op %q, want %q", step.Op, "add-attr")
	}
	if step.Attr == nil {
		t.Fatal("expected attr")
	}
	if step.Attr.ID != "attr-1" {
		t.Errorf("got attr ID %q, want %q", step.Attr.ID, "attr-1")
	}
}

func TestParseTxStepRetractTriple(t *testing.T) {
	raw := json.RawMessage(`["retract-triple", "entity-1", "attr-1", "hello"]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "retract-triple" {
		t.Errorf("got op %q, want %q", step.Op, "retract-triple")
	}
}

func TestParseTxStepDeepMerge(t *testing.T) {
	raw := json.RawMessage(`["deep-merge-triple", "entity-1", "attr-1", {"name": "Alice"}]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "deep-merge-triple" {
		t.Errorf("got op %q, want %q", step.Op, "deep-merge-triple")
	}
}

func TestParseTxStepDeleteAttr(t *testing.T) {
	raw := json.RawMessage(`["delete-attr", "attr-1"]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "delete-attr" {
		t.Errorf("got op %q, want %q", step.Op, "delete-attr")
	}
	if step.AttrID != "attr-1" {
		t.Errorf("got attr-id %q, want %q", step.AttrID, "attr-1")
	}
}

func TestParseTxStepInvalid(t *testing.T) {
	_, err := ParseTxStep(json.RawMessage(`"not-an-array"`))
	if err == nil {
		t.Error("expected error for non-array")
	}

	_, err = ParseTxStep(json.RawMessage(`[]`))
	if err == nil {
		t.Error("expected error for empty array")
	}
}

func TestProcessTransactionAddTriple(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	txp := NewTxProcessor(db)

	steps := []json.RawMessage{
		json.RawMessage(`["add-triple", "user-4", "attr-users-name", "Diana"]`),
	}

	result, err := txp.ProcessTransaction(context.Background(), appID, steps, attrs)
	if err != nil {
		t.Fatal(err)
	}
	if result == nil {
		t.Fatal("expected result")
	}

	// Verify the triple was inserted
	triples, _ := db.GetTriplesByEntity(context.Background(), appID, "user-4")
	found := false
	for _, tr := range triples {
		if tr.AttrID == "attr-users-name" {
			var val string
			json.Unmarshal(tr.Value, &val)
			if val == "Diana" {
				found = true
			}
		}
	}
	if !found {
		t.Error("expected to find Diana triple")
	}
}

func TestProcessTransactionDeleteEntity(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	txp := NewTxProcessor(db)

	// Verify user-1 exists
	triples, _ := db.GetTriplesByEntity(context.Background(), appID, "user-1")
	if len(triples) == 0 {
		t.Fatal("expected user-1 to exist")
	}

	steps := []json.RawMessage{
		json.RawMessage(`["delete-entity", "user-1", "users"]`),
	}

	_, err := txp.ProcessTransaction(context.Background(), appID, steps, attrs)
	if err != nil {
		t.Fatal(err)
	}

	// Verify user-1 is gone
	triples, _ = db.GetTriplesByEntity(context.Background(), appID, "user-1")
	if len(triples) != 0 {
		t.Errorf("expected 0 triples for deleted entity, got %d", len(triples))
	}
}

func TestProcessTransactionAddAttr(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	txp := NewTxProcessor(db)

	steps := []json.RawMessage{
		json.RawMessage(`["add-attr", {"id": "attr-users-phone", "forward-identity": ["fi-phone", "users", "phone"], "value-type": "blob", "cardinality": "one", "unique?": false, "index?": false}]`),
	}

	_, err := txp.ProcessTransaction(context.Background(), appID, steps, attrs)
	if err != nil {
		t.Fatal(err)
	}

	// Verify the attr was created
	newAttrs, _ := db.GetAttrsByAppID(context.Background(), appID)
	found := false
	for _, a := range newAttrs {
		if a.ID == "attr-users-phone" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find phone attr")
	}
}
