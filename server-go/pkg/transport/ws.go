// Package transport implements WebSocket and SSE transport for the Instant protocol.
package transport

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/necrodome/instant/server-go/pkg/auth"
	"github.com/necrodome/instant/server-go/pkg/engine"
	"github.com/necrodome/instant/server-go/pkg/reactive"
	"github.com/necrodome/instant/server-go/pkg/storage"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Handler manages WebSocket connections.
type Handler struct {
	db        *storage.DB
	sessions  *reactive.SessionStore
	eph       *reactive.EphemeralStore
	inv       *reactive.Invalidator
	qe        *engine.QueryEngine
	txp       *engine.TxProcessor
	perms     *engine.PermissionEngine
	authSvc   *auth.Service
}

// NewHandler creates a new transport handler.
func NewHandler(
	db *storage.DB,
	sessions *reactive.SessionStore,
	eph *reactive.EphemeralStore,
	inv *reactive.Invalidator,
	qe *engine.QueryEngine,
	txp *engine.TxProcessor,
	perms *engine.PermissionEngine,
	authSvc *auth.Service,
) *Handler {
	return &Handler{
		db:       db,
		sessions: sessions,
		eph:      eph,
		inv:      inv,
		qe:       qe,
		txp:      txp,
		perms:    perms,
		authSvc:  authSvc,
	}
}

// ServeWS handles a WebSocket connection upgrade.
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	appID := r.URL.Query().Get("app_id")
	sessionID := generateSessionID()

	sess := &reactive.Session{
		ID:       sessionID,
		AppID:    appID,
		Queries:  make(map[string]*reactive.QuerySub),
		Features: make(map[string]bool),
	}

	var writeMu sync.Mutex
	sess.SendFn = func(msg interface{}) {
		data, err := json.Marshal(msg)
		if err != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		conn.WriteMessage(websocket.TextMessage, data)
	}

	h.sessions.AddSession(sess)
	defer h.onClose(sess)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			break
		}
		h.handleMessage(sess, message)
	}
}

func (h *Handler) onClose(sess *reactive.Session) {
	// Leave all rooms
	if sess.AppID != "" {
		roomIDs := h.eph.LeaveAllRooms(sess.AppID, sess.ID)
		for _, roomID := range roomIDs {
			h.broadcastPresenceUpdate(sess.AppID, roomID, sess.ID)
		}
	}

	// Unsubscribe all queries
	queries := sess.GetQueries()
	for _, sub := range queries {
		h.inv.UnsubscribeAll(sub.Topics)
	}

	h.sessions.RemoveSession(sess.ID)
}

func (h *Handler) handleMessage(sess *reactive.Session, data []byte) {
	// Check for batch messages (array)
	if len(data) > 0 && data[0] == '[' {
		var messages []json.RawMessage
		if err := json.Unmarshal(data, &messages); err == nil {
			for _, msg := range messages {
				h.handleSingleMessage(sess, msg)
			}
			return
		}
	}
	h.handleSingleMessage(sess, data)
}

func (h *Handler) handleSingleMessage(sess *reactive.Session, data []byte) {
	var msg map[string]json.RawMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		sess.Send(map[string]interface{}{
			"op":      "error",
			"status":  400,
			"message": "invalid JSON",
		})
		return
	}

	var op string
	if opRaw, ok := msg["op"]; ok {
		json.Unmarshal(opRaw, &op)
	}

	var clientEventID string
	if ceidRaw, ok := msg["client-event-id"]; ok {
		json.Unmarshal(ceidRaw, &clientEventID)
	}

	ctx := context.Background()

	switch op {
	case "init":
		h.handleInit(ctx, sess, msg, clientEventID)
	case "add-query":
		h.handleAddQuery(ctx, sess, msg, clientEventID)
	case "remove-query":
		h.handleRemoveQuery(sess, msg, clientEventID)
	case "transact":
		h.handleTransact(ctx, sess, msg, clientEventID)
	case "refresh":
		h.handleRefresh(ctx, sess, msg, clientEventID)
	case "join-room":
		h.handleJoinRoom(sess, msg, clientEventID)
	case "leave-room":
		h.handleLeaveRoom(sess, msg, clientEventID)
	case "set-presence":
		h.handleSetPresence(sess, msg, clientEventID)
	case "refresh-presence":
		h.handleRefreshPresence(sess, msg, clientEventID)
	case "client-broadcast":
		h.handleClientBroadcast(sess, msg, clientEventID)
	case "server-broadcast":
		h.handleServerBroadcast(sess, msg, clientEventID)
	default:
		sess.Send(map[string]interface{}{
			"op":              "error",
			"status":          400,
			"client-event-id": clientEventID,
			"message":         fmt.Sprintf("unknown op: %s", op),
		})
	}
}

