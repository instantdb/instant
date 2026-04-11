package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/necrodome/instant/server-go/pkg/admin"
	"github.com/necrodome/instant/server-go/pkg/auth"
	"github.com/necrodome/instant/server-go/pkg/engine"
	"github.com/necrodome/instant/server-go/pkg/reactive"
	"github.com/necrodome/instant/server-go/pkg/storage"
)

func setupTestServer(t *testing.T) (*httptest.Server, *storage.DB, string) {
	t.Helper()
	f, err := os.CreateTemp("", "instant-integration-*.db")
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

	// Create test app
	appID := "test-app"
	app := &storage.App{ID: appID, Title: "Test", AdminToken: "admin-tok", CreatedAt: time.Now()}
	db.CreateApp(context.Background(), app)

	// Create attrs
	for _, a := range []struct {
		id, etype, label, vtype, card string
		index, unique                 bool
	}{
		{"attr-users-id", "users", "id", "blob", "one", true, true},
		{"attr-users-name", "users", "name", "blob", "one", false, false},
		{"attr-users-email", "users", "email", "blob", "one", true, true},
	} {
		attr := &storage.Attr{
			ID: a.id, AppID: appID,
			ForwardIdentity: [3]string{"fwd-" + a.id, a.etype, a.label},
			ValueType: a.vtype, Cardinality: a.card,
			IsIndex: a.index, IsUnique: a.unique,
		}
		db.CreateAttr(context.Background(), attr)
	}

	qe := engine.NewQueryEngine(db)
	txp := engine.NewTxProcessor(db)
	perms, _ := engine.NewPermissionEngine(db, qe)
	sessions := reactive.NewSessionStore()
	eph := reactive.NewEphemeralStore()
	inv := reactive.NewInvalidator(db)
	inv.Start()
	t.Cleanup(func() { inv.Stop() })

	authSvc := auth.NewService(db, "test-secret")

	h := NewHandler(db, sessions, eph, inv, qe, txp, perms, authSvc)

	ah := admin.NewHandler(db, qe, txp, authSvc)

	mux := http.NewServeMux()
	mux.HandleFunc("/runtime/session", h.ServeWS)
	ah.RegisterRoutes(mux)

	server := httptest.NewServer(mux)
	t.Cleanup(func() { server.Close() })

	return server, db, appID
}

func wsConnect(t *testing.T, server *httptest.Server, appID string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/runtime/session?app_id=" + appID
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func sendMsg(t *testing.T, conn *websocket.Conn, msg map[string]interface{}) {
	t.Helper()
	data, _ := json.Marshal(msg)
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatal(err)
	}
}

func readMsg(t *testing.T, conn *websocket.Conn) map[string]interface{} {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, data, err := conn.ReadMessage()
	if err != nil {
		t.Fatal(err)
	}
	var msg map[string]interface{}
	json.Unmarshal(data, &msg)
	return msg
}

// ---- Integration tests ----

func TestWSInit(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"client-event-id": "evt-1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "init-ok" {
		t.Errorf("expected init-ok, got %v", msg["op"])
	}
	if msg["session-id"] == nil || msg["session-id"] == "" {
		t.Error("expected session-id")
	}
	if msg["client-event-id"] != "evt-1" {
		t.Errorf("expected client-event-id=evt-1, got %v", msg["client-event-id"])
	}

	// Auth should contain app info
	authData, ok := msg["auth"].(map[string]interface{})
	if !ok {
		t.Fatal("expected auth map")
	}
	appData, ok := authData["app"].(map[string]interface{})
	if !ok {
		t.Fatal("expected app in auth")
	}
	if appData["id"] != appID {
		t.Errorf("got app id %v, want %v", appData["id"], appID)
	}
}

func TestWSInitWithAdminToken(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "init-ok" {
		t.Errorf("expected init-ok, got %v", msg["op"])
	}
}

func TestWSInitMissingAppID(t *testing.T) {
	server, _, _ := setupTestServer(t)
	conn := wsConnect(t, server, "")

	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"client-event-id": "evt-1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "error" {
		t.Errorf("expected error, got %v", msg["op"])
	}
}

