package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"testing"
	"time"
)

func tempDB(t *testing.T) *DB {
	t.Helper()
	f, err := os.CreateTemp("", "instant-test-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, err := Open(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func createTestApp(t *testing.T, db *DB) *App {
	t.Helper()
	app := &App{
		ID:         "test-app-001",
		Title:      "Test App",
		CreatorID:  "creator-001",
		AdminToken: "admin-token-001",
		CreatedAt:  time.Now(),
	}
	if err := db.CreateApp(context.Background(), app); err != nil {
		t.Fatal(err)
	}
	return app
}

func createTestAttr(t *testing.T, db *DB, appID, etype, label, valType, cardinality string, isIndex, isUnique bool) *Attr {
	t.Helper()
	attr := &Attr{
		ID:              "attr-" + etype + "-" + label,
		AppID:           appID,
		ForwardIdentity: [3]string{"fwd-" + etype + "-" + label, etype, label},
		ValueType:       valType,
		Cardinality:     cardinality,
		IsIndex:         isIndex,
		IsUnique:        isUnique,
	}
	if err := db.CreateAttr(context.Background(), attr); err != nil {
		t.Fatal(err)
	}
	return attr
}

// ---- App tests ----

func TestCreateAndGetApp(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	got, err := db.GetApp(context.Background(), app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected app, got nil")
	}
	if got.ID != app.ID {
		t.Errorf("got ID %q, want %q", got.ID, app.ID)
	}
	if got.Title != app.Title {
		t.Errorf("got title %q, want %q", got.Title, app.Title)
	}
	if got.AdminToken != app.AdminToken {
		t.Errorf("got admin token %q, want %q", got.AdminToken, app.AdminToken)
	}
}

func TestGetAppNotFound(t *testing.T) {
	db := tempDB(t)
	got, err := db.GetApp(context.Background(), "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Errorf("expected nil, got %+v", got)
	}
}

func TestDeleteApp(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	if err := db.DeleteApp(context.Background(), app.ID); err != nil {
		t.Fatal(err)
	}

	got, _ := db.GetApp(context.Background(), app.ID)
	if got != nil {
		t.Error("expected nil after delete")
	}
}

// ---- Attr tests ----

func TestCreateAndGetAttrs(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	attr1 := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)
	attr2 := createTestAttr(t, db, app.ID, "users", "email", "blob", "one", true, true)

	attrs, err := db.GetAttrsByAppID(context.Background(), app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(attrs) != 2 {
		t.Fatalf("expected 2 attrs, got %d", len(attrs))
	}

	got, err := db.GetAttrByID(context.Background(), attr1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.FwdEtype() != "users" {
		t.Errorf("got etype %q, want %q", got.FwdEtype(), "users")
	}
	if got.FwdLabel() != "name" {
		t.Errorf("got label %q, want %q", got.FwdLabel(), "name")
	}

	got2, _ := db.GetAttrByID(context.Background(), attr2.ID)
	if !got2.IsUnique {
		t.Error("expected unique attr")
	}
	if !got2.IsIndex {
		t.Error("expected indexed attr")
	}
}

func TestUpdateAttr(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	attr.IsIndex = true
	if err := db.UpdateAttr(context.Background(), attr); err != nil {
		t.Fatal(err)
	}

	got, _ := db.GetAttrByID(context.Background(), attr.ID)
	if !got.IsIndex {
		t.Error("expected indexed after update")
	}
}

func TestDeleteAttr(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	if err := db.DeleteAttr(context.Background(), attr.ID); err != nil {
		t.Fatal(err)
	}

	got, _ := db.GetAttrByID(context.Background(), attr.ID)
	if got != nil {
		t.Error("expected nil after delete")
	}
}

// ---- Triple tests ----

func TestInsertAndGetTriple(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	triple := &Triple{
		EntityID: "entity-001",
		AttrID:   attr.ID,
		Value:    json.RawMessage(`"Alice"`),
	}
	if err := db.InsertTriple(context.Background(), app.ID, triple, attr); err != nil {
		t.Fatal(err)
	}

	triples, err := db.GetTriplesByEntity(context.Background(), app.ID, "entity-001")
	if err != nil {
		t.Fatal(err)
	}
	if len(triples) != 1 {
		t.Fatalf("expected 1 triple, got %d", len(triples))
	}

	var val string
	json.Unmarshal(triples[0].Value, &val)
	if val != "Alice" {
		t.Errorf("got value %q, want %q", val, "Alice")
	}
}

func TestUpsertTriple(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	triple1 := &Triple{EntityID: "entity-001", AttrID: attr.ID, Value: json.RawMessage(`"Alice"`)}
	triple2 := &Triple{EntityID: "entity-001", AttrID: attr.ID, Value: json.RawMessage(`"Bob"`)}

	db.InsertTriple(context.Background(), app.ID, triple1, attr)
	db.InsertTriple(context.Background(), app.ID, triple2, attr)

	triples, _ := db.GetTriplesByEntity(context.Background(), app.ID, "entity-001")
	// With different values and md5, both should exist (cardinality-one retraction happens in tx processor)
	if len(triples) < 1 {
		t.Fatalf("expected at least 1 triple, got %d", len(triples))
	}
}

func TestDeleteTriple(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	value := json.RawMessage(`"Alice"`)
	triple := &Triple{EntityID: "entity-001", AttrID: attr.ID, Value: value}
	db.InsertTriple(context.Background(), app.ID, triple, attr)

	if err := db.DeleteTriple(context.Background(), app.ID, "entity-001", attr.ID, value); err != nil {
		t.Fatal(err)
	}

	triples, _ := db.GetTriplesByEntity(context.Background(), app.ID, "entity-001")
	if len(triples) != 0 {
		t.Errorf("expected 0 triples after delete, got %d", len(triples))
	}
}

func TestDeleteEntityTriples(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	nameAttr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)
	emailAttr := createTestAttr(t, db, app.ID, "users", "email", "blob", "one", true, true)

	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e1", AttrID: nameAttr.ID, Value: json.RawMessage(`"Alice"`)}, nameAttr)
	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e1", AttrID: emailAttr.ID, Value: json.RawMessage(`"alice@example.com"`)}, emailAttr)

	if err := db.DeleteEntityTriples(context.Background(), app.ID, "e1"); err != nil {
		t.Fatal(err)
	}

	triples, _ := db.GetTriplesByEntity(context.Background(), app.ID, "e1")
	if len(triples) != 0 {
		t.Errorf("expected 0, got %d", len(triples))
	}
}

func TestGetTriplesByAttr(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e1", AttrID: attr.ID, Value: json.RawMessage(`"Alice"`)}, attr)
	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e2", AttrID: attr.ID, Value: json.RawMessage(`"Bob"`)}, attr)

	triples, err := db.GetTriplesByAttr(context.Background(), app.ID, attr.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(triples) != 2 {
		t.Errorf("expected 2, got %d", len(triples))
	}
}

func TestLookupEntityByUniqueAttr(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "email", "blob", "one", true, true)

	value := json.RawMessage(`"alice@example.com"`)
	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e1", AttrID: attr.ID, Value: value}, attr)

	eid, err := db.LookupEntityByUniqueAttr(context.Background(), app.ID, attr.ID, value)
	if err != nil {
		t.Fatal(err)
	}
	if eid != "e1" {
		t.Errorf("got %q, want %q", eid, "e1")
	}
}

// ---- AppUser tests ----

func TestCreateAndGetAppUser(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	user := &AppUser{
		ID:           "user-001",
		AppID:        app.ID,
		Email:        "alice@example.com",
		RefreshToken: "token-001",
	}
	if err := db.CreateAppUser(context.Background(), user); err != nil {
		t.Fatal(err)
	}

	got, err := db.GetAppUserByEmail(context.Background(), app.ID, "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected user")
	}
	if got.ID != "user-001" {
		t.Errorf("got ID %q, want %q", got.ID, "user-001")
	}

	gotByToken, _ := db.GetAppUserByRefreshToken(context.Background(), app.ID, "token-001")
	if gotByToken == nil || gotByToken.ID != "user-001" {
		t.Error("expected to find user by refresh token")
	}

	gotByID, _ := db.GetAppUserByID(context.Background(), "user-001")
	if gotByID == nil || gotByID.Email != "alice@example.com" {
		t.Error("expected to find user by ID")
	}
}