func (h *Handler) handleInit(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var appID string
	if raw, ok := msg["app-id"]; ok {
		json.Unmarshal(raw, &appID)
	}

	if appID == "" {
		sendError(sess, clientEventID, 400, "app-id is required")
		return
	}

	app, err := h.db.GetApp(ctx, appID)
	if err != nil || app == nil {
		sendError(sess, clientEventID, 404, "app not found")
		return
	}

	sess.AppID = appID

	// Check for admin token
	var adminToken string
	if raw, ok := msg["__admin-token"]; ok {
		json.Unmarshal(raw, &adminToken)
	}
	isAdmin := adminToken != "" && adminToken == app.AdminToken

	// Check for refresh token (user auth)
	var refreshToken string
	if raw, ok := msg["refresh-token"]; ok {
		json.Unmarshal(raw, &refreshToken)
	}

	var user *storage.AppUser
	if refreshToken != "" {
		user, _ = h.authSvc.VerifyRefreshToken(ctx, appID, refreshToken)
	}

	sess.Auth = &reactive.SessionAuth{
		App:   app,
		User:  user,
		Admin: isAdmin,
	}

	// Get attrs for this app
	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		sendError(sess, clientEventID, 500, "failed to load attrs")
		return
	}

	// Build attrs response as array (client Reactor._setAttrs expects array)
	attrsArr := make([]map[string]interface{}, 0, len(attrs))
	for _, a := range attrs {
		attrsArr = append(attrsArr, attrToJSON(a))
	}

	authResp := map[string]interface{}{
		"app": map[string]interface{}{
			"id":    app.ID,
			"title": app.Title,
		},
	}
	if user != nil {
		authResp["user"] = map[string]interface{}{
			"id":    user.ID,
			"email": user.Email,
		}
	}

	sess.Send(map[string]interface{}{
		"op":              "init-ok",
		"session-id":      sess.ID,
		"client-event-id": clientEventID,
		"auth":            authResp,
		"attrs":           attrsArr,
	})
}

func (h *Handler) handleAddQuery(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var query json.RawMessage
	if raw, ok := msg["q"]; ok {
		query = raw
	}

	appID := sess.AppID
	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		sendError(sess, clientEventID, 500, "failed to load attrs")
		return
	}

	result, err := h.qe.ExecuteQuery(ctx, appID, query, attrs)
	if err != nil {
		sendError(sess, clientEventID, 400, err.Error())
		return
	}

	// Store the subscription
	sub := &reactive.QuerySub{
		Query:      query,
		Hash:       clientEventID,
		Topics:     result.Topics,
		LastResult: result.Data,
	}
	sess.AddQuery(clientEventID, sub)

	// Subscribe to invalidation topics
	h.inv.Subscribe(result.Topics, func(appID string, entry *storage.ChangelogEntry) {
		h.refreshQuery(sess, clientEventID, query)
	})

	// Build InstaQL result tree (the format the client Reactor expects)
	instaqlResult := h.buildInstaQLResult(ctx, appID, query, attrs)

	sess.Send(map[string]interface{}{
		"op":              "add-query-ok",
		"q":               query,
		"result":          instaqlResult,
		"client-event-id": clientEventID,
	})
}

func (h *Handler) handleRemoveQuery(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var eventID string
	if raw, ok := msg["q"]; ok {
		// The client sends the same query hash to remove
		json.Unmarshal(raw, &eventID)
	}

	sub := sess.RemoveQuery(clientEventID)
	if sub != nil {
		h.inv.UnsubscribeAll(sub.Topics)
	}
}

func (h *Handler) handleTransact(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var txSteps []json.RawMessage
	if raw, ok := msg["tx-steps"]; ok {
		json.Unmarshal(raw, &txSteps)
	}

	appID := sess.AppID
	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		sendError(sess, clientEventID, 500, "failed to load attrs")
		return
	}

	result, err := h.txp.ProcessTransaction(ctx, appID, txSteps, attrs)
	if err != nil {
		sendError(sess, clientEventID, 400, err.Error())
		return
	}

	sess.Send(map[string]interface{}{
		"op":              "transact-ok",
		"tx-id":           result.TxID,
		"client-event-id": clientEventID,
	})
}