func TestWSAddQuery(t *testing.T) {
	server, db, appID := setupTestServer(t)

	// Insert test data
	attrs, _ := db.GetAttrsByAppID(context.Background(), appID)
	idAttr := storage.SeekAttrByFwdIdent(attrs, "users", "id")
	nameAttr := storage.SeekAttrByFwdIdent(attrs, "users", "name")

	db.InsertTriple(context.Background(), appID, &storage.Triple{
		EntityID: "u1", AttrID: idAttr.ID, Value: storage.JSONValue("u1"),
	}, idAttr)
	db.InsertTriple(context.Background(), appID, &storage.Triple{
		EntityID: "u1", AttrID: nameAttr.ID, Value: storage.JSONValue("Alice"),
	}, nameAttr)

	conn := wsConnect(t, server, appID)

	// Init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-init",
	})
	readMsg(t, conn) // init-ok

	// Add query
	sendMsg(t, conn, map[string]interface{}{
		"op":              "add-query",
		"q":               map[string]interface{}{"users": map[string]interface{}{}},
		"client-event-id": "evt-q1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "add-query-ok" {
		t.Errorf("expected add-query-ok, got %v", msg["op"])
	}
	if msg["client-event-id"] != "evt-q1" {
		t.Errorf("expected client-event-id=evt-q1, got %v", msg["client-event-id"])
	}

	// Result should be InstaQL tree format (array of nodes)
	result, ok := msg["result"].([]interface{})
	if !ok {
		t.Fatalf("expected result array (InstaQL tree), got %T", msg["result"])
	}
	if len(result) < 1 {
		t.Fatal("expected at least 1 node in result tree")
	}
}

func TestWSTransact(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	// Init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-init",
	})
	readMsg(t, conn) // init-ok

	// Transact
	sendMsg(t, conn, map[string]interface{}{
		"op": "transact",
		"tx-steps": []interface{}{
			[]interface{}{"add-triple", "user-new", "attr-users-name", "NewUser"},
		},
		"client-event-id": "evt-tx1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "transact-ok" {
		t.Errorf("expected transact-ok, got %v (msg: %v)", msg["op"], msg)
	}
}

func TestWSJoinRoom(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	// Init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-init",
	})
	readMsg(t, conn) // init-ok

	// Join room
	sendMsg(t, conn, map[string]interface{}{
		"op":              "join-room",
		"room-id":         "room-1",
		"peer-id":         "peer-1",
		"client-event-id": "evt-join",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "join-room-ok" {
		t.Errorf("expected join-room-ok, got %v", msg["op"])
	}
	if msg["room-id"] != "room-1" {
		t.Errorf("expected room-id=room-1, got %v", msg["room-id"])
	}
}

func TestWSSetPresence(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	// Init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-init",
	})
	readMsg(t, conn) // init-ok

	// Join room
	sendMsg(t, conn, map[string]interface{}{
		"op":              "join-room",
		"room-id":         "room-1",
		"client-event-id": "evt-join",
	})
	readMsg(t, conn) // join-room-ok

	// Set presence
	sendMsg(t, conn, map[string]interface{}{
		"op":              "set-presence",
		"room-id":         "room-1",
		"data":            map[string]interface{}{"cursor": map[string]interface{}{"x": 10, "y": 20}},
		"client-event-id": "evt-pres",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "set-presence-ok" {
		t.Errorf("expected set-presence-ok, got %v", msg["op"])
	}
}

func TestWSLeaveRoom(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	// Init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "init",
		"app-id":          appID,
		"__admin-token":   "admin-tok",
		"client-event-id": "evt-init",
	})
	readMsg(t, conn) // init-ok

	// Join + Leave
	sendMsg(t, conn, map[string]interface{}{
		"op":              "join-room",
		"room-id":         "room-1",
		"client-event-id": "evt-join",
	})
	readMsg(t, conn)

	sendMsg(t, conn, map[string]interface{}{
		"op":              "leave-room",
		"room-id":         "room-1",
		"client-event-id": "evt-leave",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "leave-room-ok" {
		t.Errorf("expected leave-room-ok, got %v", msg["op"])
	}
}

func TestWSUnknownOp(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	sendMsg(t, conn, map[string]interface{}{
		"op":              "unknown-op",
		"client-event-id": "evt-1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "error" {
		t.Errorf("expected error, got %v", msg["op"])
	}
}

func TestWSOperationBeforeInit(t *testing.T) {
	server, _, appID := setupTestServer(t)
	conn := wsConnect(t, server, appID)

	// Try add-query before init
	sendMsg(t, conn, map[string]interface{}{
		"op":              "add-query",
		"q":               map[string]interface{}{"users": map[string]interface{}{}},
		"client-event-id": "evt-q1",
	})

	msg := readMsg(t, conn)
	if msg["op"] != "error" {
		t.Errorf("expected error for pre-init query, got %v", msg["op"])
	}
}

// ---- Admin API integration test ----

func TestAdminAPI(t *testing.T) {
	server, db, appID := setupTestServer(t)
	_ = db

	// Health check
	resp, err := http.Get(server.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("health check: got %d, want 200", resp.StatusCode)
	}
	_ = appID
}
