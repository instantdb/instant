package engine

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

func TestParseWhereWithAnd(t *testing.T) {
	raw := json.RawMessage(`{"$and": [{"name": "Alice"}, {"age": {"$gt": 25}}]}`)
	clauses, err := parseWhere(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(clauses) < 2 {
		t.Errorf("expected at least 2 clauses from $and, got %d", len(clauses))
	}
}

func TestParseWhereWithOr(t *testing.T) {
	raw := json.RawMessage(`{"$or": [{"name": "Alice"}, {"name": "Bob"}]}`)
	clauses, err := parseWhere(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(clauses) < 2 {
		t.Errorf("expected at least 2 clauses from $or, got %d", len(clauses))
	}
	// $or clauses should have the "$or:" prefix on their Op
	hasOrPrefix := false
	for _, c := range clauses {
		if len(c.Op) >= 4 && c.Op[:4] == "$or:" {
			hasOrPrefix = true
		}
	}
	if !hasOrPrefix {
		t.Error("expected $or: prefix on ops")
	}
}

func TestParseWhereWithDottedPath(t *testing.T) {
	raw := json.RawMessage(`{"author.name": "Alice"}`)
	clauses, err := parseWhere(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(clauses) != 1 {
		t.Fatalf("expected 1 clause, got %d", len(clauses))
	}
	if len(clauses[0].Path) != 2 || clauses[0].Path[0] != "author" || clauses[0].Path[1] != "name" {
		t.Errorf("expected path [author, name], got %v", clauses[0].Path)
	}
}

func TestFieldPermissions(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{UserID: "user-1", UserEmail: "alice@example.com"}

	rules := &storage.Rule{
		Code: json.RawMessage(`{"users":{"allow":{"fields":{"email":"auth.id != null","ssn":"false"}}}}`),
	}

	data := map[string]interface{}{"email": "alice@example.com", "ssn": "123-45-6789"}

	hidden := pe.EvalFieldPermissions(ctx, permCtx, rules, "users", data)
	if hidden == nil {
		t.Fatal("expected field permissions result")
	}

	// email should be visible (auth.id != null and user is authenticated)
	if hidden["email"] {
		t.Error("email should be visible for authenticated user")
	}

	// ssn should be hidden (rule is "false")
	if !hidden["ssn"] {
		t.Error("ssn should be hidden")
	}
}

func TestFieldPermissionsAdmin(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	adminCtx := &PermContext{IsAdmin: true}

	rules := &storage.Rule{
		Code: json.RawMessage(`{"users":{"allow":{"fields":{"ssn":"false"}}}}`),
	}

	hidden := pe.EvalFieldPermissions(ctx, adminCtx, rules, "users", nil)
	if hidden != nil {
		t.Error("admin should see all fields")
	}
}

func TestRequestContext(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{
		UserID:        "user-1",
		RequestTime:   1700000000000,
		RequestOrigin: "https://example.com",
		RequestIP:     "192.168.1.1",
	}

	// Test request.origin access
	result := pe.CheckPermission(ctx, "request.origin == 'https://example.com'", permCtx, "test", "view", nil)
	if !result.Allowed {
		t.Error("expected allowed for matching origin")
	}

	result = pe.CheckPermission(ctx, "request.origin == 'https://evil.com'", permCtx, "test", "view", nil)
	if result.Allowed {
		t.Error("expected denied for non-matching origin")
	}
}

func TestParseTxStepRestoreAttr(t *testing.T) {
	raw := json.RawMessage(`["restore-attr", "attr-1"]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "restore-attr" {
		t.Errorf("got op %q, want %q", step.Op, "restore-attr")
	}
}

func TestParseTxStepRuleParams(t *testing.T) {
	raw := json.RawMessage(`["rule-params", "entity-1", "users", {"shareToken": "abc123"}]`)
	step, err := ParseTxStep(raw)
	if err != nil {
		t.Fatal(err)
	}
	if step.Op != "rule-params" {
		t.Errorf("got op %q, want %q", step.Op, "rule-params")
	}
	if step.Etype != "users" {
		t.Errorf("got etype %q, want %q", step.Etype, "users")
	}
}