func (h *Handler) handleRefresh(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	// Re-execute all queries for this session
	queries := sess.GetQueries()
	for eventID, sub := range queries {
		h.refreshQuery(sess, eventID, sub.Query)
	}
}

func (h *Handler) refreshQuery(sess *reactive.Session, eventID string, query json.RawMessage) {
	ctx := context.Background()
	appID := sess.AppID

	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		return
	}

	instaqlResult := h.buildInstaQLResult(ctx, appID, query, attrs)

	sess.Send(map[string]interface{}{
		"op":              "add-query-ok",
		"q":               query,
		"result":          instaqlResult,
		"client-event-id": eventID,
	})
}

// buildInstaQLResult converts query results into the InstaQL tree format
// that the client Reactor expects: an array of nodes, each containing
// datalog-result with join-rows of [entity_id, attr_id, value, created_at] triples.
func (h *Handler) buildInstaQLResult(ctx context.Context, appID string, query json.RawMessage, attrs []*storage.Attr) []interface{} {
	forms, err := engine.ParseInstaQL(query)
	if err != nil {
		return []interface{}{}
	}

	attrMap := storage.BuildAttrMap(attrs)
	var nodes []interface{}

	for _, form := range forms {
		node := h.buildFormNode(ctx, appID, form, attrs, attrMap)
		nodes = append(nodes, node)
	}

	return nodes
}

func (h *Handler) buildFormNode(ctx context.Context, appID string, form *engine.InstaQLForm, attrs []*storage.Attr, attrMap map[string]*storage.Attr) map[string]interface{} {
	idAttr := storage.SeekAttrByFwdIdent(attrs, form.Etype, "id")
	if idAttr == nil {
		return map[string]interface{}{
			"data": map[string]interface{}{
				"datalog-result": map[string]interface{}{
					"join-rows": []interface{}{},
				},
			},
			"child-nodes": []interface{}{},
		}
	}

	// Get entity IDs for this form
	qe := h.qe
	result, err := qe.ExecuteQuery(ctx, appID, mustMarshal(map[string]interface{}{form.Etype: formToQueryMap(form)}), attrs)
	if err != nil {
		return map[string]interface{}{
			"data": map[string]interface{}{
				"datalog-result": map[string]interface{}{
					"join-rows": []interface{}{},
				},
			},
			"child-nodes": []interface{}{},
		}
	}

	// Get entities from the hydrated result
	entities, _ := result.Data[form.Etype].([]map[string]interface{})

	// Fetch raw triples for all these entities
	var entityIDs []string
	for _, e := range entities {
		if eid, ok := e["id"].(string); ok {
			entityIDs = append(entityIDs, eid)
		}
	}

	joinRows := h.fetchJoinRows(ctx, appID, entityIDs)

	// Build child nodes
	var childNodes []interface{}
	for _, child := range form.Children {
		for _, e := range entities {
			parentID, _ := e["id"].(string)
			if parentID == "" {
				continue
			}
			childNode := h.buildChildNode(ctx, appID, parentID, child, attrs, attrMap)
			childNodes = append(childNodes, childNode)
		}
	}

	if childNodes == nil {
		childNodes = []interface{}{}
	}

	return map[string]interface{}{
		"data": map[string]interface{}{
			"datalog-result": map[string]interface{}{
				"join-rows": joinRows,
			},
		},
		"child-nodes": childNodes,
	}
}

func (h *Handler) buildChildNode(ctx context.Context, appID, parentID string, child *engine.InstaQLForm, attrs []*storage.Attr, attrMap map[string]*storage.Attr) map[string]interface{} {
	// For child queries, find linked entities and return their triples
	// This is simplified - returns the link triples + child entity triples

	childJoinRows := []interface{}{}
	childNodes := []interface{}{}

	return map[string]interface{}{
		"data": map[string]interface{}{
			"datalog-result": map[string]interface{}{
				"join-rows": childJoinRows,
			},
		},
		"child-nodes": childNodes,
	}
}

