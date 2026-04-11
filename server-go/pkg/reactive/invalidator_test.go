package reactive

import (
	"encoding/json"
	"testing"
	"time"
)

func TestSessionStore(t *testing.T) {
	store := NewSessionStore()

	sess := &Session{
		ID:      "sess-1",
		AppID:   "app-1",
		Queries: make(map[string]*QuerySub),
	}
	store.AddSession(sess)

	if store.SessionCount() != 1 {
		t.Errorf("expected 1, got %d", store.SessionCount())
	}

	got := store.GetSession("sess-1")
	if got == nil {
		t.Fatal("expected session")
	}
	if got.ID != "sess-1" {
		t.Errorf("got ID %q, want %q", got.ID, "sess-1")
	}

	sessions := store.GetSessionsByApp("app-1")
	if len(sessions) != 1 {
		t.Errorf("expected 1, got %d", len(sessions))
	}

	store.RemoveSession("sess-1")
	if store.SessionCount() != 0 {
		t.Errorf("expected 0 after remove, got %d", store.SessionCount())
	}
}

func TestSessionQueries(t *testing.T) {
	sess := &Session{
		ID:      "sess-1",
		Queries: make(map[string]*QuerySub),
	}

	sub := &QuerySub{
		Query:  json.RawMessage(`{"users":{}}`),
		Hash:   "h1",
		Topics: []string{"app:attr:ea"},
	}

	sess.AddQuery("evt-1", sub)
	queries := sess.GetQueries()
	if len(queries) != 1 {
		t.Errorf("expected 1, got %d", len(queries))
	}

	removed := sess.RemoveQuery("evt-1")
	if removed == nil {
		t.Error("expected removed sub")
	}

	queries = sess.GetQueries()
	if len(queries) != 0 {
		t.Errorf("expected 0 after remove, got %d", len(queries))
	}
}

func TestSessionSend(t *testing.T) {
	var received interface{}
	sess := &Session{
		ID: "sess-1",
		SendFn: func(msg interface{}) {
			received = msg
		},
	}

	sess.Send("hello")
	if received != "hello" {
		t.Errorf("expected 'hello', got %v", received)
	}
}

func TestEphemeralStoreJoinLeave(t *testing.T) {
	eph := NewEphemeralStore()

	room := eph.JoinRoom("app-1", "room-1", "sess-1", "user-1", "peer-1")
	if room == nil {
		t.Fatal("expected room")
	}
	if len(room.Sessions) != 1 {
		t.Errorf("expected 1 member, got %d", len(room.Sessions))
	}

	// Join second session
	room = eph.JoinRoom("app-1", "room-1", "sess-2", "user-2", "peer-2")
	if len(room.Sessions) != 2 {
		t.Errorf("expected 2 members, got %d", len(room.Sessions))
	}

	// Leave
	room = eph.LeaveRoom("app-1", "room-1", "sess-1")
	if room == nil {
		t.Fatal("expected room with remaining member")
	}
	if len(room.Sessions) != 1 {
		t.Errorf("expected 1 member, got %d", len(room.Sessions))
	}

	// Leave last member
	room = eph.LeaveRoom("app-1", "room-1", "sess-2")
	if room != nil {
		t.Error("expected nil (empty room removed)")
	}
}

func TestEphemeralStorePresence(t *testing.T) {
	eph := NewEphemeralStore()
	eph.JoinRoom("app-1", "room-1", "sess-1", "user-1", "peer-1")

	ok := eph.SetPresence("app-1", "room-1", "sess-1", json.RawMessage(`{"cursor":{"x":10,"y":20}}`))
	if !ok {
		t.Error("expected set presence to succeed")
	}

	presence := eph.GetPresence("app-1", "room-1")
	if presence == nil {
		t.Fatal("expected presence data")
	}
	if len(presence) != 1 {
		t.Errorf("expected 1, got %d", len(presence))
	}

	member := presence["sess-1"]
	if member == nil {
		t.Fatal("expected member")
	}

	var data map[string]interface{}
	json.Unmarshal(member.Data, &data)
	cursor, _ := data["cursor"].(map[string]interface{})
	if cursor["x"] != float64(10) {
		t.Errorf("expected x=10, got %v", cursor["x"])
	}
}

func TestEphemeralStoreLeaveAllRooms(t *testing.T) {
	eph := NewEphemeralStore()
	eph.JoinRoom("app-1", "room-1", "sess-1", "user-1", "p1")
	eph.JoinRoom("app-1", "room-2", "sess-1", "user-1", "p1")
	eph.JoinRoom("app-1", "room-3", "sess-2", "user-2", "p2")

	roomIDs := eph.LeaveAllRooms("app-1", "sess-1")
	if len(roomIDs) != 2 {
		t.Errorf("expected 2 rooms left, got %d", len(roomIDs))
	}

	// room-3 should still exist
	room := eph.GetRoom("app-1", "room-3")
	if room == nil {
		t.Error("expected room-3 to still exist")
	}
}

func TestEphemeralGetRoomMembers(t *testing.T) {
	eph := NewEphemeralStore()
	eph.JoinRoom("app-1", "room-1", "sess-1", "user-1", "p1")
	eph.JoinRoom("app-1", "room-1", "sess-2", "user-2", "p2")

	members := eph.GetRoomMembers("app-1", "room-1", "sess-1")
	if len(members) != 1 {
		t.Errorf("expected 1 (excluding sender), got %d", len(members))
	}
	if members[0].SessionID != "sess-2" {
		t.Errorf("got session %q, want %q", members[0].SessionID, "sess-2")
	}
}

func TestEphemeralBroadcast(t *testing.T) {
	eph := NewEphemeralStore()
	store := NewSessionStore()

	var received []interface{}
	sess1 := &Session{ID: "sess-1", AppID: "app-1"}
	sess2 := &Session{ID: "sess-2", AppID: "app-1", SendFn: func(msg interface{}) {
		received = append(received, msg)
	}}

	store.AddSession(sess1)
	store.AddSession(sess2)

	eph.JoinRoom("app-1", "room-1", "sess-1", "user-1", "p1")
	eph.JoinRoom("app-1", "room-1", "sess-2", "user-2", "p2")

	eph.BroadcastToRoom(store, "app-1", "room-1", "sess-1", "hello")

	if len(received) != 1 {
		t.Errorf("expected 1 broadcast received, got %d", len(received))
	}
	if received[0] != "hello" {
		t.Errorf("got %v, want 'hello'", received[0])
	}
}

func TestPresenceNotInRoom(t *testing.T) {
	eph := NewEphemeralStore()

	ok := eph.SetPresence("app-1", "room-1", "sess-1", json.RawMessage(`{}`))
	if ok {
		t.Error("expected false for not-in-room")
	}

	presence := eph.GetPresence("app-1", "nonexistent")
	if presence != nil {
		t.Error("expected nil for nonexistent room")
	}
}

func TestTopicFromAttr(t *testing.T) {
	topic := TopicFromAttr("app-1", "attr-1", "ea")
	if topic != "app-1:attr-1:ea" {
		t.Errorf("got %q, want %q", topic, "app-1:attr-1:ea")
	}
}

// Ensure time import is used
var _ = time.Now
