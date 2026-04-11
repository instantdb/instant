package engine

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

func TestCheckPermissionLiterals(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{UserID: "user-1", UserEmail: "alice@example.com"}

	tests := []struct {
		rule    string
		allowed bool
	}{
		{"true", true},
		{"false", false},
		{"", true},
	}

	for _, tt := range tests {
		result := pe.CheckPermission(ctx, tt.rule, permCtx, "users", "view", nil)
		if result.Allowed != tt.allowed {
			t.Errorf("rule %q: got %v, want %v", tt.rule, result.Allowed, tt.allowed)
		}
	}
}

func TestCheckPermissionAdmin(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{IsAdmin: true}

	result := pe.CheckPermission(ctx, "false", permCtx, "users", "view", nil)
	if !result.Allowed {
		t.Error("admin should always be allowed")
	}
}

func TestCheckPermissionAuthCheck(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()

	// Authenticated user
	result := pe.CheckPermission(ctx, "auth.id != null", &PermContext{UserID: "user-1"}, "users", "create", nil)
	if !result.Allowed {
		t.Error("expected allowed for authenticated user")
	}

	// Unauthenticated user
	result = pe.CheckPermission(ctx, "auth.id != null", &PermContext{}, "users", "create", nil)
	if result.Allowed {
		t.Error("expected denied for unauthenticated user")
	}
}

func TestCheckPermissionDataComparison(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()

	data := map[string]interface{}{"creatorId": "user-1"}

	result := pe.CheckPermission(ctx, "data.creatorId == auth.id", &PermContext{UserID: "user-1"}, "posts", "update", data)
	if !result.Allowed {
		t.Error("expected allowed when creator matches auth")
	}

	result = pe.CheckPermission(ctx, "data.creatorId == auth.id", &PermContext{UserID: "user-2"}, "posts", "update", data)
	if result.Allowed {
		t.Error("expected denied when creator doesn't match auth")
	}
}

func TestCheckPermissionLogicalOps(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{UserID: "user-1"}

	// AND
	result := pe.CheckPermission(ctx, "auth.id != null && true", permCtx, "users", "view", nil)
	if !result.Allowed {
		t.Error("expected allowed for true && true")
	}

	result = pe.CheckPermission(ctx, "auth.id != null && false", permCtx, "users", "view", nil)
	if result.Allowed {
		t.Error("expected denied for true && false")
	}

	// OR
	result = pe.CheckPermission(ctx, "false || auth.id != null", permCtx, "users", "view", nil)
	if !result.Allowed {
		t.Error("expected allowed for false || true")
	}
}

func TestCheckPermissionEqualityWithStrings(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()
	permCtx := &PermContext{UserID: "user-1", UserEmail: "alice@example.com"}

	result := pe.CheckPermission(ctx, "auth.email == 'alice@example.com'", permCtx, "users", "view", nil)
	if !result.Allowed {
		t.Error("expected allowed for matching email")
	}

	result = pe.CheckPermission(ctx, "auth.email == 'bob@example.com'", permCtx, "users", "view", nil)
	if result.Allowed {
		t.Error("expected denied for non-matching email")
	}
}

func TestEvalRules(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()

	rules := &storage.Rule{
		Code: json.RawMessage(`{"users":{"allow":{"view":"true","create":"auth.id != null","delete":"false"}}}`),
	}

	// View allowed
	result := pe.EvalRules(ctx, &PermContext{UserID: "user-1"}, rules, "users", "view", nil)
	if !result.Allowed {
		t.Error("view should be allowed")
	}

	// Create allowed for authenticated
	result = pe.EvalRules(ctx, &PermContext{UserID: "user-1"}, rules, "users", "create", nil)
	if !result.Allowed {
		t.Error("create should be allowed for authenticated")
	}

	// Create denied for unauthenticated
	result = pe.EvalRules(ctx, &PermContext{}, rules, "users", "create", nil)
	if result.Allowed {
		t.Error("create should be denied for unauthenticated")
	}

	// Delete always denied
	result = pe.EvalRules(ctx, &PermContext{UserID: "user-1"}, rules, "users", "delete", nil)
	if result.Allowed {
		t.Error("delete should be denied")
	}

	// No rules for this etype = allowed
	result = pe.EvalRules(ctx, &PermContext{UserID: "user-1"}, rules, "posts", "view", nil)
	if !result.Allowed {
		t.Error("no rules for etype should allow")
	}

	// Nil rules = allowed
	result = pe.EvalRules(ctx, &PermContext{}, nil, "users", "view", nil)
	if !result.Allowed {
		t.Error("nil rules should allow")
	}
}