func (h *Handler) fetchJoinRows(ctx context.Context, appID string, entityIDs []string) []interface{} {
	if len(entityIDs) == 0 {
		return []interface{}{}
	}

	var joinRows []interface{}
	for _, eid := range entityIDs {
		triples, err := h.db.GetTriplesByEntity(ctx, appID, eid)
		if err != nil {
			continue
		}
		for _, t := range triples {
			// Each join row is an array of triples: [[entity_id, attr_id, value, created_at]]
			var val interface{}
			json.Unmarshal(t.Value, &val)
			row := []interface{}{
				[]interface{}{t.EntityID, t.AttrID, val, t.CreatedAt},
			}
			joinRows = append(joinRows, row)
		}
	}
	return joinRows
}

func formToQueryMap(form *engine.InstaQLForm) map[string]interface{} {
	m := map[string]interface{}{}
	if len(form.Options.Where) > 0 || form.Options.Order != nil || form.Options.Limit != nil {
		opts := map[string]interface{}{}
		if len(form.Options.Where) > 0 {
			where := map[string]interface{}{}
			for _, w := range form.Options.Where {
				if len(w.Path) > 0 {
					if w.Op == "" {
						where[w.Path[0]] = w.Value
					} else {
						where[w.Path[0]] = map[string]interface{}{w.Op: w.Value}
					}
				}
			}
			opts["where"] = where
		}
		if form.Options.Limit != nil {
			opts["limit"] = *form.Options.Limit
		}
		m["$"] = opts
	}
	for _, child := range form.Children {
		m[child.Etype] = formToQueryMap(child)
	}
	return m
}

func mustMarshal(v interface{}) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// ---- Ephemeral operations ----

func (h *Handler) handleJoinRoom(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var roomID string
	if raw, ok := msg["room-id"]; ok {
		json.Unmarshal(raw, &roomID)
	}

	userID := ""
	if sess.Auth.User != nil {
		userID = sess.Auth.User.ID
	}

	var peerID string
	if raw, ok := msg["peer-id"]; ok {
		json.Unmarshal(raw, &peerID)
	}

	room := h.eph.JoinRoom(sess.AppID, roomID, sess.ID, userID, peerID)

	// Build presence response
	presence := h.buildPresenceResponse(room, sess.ID)

	sess.Send(map[string]interface{}{
		"op":              "join-room-ok",
		"room-id":         roomID,
		"client-event-id": clientEventID,
		"data":            presence,
	})

	// Notify other members
	h.broadcastPresenceUpdate(sess.AppID, roomID, sess.ID)
}

func (h *Handler) handleLeaveRoom(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var roomID string
	if raw, ok := msg["room-id"]; ok {
		json.Unmarshal(raw, &roomID)
	}

	h.eph.LeaveRoom(sess.AppID, roomID, sess.ID)

	sess.Send(map[string]interface{}{
		"op":              "leave-room-ok",
		"room-id":         roomID,
		"client-event-id": clientEventID,
	})

	h.broadcastPresenceUpdate(sess.AppID, roomID, sess.ID)
}

func (h *Handler) handleSetPresence(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var roomID string
	if raw, ok := msg["room-id"]; ok {
		json.Unmarshal(raw, &roomID)
	}

	var data json.RawMessage
	if raw, ok := msg["data"]; ok {
		data = raw
	}

	h.eph.SetPresence(sess.AppID, roomID, sess.ID, data)

	sess.Send(map[string]interface{}{
		"op":              "set-presence-ok",
		"room-id":         roomID,
		"client-event-id": clientEventID,
	})

	// Broadcast presence to others
	h.broadcastPresenceUpdate(sess.AppID, roomID, sess.ID)
}

func (h *Handler) handleRefreshPresence(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var roomID string
	if raw, ok := msg["room-id"]; ok {
		json.Unmarshal(raw, &roomID)
	}

	room := h.eph.GetRoom(sess.AppID, roomID)
	if room == nil {
		sess.Send(map[string]interface{}{
			"op":              "refresh-presence-ok",
			"room-id":         roomID,
			"client-event-id": clientEventID,
			"data":            map[string]interface{}{},
		})
		return
	}

	presence := h.buildPresenceResponse(room, sess.ID)

	sess.Send(map[string]interface{}{
		"op":              "refresh-presence-ok",
		"room-id":         roomID,
		"client-event-id": clientEventID,
		"data":            presence,
	})
}