func TestDeleteAppUser(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	user := &AppUser{ID: "user-001", AppID: app.ID, Email: "alice@example.com", RefreshToken: "t1"}
	db.CreateAppUser(context.Background(), user)

	if err := db.DeleteAppUser(context.Background(), app.ID, "user-001"); err != nil {
		t.Fatal(err)
	}

	got, _ := db.GetAppUserByID(context.Background(), "user-001")
	if got != nil {
		t.Error("expected nil after delete")
	}
}

// ---- Rules tests ----

func TestSetAndGetRules(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	code := json.RawMessage(`{"users":{"allow":{"view":"true","create":"auth.id != null"}}}`)
	if err := db.SetRules(context.Background(), app.ID, code); err != nil {
		t.Fatal(err)
	}

	rule, err := db.GetRules(context.Background(), app.ID)
	if err != nil {
		t.Fatal(err)
	}
	if rule == nil {
		t.Fatal("expected rules")
	}

	var ruleMap map[string]interface{}
	json.Unmarshal(rule.Code, &ruleMap)
	if _, ok := ruleMap["users"]; !ok {
		t.Error("expected 'users' key in rules")
	}
}

// ---- Changelog tests ----

func TestChangelog(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	// Insert a triple (triggers changelog)
	db.InsertTriple(context.Background(), app.ID, &Triple{EntityID: "e1", AttrID: attr.ID, Value: json.RawMessage(`"Alice"`)}, attr)

	entries, err := db.GetChangesSince(context.Background(), app.ID, 0, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) < 1 {
		t.Fatal("expected at least 1 changelog entry")
	}
	if entries[0].Action != "insert" {
		t.Errorf("got action %q, want %q", entries[0].Action, "insert")
	}
}

