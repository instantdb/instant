package reactive

import (
	"encoding/json"
	"sync"
)

// EphemeralStore manages rooms, presence, and broadcasts in-memory.
type EphemeralStore struct {
	mu    sync.RWMutex
	rooms map[string]*Room // key: "appID:roomID"
}

// Room holds per-room state.
type Room struct {
	ID       string
	AppID    string
	Sessions map[string]*RoomMember // sessionID -> member
}

// RoomMember represents a session in a room.
type RoomMember struct {
	SessionID string
	UserID    string
	PeerID    string
	Data      json.RawMessage // presence data
}

// NewEphemeralStore creates a new ephemeral store.
func NewEphemeralStore() *EphemeralStore {
	return &EphemeralStore{
		rooms: make(map[string]*Room),
	}
}

func roomKey(appID, roomID string) string {
	return appID + ":" + roomID
}

// JoinRoom adds a session to a room.
func (es *EphemeralStore) JoinRoom(appID, roomID, sessionID, userID, peerID string) *Room {
	es.mu.Lock()
	defer es.mu.Unlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		room = &Room{
			ID:       roomID,
			AppID:    appID,
			Sessions: make(map[string]*RoomMember),
		}
		es.rooms[key] = room
	}

	room.Sessions[sessionID] = &RoomMember{
		SessionID: sessionID,
		UserID:    userID,
		PeerID:    peerID,
		Data:      json.RawMessage("{}"),
	}

	return room
}

// LeaveRoom removes a session from a room.
func (es *EphemeralStore) LeaveRoom(appID, roomID, sessionID string) *Room {
	es.mu.Lock()
	defer es.mu.Unlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		return nil
	}

	delete(room.Sessions, sessionID)

	if len(room.Sessions) == 0 {
		delete(es.rooms, key)
		return nil
	}

	return room
}

// LeaveAllRooms removes a session from all rooms it's in.
func (es *EphemeralStore) LeaveAllRooms(appID, sessionID string) []string {
	es.mu.Lock()
	defer es.mu.Unlock()

	var roomIDs []string
	for key, room := range es.rooms {
		if room.AppID != appID {
			continue
		}
		if _, ok := room.Sessions[sessionID]; ok {
			delete(room.Sessions, sessionID)
			roomIDs = append(roomIDs, room.ID)
			if len(room.Sessions) == 0 {
				delete(es.rooms, key)
			}
		}
	}
	return roomIDs
}

// SetPresence updates presence data for a session in a room.
func (es *EphemeralStore) SetPresence(appID, roomID, sessionID string, data json.RawMessage) bool {
	es.mu.Lock()
	defer es.mu.Unlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		return false
	}

	member, ok := room.Sessions[sessionID]
	if !ok {
		return false
	}

	member.Data = data
	return true
}

// GetPresence returns all presence data for a room.
func (es *EphemeralStore) GetPresence(appID, roomID string) map[string]*RoomMember {
	es.mu.RLock()
	defer es.mu.RUnlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		return nil
	}

	result := make(map[string]*RoomMember, len(room.Sessions))
	for k, v := range room.Sessions {
		result[k] = v
	}
	return result
}

// GetRoom returns a room by ID.
func (es *EphemeralStore) GetRoom(appID, roomID string) *Room {
	es.mu.RLock()
	defer es.mu.RUnlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		return nil
	}
	return room
}

// GetRoomMembers returns all members in a room (excluding a session).
func (es *EphemeralStore) GetRoomMembers(appID, roomID, excludeSessionID string) []*RoomMember {
	es.mu.RLock()
	defer es.mu.RUnlock()

	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		return nil
	}

	var members []*RoomMember
	for _, m := range room.Sessions {
		if m.SessionID != excludeSessionID {
			members = append(members, m)
		}
	}
	return members
}

// BroadcastToRoom sends a message to all sessions in a room (except sender).
func (es *EphemeralStore) BroadcastToRoom(store *SessionStore, appID, roomID, senderSessionID string, msg interface{}) {
	es.mu.RLock()
	key := roomKey(appID, roomID)
	room, ok := es.rooms[key]
	if !ok {
		es.mu.RUnlock()
		return
	}

	var targetSessionIDs []string
	for sid := range room.Sessions {
		if sid != senderSessionID {
			targetSessionIDs = append(targetSessionIDs, sid)
		}
	}
	es.mu.RUnlock()

	for _, sid := range targetSessionIDs {
		sess := store.GetSession(sid)
		if sess != nil {
			sess.Send(msg)
		}
	}
}