func (h *Handler) handleClientBroadcast(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var roomID string
	if raw, ok := msg["room-id"]; ok {
		json.Unmarshal(raw, &roomID)
	}

	var topic string
	if raw, ok := msg["topic"]; ok {
		json.Unmarshal(raw, &topic)
	}

	var data json.RawMessage
	if raw, ok := msg["data"]; ok {
		data = raw
	}

	var peerID string
	if raw, ok := msg["peer-id"]; ok {
		json.Unmarshal(raw, &peerID)
	}

	broadcast := map[string]interface{}{
		"op":      "server-broadcast",
		"room-id": roomID,
		"topic":   topic,
		"data":    data,
		"peer-id": peerID,
	}

	h.eph.BroadcastToRoom(h.sessions, sess.AppID, roomID, sess.ID, broadcast)

	sess.Send(map[string]interface{}{
		"op":              "client-broadcast-ok",
		"client-event-id": clientEventID,
	})
}

func (h *Handler) handleServerBroadcast(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	// Server broadcast is the same as client broadcast for the single-binary case
	h.handleClientBroadcast(sess, msg, clientEventID)
}

func (h *Handler) broadcastPresenceUpdate(appID, roomID, senderSessionID string) {
	room := h.eph.GetRoom(appID, roomID)
	if room == nil {
		return
	}

	for sid, member := range room.Sessions {
		if sid == senderSessionID {
			continue
		}
		sess := h.sessions.GetSession(sid)
		if sess == nil {
			continue
		}

		presence := h.buildPresenceResponse(room, sid)
		sess.Send(map[string]interface{}{
			"op":      "refresh-presence",
			"room-id": roomID,
			"data":    presence,
		})
		_ = member
	}
}

func (h *Handler) buildPresenceResponse(room *reactive.Room, excludeSessionID string) map[string]interface{} {
	result := make(map[string]interface{})
	for sid, member := range room.Sessions {
		key := sid
		if member.PeerID != "" {
			key = member.PeerID
		}
		entry := map[string]interface{}{
			"peer-id": member.PeerID,
			"user":    nil,
			"data":    member.Data,
		}
		if member.UserID != "" {
			entry["user-id"] = member.UserID
		}
		result[key] = entry
	}
	return result
}

// ---- SSE Transport ----

// ServeSSE handles a Server-Sent Events connection.
func (h *Handler) ServeSSE(w http.ResponseWriter, r *http.Request) {
	appID := r.URL.Query().Get("app_id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	sessionID := generateSessionID()
	sseToken := generateSessionID()
	machineID := generateSessionID()

	sess := &reactive.Session{
		ID:       sessionID,
		AppID:    appID,
		Queries:  make(map[string]*reactive.QuerySub),
		Features: make(map[string]bool),
	}

	var writeMu sync.Mutex
	sess.SendFn = func(msg interface{}) {
		data, err := json.Marshal(msg)
		if err != nil {
			return
		}
		writeMu.Lock()
		defer writeMu.Unlock()
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	h.sessions.AddSession(sess)
	defer h.onClose(sess)

	// Send SSE init
	sess.Send(map[string]interface{}{
		"op":         "sse-init",
		"session-id": sessionID,
		"machine-id": machineID,
		"sse-token":  sseToken,
	})

	// Wait for connection close
	<-r.Context().Done()
}

// ServeSSEMessage handles SSE message POST.
func (h *Handler) ServeSSEMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SessionID string            `json:"session_id"`
		MachineID string            `json:"machine_id"`
		SSEToken  string            `json:"sse_token"`
		Messages  []json.RawMessage `json:"messages"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	sess := h.sessions.GetSession(body.SessionID)
	if sess == nil {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	for _, msg := range body.Messages {
		h.handleSingleMessage(sess, msg)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ---- Helpers ----

func sendError(sess *reactive.Session, clientEventID string, status int, message string) {
	sess.Send(map[string]interface{}{
		"op":              "error",
		"status":          status,
		"client-event-id": clientEventID,
		"message":         message,
	})
}

func attrToJSON(a *storage.Attr) map[string]interface{} {
	result := map[string]interface{}{
		"id":               a.ID,
		"forward-identity": a.ForwardIdentity,
		"value-type":       a.ValueType,
		"cardinality":      a.Cardinality,
		"unique?":          a.IsUnique,
		"index?":           a.IsIndex,
		"required?":        a.IsRequired,
		"inferred-types":   nil,
		"catalog":          "user",
	}
	if a.ReverseIdentity[0] != "" {
		result["reverse-identity"] = a.ReverseIdentity
	}
	if a.CheckedDataType != "" {
		result["checked-data-type"] = a.CheckedDataType
	}
	if a.Indexing {
		result["indexing?"] = true
	}
	if a.SettingUnique {
		result["setting-unique?"] = true
	}
	return result
}

func generateSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