func TestChangelogSubscription(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)

	ch := db.SubscribeChanges()
	defer db.UnsubscribeChanges(ch)

	entry := ChangelogEntry{AppID: app.ID, EntityID: "e1", AttrID: "a1", Action: "insert"}
	db.NotifyChange(entry)

	select {
	case got := <-ch:
		if got.EntityID != "e1" {
			t.Errorf("got entity %q, want %q", got.EntityID, "e1")
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for changelog notification")
	}
}

// ---- DeepMerge tests ----

func TestDeepMerge(t *testing.T) {
	a := json.RawMessage(`{"name":"Alice","age":30}`)
	b := json.RawMessage(`{"name":"Bob","city":"NYC"}`)
	result := DeepMerge(a, b)

	var m map[string]interface{}
	json.Unmarshal(result, &m)

	if m["name"] != "Bob" {
		t.Errorf("expected name=Bob, got %v", m["name"])
	}
	if m["city"] != "NYC" {
		t.Errorf("expected city=NYC, got %v", m["city"])
	}
	if m["age"] != float64(30) {
		t.Errorf("expected age=30, got %v", m["age"])
	}
}

func TestDeepMergeNested(t *testing.T) {
	a := json.RawMessage(`{"profile":{"name":"Alice","settings":{"theme":"dark"}}}`)
	b := json.RawMessage(`{"profile":{"settings":{"lang":"en"}}}`)
	result := DeepMerge(a, b)

	var m map[string]json.RawMessage
	json.Unmarshal(result, &m)

	var profile map[string]json.RawMessage
	json.Unmarshal(m["profile"], &profile)

	var settings map[string]string
	json.Unmarshal(profile["settings"], &settings)

	if settings["theme"] != "dark" {
		t.Errorf("expected theme=dark, got %v", settings["theme"])
	}
	if settings["lang"] != "en" {
		t.Errorf("expected lang=en, got %v", settings["lang"])
	}
}

// ---- IndexFlags tests ----

func TestIndexFlags(t *testing.T) {
	// Blob attr, no index
	blobAttr := &Attr{ValueType: "blob"}
	ea, eav, av, ave, vae := IndexFlags(blobAttr)
	if !ea {
		t.Error("ea should be true for all")
	}
	if eav || av || ave || vae {
		t.Error("non-indexed blob should only have ea")
	}

	// Ref attr
	refAttr := &Attr{ValueType: "ref"}
	ea, eav, _, _, vae = IndexFlags(refAttr)
	if !ea || !eav || !vae {
		t.Error("ref attr should have ea, eav, vae")
	}

	// Indexed attr
	idxAttr := &Attr{ValueType: "blob", IsIndex: true}
	_, eav, av, ave, _ = IndexFlags(idxAttr)
	if !eav || !av || !ave {
		t.Error("indexed attr should have eav, av, ave")
	}
}

// ---- Helper tests ----

func TestBuildAttrMap(t *testing.T) {
	attrs := []*Attr{
		{ID: "a1", ForwardIdentity: [3]string{"", "users", "name"}},
		{ID: "a2", ForwardIdentity: [3]string{"", "users", "email"}},
	}
	m := BuildAttrMap(attrs)
	if len(m) != 2 {
		t.Errorf("expected 2, got %d", len(m))
	}
	if m["a1"].FwdLabel() != "name" {
		t.Error("expected name")
	}
}

func TestSeekAttrByFwdIdent(t *testing.T) {
	attrs := []*Attr{
		{ID: "a1", ForwardIdentity: [3]string{"", "users", "name"}},
		{ID: "a2", ForwardIdentity: [3]string{"", "users", "email"}},
	}
	got := SeekAttrByFwdIdent(attrs, "users", "email")
	if got == nil || got.ID != "a2" {
		t.Error("expected to find email attr")
	}

	got = SeekAttrByFwdIdent(attrs, "users", "nonexistent")
	if got != nil {
		t.Error("expected nil for nonexistent")
	}
}

func TestSeekAttrByRevIdent(t *testing.T) {
	attrs := []*Attr{
		{ID: "a1", ReverseIdentity: [3]string{"", "posts", "author"}},
	}
	got := SeekAttrByRevIdent(attrs, "posts", "author")
	if got == nil {
		t.Error("expected to find reverse attr")
	}
}

// ---- Transaction tests ----

func TestExecTx(t *testing.T) {
	db := tempDB(t)
	app := createTestApp(t, db)
	attr := createTestAttr(t, db, app.ID, "users", "name", "blob", "one", false, false)

	err := db.ExecTx(context.Background(), func(tx *sqlTx) error {
		_, err := tx.ExecContext(context.Background(),
			`INSERT INTO triples(app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at)
			 VALUES (?, ?, ?, ?, ?, 1, 0, 0, 0, 0, 0)`,
			app.ID, "e1", attr.ID, `"test"`, "abc")
		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	triples, _ := db.GetTriplesByEntity(context.Background(), app.ID, "e1")
	if len(triples) != 1 {
		t.Errorf("expected 1, got %d", len(triples))
	}
}

type sqlTx = sql.Tx
