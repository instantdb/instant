package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

// ---- Cursor Pagination Tests ----

func setupPaginationData(t *testing.T) (*storage.DB, []*storage.Attr, string) {
	t.Helper()
	f, _ := os.CreateTemp("", "instant-pagination-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })
	db, _ := storage.Open(f.Name())
	t.Cleanup(func() { db.Close() })

	ctx := context.Background()
	appID := "pag-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	idAttr := &storage.Attr{ID: "a-id", AppID: appID, ForwardIdentity: [3]string{"f-id", "items", "id"}, ValueType: "blob", Cardinality: "one", IsIndex: true, IsUnique: true}
	nameAttr := &storage.Attr{ID: "a-name", AppID: appID, ForwardIdentity: [3]string{"f-name", "items", "name"}, ValueType: "blob", Cardinality: "one", IsIndex: true}
	db.CreateAttr(ctx, idAttr)
	db.CreateAttr(ctx, nameAttr)

	// Insert 10 items
	for i := 0; i < 10; i++ {
		eid := jsonf("item-%02d", i)
		db.InsertTriple(ctx, appID, &storage.Triple{EntityID: eid, AttrID: idAttr.ID, Value: storage.JSONValue(eid)}, idAttr)
		db.InsertTriple(ctx, appID, &storage.Triple{EntityID: eid, AttrID: nameAttr.ID, Value: storage.JSONValue(jsonf("Name %02d", i))}, nameAttr)
	}

	attrs, _ := db.GetAttrsByAppID(ctx, appID)
	return db, attrs, appID
}

func jsonf(format string, args ...interface{}) string {
	return fmt.Sprintf(format, args...)
}

func TestCursorPaginationFirst(t *testing.T) {
	db, attrs, appID := setupPaginationData(t)
	qe := NewQueryEngine(db)

	// First 3 items
	query := json.RawMessage(`{"items": {"$": {"first": 3}}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}
	items := result.Data["items"].([]map[string]interface{})
	if len(items) != 3 {
		t.Errorf("expected 3 items, got %d", len(items))
	}

	// PageInfo should exist
	if result.PageInfo == nil {
		t.Fatal("expected pageInfo")
	}
	pi := result.PageInfo["items"]
	if pi == nil {
		t.Fatal("expected pageInfo for items")
	}
	if !pi.HasNextPage {
		t.Error("expected hasNextPage=true")
	}
	if pi.EndCursor == nil {
		t.Error("expected endCursor")
	}
}

func TestCursorPaginationAfter(t *testing.T) {
	db, attrs, appID := setupPaginationData(t)
	qe := NewQueryEngine(db)

	// Get first page
	q1 := json.RawMessage(`{"items": {"$": {"first": 3}}}`)
	r1, _ := qe.ExecuteQuery(context.Background(), appID, q1, attrs)
	pi1 := r1.PageInfo["items"]

	if pi1 == nil || pi1.EndCursor == nil {
		t.Fatal("need endCursor from first page")
	}

	// Get next page using after cursor
	cursorJSON, _ := json.Marshal(pi1.EndCursor)
	q2 := json.RawMessage(`{"items": {"$": {"first": 3, "after": ` + string(cursorJSON) + `}}}`)
	r2, err := qe.ExecuteQuery(context.Background(), appID, q2, attrs)
	if err != nil {
		t.Fatal(err)
	}
	items := r2.Data["items"].([]map[string]interface{})
	if len(items) != 3 {
		t.Errorf("expected 3 items on page 2, got %d", len(items))
	}
}

func TestCursorPaginationLast(t *testing.T) {
	db, attrs, appID := setupPaginationData(t)
	qe := NewQueryEngine(db)

	query := json.RawMessage(`{"items": {"$": {"last": 3}}}`)
	result, err := qe.ExecuteQuery(context.Background(), appID, query, attrs)
	if err != nil {
		t.Fatal(err)
	}
	items := result.Data["items"].([]map[string]interface{})
	if len(items) != 3 {
		t.Errorf("expected 3 items, got %d", len(items))
	}
	pi := result.PageInfo["items"]
	if pi == nil || !pi.HasPreviousPage {
		t.Error("expected hasPreviousPage=true")
	}
}

// ---- data.ref() / auth.ref() Tests ----

func TestDataRef(t *testing.T) {
	pe, _ := NewPermissionEngine(nil, nil)
	ctx := context.Background()

	// Simulate data.ref("owner") resolving to the linked entity's data
	permCtx := &PermContext{UserID: "user-1"}
	data := map[string]interface{}{
		"creatorId": "user-1",
		"_refs": map[string]interface{}{
			"owner": map[string]interface{}{
				"id":    "user-1",
				"email": "alice@example.com",
			},
		},
	}

	// data.ref should resolve via _refs map
	result := pe.CheckPermission(ctx, "data._refs.owner.id == auth.id", permCtx, "posts", "view", data)
	if !result.Allowed {
		t.Error("expected allowed when data.ref matches auth.id")
	}
}

// ---- Storage Tests ----

func TestStorageMigration(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-storage-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, err := storage.Open(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	appID := "storage-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	// Files table should exist after migration
	_, err = db.RawDB().ExecContext(ctx,
		`INSERT INTO files(id, app_id, path, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)`,
		"file-1", appID, "photos/test.jpg", "image/jpeg", 1024)
	if err != nil {
		t.Fatalf("files table should exist: %v", err)
	}
}

func TestStorageUploadAndQuery(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-storage-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, err := storage.Open(f.Name())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx := context.Background()
	appID := "storage-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	// Upload a file
	file := &storage.FileRecord{
		ID:          "file-1",
		AppID:       appID,
		Path:        "photos/test.jpg",
		ContentType: "image/jpeg",
		SizeBytes:   1024,
	}
	err = db.CreateFile(ctx, file)
	if err != nil {
		t.Fatal(err)
	}

	// Query files
	files, err := db.GetFilesByAppID(ctx, appID)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d", len(files))
	}
	if files[0].Path != "photos/test.jpg" {
		t.Errorf("got path %q, want %q", files[0].Path, "photos/test.jpg")
	}
}

func TestStorageDelete(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-storage-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "storage-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	db.CreateFile(ctx, &storage.FileRecord{ID: "file-1", AppID: appID, Path: "test.jpg", ContentType: "image/jpeg", SizeBytes: 100})
	err := db.DeleteFile(ctx, appID, "file-1")
	if err != nil {
		t.Fatal(err)
	}

	files, _ := db.GetFilesByAppID(ctx, appID)
	if len(files) != 0 {
		t.Errorf("expected 0 files after delete, got %d", len(files))
	}
}

// ---- Stream Tests ----

func TestStreamCreateAndAppend(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-stream-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "stream-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	// Create stream
	stream := &storage.StreamRecord{
		ID:       "stream-1",
		AppID:    appID,
		ClientID: "client-1",
	}
	err := db.CreateStream(ctx, stream)
	if err != nil {
		t.Fatal(err)
	}

	// Append data
	err = db.AppendStreamData(ctx, "stream-1", []byte("Hello "))
	if err != nil {
		t.Fatal(err)
	}
	err = db.AppendStreamData(ctx, "stream-1", []byte("World"))
	if err != nil {
		t.Fatal(err)
	}

	// Read data
	data, err := db.GetStreamData(ctx, "stream-1", 0)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "Hello World" {
		t.Errorf("got %q, want %q", string(data), "Hello World")
	}
}

func TestStreamClose(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-stream-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "stream-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	db.CreateStream(ctx, &storage.StreamRecord{ID: "s1", AppID: appID, ClientID: "c1"})
	db.AppendStreamData(ctx, "s1", []byte("data"))
	db.CloseStream(ctx, "s1")

	stream, _ := db.GetStream(ctx, "s1")
	if stream == nil {
		t.Fatal("expected stream")
	}
	if !stream.Done {
		t.Error("expected stream to be done")
	}
}

func TestStreamReadWithOffset(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-stream-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "stream-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	db.CreateStream(ctx, &storage.StreamRecord{ID: "s1", AppID: appID, ClientID: "c1"})
	db.AppendStreamData(ctx, "s1", []byte("Hello World"))

	// Read from offset 6
	data, _ := db.GetStreamData(ctx, "s1", 6)
	if string(data) != "World" {
		t.Errorf("got %q, want %q", string(data), "World")
	}
}

// ---- Sync Table Tests ----

func TestSyncSubscription(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-sync-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "sync-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	// Create sync subscription
	sub := &storage.SyncSubscription{
		ID:    "sub-1",
		AppID: appID,
		Query: json.RawMessage(`{"todos": {}}`),
	}
	err := db.CreateSyncSubscription(ctx, sub)
	if err != nil {
		t.Fatal(err)
	}

	// Get subscription
	got, err := db.GetSyncSubscription(ctx, "sub-1")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("expected subscription")
	}
	if got.AppID != appID {
		t.Errorf("got app %q, want %q", got.AppID, appID)
	}
}

func TestSyncSubscriptionDelete(t *testing.T) {
	f, _ := os.CreateTemp("", "instant-sync-*.db")
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	db, _ := storage.Open(f.Name())
	defer db.Close()

	ctx := context.Background()
	appID := "sync-app"
	db.CreateApp(ctx, &storage.App{ID: appID, Title: "Test", AdminToken: "tok", CreatedAt: time.Now()})

	db.CreateSyncSubscription(ctx, &storage.SyncSubscription{ID: "sub-1", AppID: appID, Query: json.RawMessage(`{}`)})
	db.DeleteSyncSubscription(ctx, "sub-1")

	got, _ := db.GetSyncSubscription(ctx, "sub-1")
	if got != nil {
		t.Error("expected nil after delete")
	}
}

// ---- OAuth Tests ----

func TestOAuthStateGeneration(t *testing.T) {
	svc := NewOAuthService()
	state := svc.GenerateState("app-1", "http://localhost:3000/callback", "google")
	if state == "" {
		t.Error("expected non-empty state")
	}
}

func TestOAuthStateValidation(t *testing.T) {
	svc := NewOAuthService()
	state := svc.GenerateState("app-1", "http://localhost:3000/callback", "google")

	info, err := svc.ValidateState(state)
	if err != nil {
		t.Fatal(err)
	}
	if info.AppID != "app-1" {
		t.Errorf("got appID %q, want %q", info.AppID, "app-1")
	}
	if info.Provider != "google" {
		t.Errorf("got provider %q, want %q", info.Provider, "google")
	}
	if info.RedirectURL != "http://localhost:3000/callback" {
		t.Errorf("got redirect %q", info.RedirectURL)
	}

	// State should be single-use
	_, err = svc.ValidateState(state)
	if err == nil {
		t.Error("expected error on state reuse")
	}
}

