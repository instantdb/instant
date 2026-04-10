package engine

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

func tempDB(t *testing.T) *storage.DB {
	t.Helper()
	f, err := os.CreateTemp("", "instant-engine-test-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, err := storage.Open(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func setupTestData(t *testing.T, db *storage.DB) ([]*storage.Attr, string) {
	t.Helper()
	ctx := context.Background()
	appID := "test-app-001"

	app := &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	// Create attrs
	idAttr := &storage.Attr{
		ID: "attr-users-id", AppID: appID,
		ForwardIdentity: [3]string{"fi-users-id", "users", "id"},
		ValueType: "blob", Cardinality: "one", IsIndex: true, IsUnique: true,
	}
	nameAttr := &storage.Attr{
		ID: "attr-users-name", AppID: appID,
		ForwardIdentity: [3]string{"fi-users-name", "users", "name"},
		ValueType: "blob", Cardinality: "one",
	}
	ageAttr := &storage.Attr{
		ID: "attr-users-age", AppID: appID,
		ForwardIdentity: [3]string{"fi-users-age", "users", "age"},
		ValueType: "blob", Cardinality: "one", IsIndex: true,
	}

	for _, a := range []*storage.Attr{idAttr, nameAttr, ageAttr} {
		db.CreateAttr(ctx, a)
	}

	// Insert test data
	users := []struct {
		id, name string
		age      int
	}{
		{"user-1", "Alice", 30},
		{"user-2", "Bob", 25},
		{"user-3", "Charlie", 35},
	}

	for _, u := range users {
		db.InsertTriple(ctx, appID, &storage.Triple{
			EntityID: u.id, AttrID: idAttr.ID, Value: storage.JSONValue(u.id),
		}, idAttr)
		db.InsertTriple(ctx, appID, &storage.Triple{
			EntityID: u.id, AttrID: nameAttr.ID, Value: storage.JSONValue(u.name),
		}, nameAttr)
		db.InsertTriple(ctx, appID, &storage.Triple{
			EntityID: u.id, AttrID: ageAttr.ID, Value: storage.JSONValue(u.age),
		}, ageAttr)
	}

	attrs, _ := db.GetAttrsByAppID(ctx, appID)
	return attrs, appID
}

func TestParseInstaQL(t *testing.T) {
	query := json.RawMessage(`{"users": {}}`)
	forms, err := ParseInstaQL(query)
	if err != nil {
		t.Fatal(err)
	}
	if len(forms) != 1 {
		t.Fatalf("expected 1 form, got %d", len(forms))
	}
	if forms[0].Etype != "users" {
		t.Errorf("got etype %q, want %q", forms[0].Etype, "users")
	}
}

func TestParseInstaQLWithWhere(t *testing.T) {
	query := json.RawMessage(`{"users": {"$": {"where": {"name": "Alice"}}}}`)
	forms, err := ParseInstaQL(query)
	if err != nil {
		t.Fatal(err)
	}
	if len(forms) != 1 {
		t.Fatalf("expected 1 form, got %d", len(forms))
	}
	if len(forms[0].Options.Where) != 1 {
		t.Fatalf("expected 1 where clause, got %d", len(forms[0].Options.Where))
	}
	if forms[0].Options.Where[0].Path[0] != "name" {
		t.Errorf("got where path %v, want [name]", forms[0].Options.Where[0].Path)
	}
}

func TestParseInstaQLWithChildren(t *testing.T) {
	query := json.RawMessage(`{"users": {"posts": {}}}`)
	forms, err := ParseInstaQL(query)
	if err != nil {
		t.Fatal(err)
	}
	if len(forms[0].Children) != 1 {
		t.Fatalf("expected 1 child, got %d", len(forms[0].Children))
	}
	if forms[0].Children[0].Etype != "posts" {
		t.Errorf("got child etype %q, want %q", forms[0].Children[0].Etype, "posts")
	}
}

func TestParseInstaQLWithLimit(t *testing.T) {
	query := json.RawMessage(`{"users": {"$": {"limit": 10}}}`)
	forms, err := ParseInstaQL(query)
	if err != nil {
		t.Fatal(err)
	}
	if forms[0].Options.Limit == nil || *forms[0].Options.Limit != 10 {
		t.Error("expected limit=10")
	}
}

func TestParseInstaQLWithOrder(t *testing.T) {
	query := json.RawMessage(`{"users": {"$": {"order": {"k": "name", "direction": "desc"}}}}`)
	forms, err := ParseInstaQL(query)
	if err != nil {
		t.Fatal(err)
	}
	if forms[0].Options.Order == nil {
		t.Fatal("expected order clause")
	}
	if forms[0].Options.Order.Key != "name" {
		t.Errorf("got order key %q, want %q", forms[0].Options.Order.Key, "name")
	}
	if forms[0].Options.Order.Direction != "desc" {
		t.Errorf("got direction %q, want %q", forms[0].Options.Order.Direction, "desc")
	}
}

func TestExecuteQueryBasic(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"users": {}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	users, ok := result.Data["users"].([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map, got %T", result.Data["users"])
	}
	if len(users) != 3 {
		t.Errorf("expected 3 users, got %d", len(users))
	}
}

func TestExecuteQueryWithWhereFilter(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"users": {"$": {"where": {"name": "Alice"}}}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	users, ok := result.Data["users"].([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map, got %T", result.Data["users"])
	}
	if len(users) != 1 {
		t.Errorf("expected 1 user, got %d", len(users))
	}
	if len(users) > 0 {
		if users[0]["name"] != "Alice" {
			t.Errorf("got name %v, want Alice", users[0]["name"])
		}
	}
}

func TestExecuteQueryWithLimit(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"users": {"$": {"limit": 2}}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	users, ok := result.Data["users"].([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map, got %T", result.Data["users"])
	}
	if len(users) != 2 {
		t.Errorf("expected 2 users, got %d", len(users))
	}
}

func TestExecuteQueryEmptyResult(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"users": {"$": {"where": {"name": "Nonexistent"}}}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	users, ok := result.Data["users"].([]map[string]interface{})
	if !ok {
		t.Fatalf("expected []map, got %T", result.Data["users"])
	}
	if len(users) != 0 {
		t.Errorf("expected 0 users, got %d", len(users))
	}
}

func TestExecuteQueryNonexistentEtype(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"nonexistent": {}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	items := result.Data["nonexistent"]
	if items == nil {
		t.Fatal("expected empty result, got nil")
	}
}

func TestExecuteQueryTopics(t *testing.T) {
	db := tempDB(t)
	attrs, appID := setupTestData(t, db)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"users": {}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}

	if len(result.Topics) == 0 {
		t.Error("expected at least 1 topic for invalidation")
	}
}
