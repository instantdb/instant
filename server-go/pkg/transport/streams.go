package transport

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/necrodome/instant/server-go/pkg/reactive"
	"github.com/necrodome/instant/server-go/pkg/storage"
)

// ---- Stream Handlers ----

func (h *Handler) handleStartStream(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var clientID string
	if raw, ok := msg["client-id"]; ok {
		json.Unmarshal(raw, &clientID)
	}
	if clientID == "" {
		sendError(sess, clientEventID, 400, "client-id is required")
		return
	}

	appID := sess.AppID
	streamID := generateStreamID()

	// Check if stream already exists for this client
	existing, _ := h.db.GetStreamByClientID(ctx, appID, clientID)
	if existing != nil {
		streamID = existing.ID
	} else {
		stream := &storage.StreamRecord{
			ID:       streamID,
			AppID:    appID,
			ClientID: clientID,
		}
		if err := h.db.CreateStream(ctx, stream); err != nil {
			sendError(sess, clientEventID, 500, err.Error())
			return
		}
	}

	// Get current size for offset
	st, _ := h.db.GetStream(ctx, streamID)
	offset := int64(0)
	if st != nil {
		offset = st.SizeBytes
	}

	sess.Send(map[string]interface{}{
		"op":              "start-stream-ok",
		"client-event-id": clientEventID,
		"client-id":       clientID,
		"stream-id":       streamID,
		"offset":          offset,
	})
}

func (h *Handler) handleAppendStream(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var streamID string
	if raw, ok := msg["stream-id"]; ok {
		json.Unmarshal(raw, &streamID)
	}

	var chunks []string
	if raw, ok := msg["chunks"]; ok {
		json.Unmarshal(raw, &chunks)
	}

	var done bool
	if raw, ok := msg["done?"]; ok {
		json.Unmarshal(raw, &done)
	}

	var abortReason string
	if raw, ok := msg["abort-reason"]; ok {
		json.Unmarshal(raw, &abortReason)
	}

	// Append chunks
	for _, chunk := range chunks {
		if err := h.db.AppendStreamData(ctx, streamID, []byte(chunk)); err != nil {
			sess.Send(map[string]interface{}{
				"op":              "append-failed",
				"client-event-id": clientEventID,
				"stream-id":       streamID,
				"message":         err.Error(),
			})
			return
		}
	}

	if done {
		h.db.CloseStream(ctx, streamID)
	}
	if abortReason != "" {
		h.db.AbortStream(ctx, streamID, abortReason)
	}

	st, _ := h.db.GetStream(ctx, streamID)
	offset := int64(0)
	if st != nil {
		offset = st.SizeBytes
	}

	sess.Send(map[string]interface{}{
		"op":              "stream-flushed",
		"client-event-id": clientEventID,
		"stream-id":       streamID,
		"offset":          offset,
		"done":            done || abortReason != "",
	})
}

func (h *Handler) handleSubscribeStream(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	appID := sess.AppID
	var streamID string
	if raw, ok := msg["stream-id"]; ok {
		json.Unmarshal(raw, &streamID)
	}

	var clientID string
	if raw, ok := msg["client-id"]; ok {
		json.Unmarshal(raw, &clientID)
	}

	// Resolve stream
	var stream *storage.StreamRecord
	if streamID != "" {
		stream, _ = h.db.GetStream(ctx, streamID)
	} else if clientID != "" {
		stream, _ = h.db.GetStreamByClientID(ctx, appID, clientID)
	}

	if stream == nil {
		sendError(sess, clientEventID, 404, "stream not found")
		return
	}

	var offset int64
	if raw, ok := msg["offset"]; ok {
		json.Unmarshal(raw, &offset)
	}

	// Read data from offset
	data, _ := h.db.GetStreamData(ctx, stream.ID, offset)

	sess.Send(map[string]interface{}{
		"op":              "stream-append",
		"client-event-id": clientEventID,
		"stream-id":       stream.ID,
		"client-id":       stream.ClientID,
		"data":            string(data),
		"offset":          offset + int64(len(data)),
		"done":            stream.Done,
	})
}

func (h *Handler) handleUnsubscribeStream(sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	sess.Send(map[string]interface{}{
		"op":              "unsubscribe-stream-ok",
		"client-event-id": clientEventID,
	})
}

// ---- Sync Table Handlers ----

func (h *Handler) handleStartSync(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	appID := sess.AppID
	var query json.RawMessage
	if raw, ok := msg["q"]; ok {
		query = raw
	}

	subID := generateStreamID()
	sub := &storage.SyncSubscription{
		ID:    subID,
		AppID: appID,
		Query: query,
	}

	if err := h.db.CreateSyncSubscription(ctx, sub); err != nil {
		sendError(sess, clientEventID, 500, err.Error())
		return
	}

	sess.Send(map[string]interface{}{
		"op":              "start-sync-ok",
		"client-event-id": clientEventID,
		"subscription-id": subID,
	})
}

func (h *Handler) handleRemoveSync(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	var subID string
	if raw, ok := msg["subscription-id"]; ok {
		json.Unmarshal(raw, &subID)
	}

	h.db.DeleteSyncSubscription(ctx, subID)

	sess.Send(map[string]interface{}{
		"op":              "remove-sync-ok",
		"client-event-id": clientEventID,
	})
}

func (h *Handler) handleRefreshSyncTable(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	if sess.Auth == nil {
		sendError(sess, clientEventID, 400, "init has not run")
		return
	}

	var subID string
	if raw, ok := msg["subscription-id"]; ok {
		json.Unmarshal(raw, &subID)
	}

	sub, _ := h.db.GetSyncSubscription(ctx, subID)
	if sub == nil {
		sendError(sess, clientEventID, 404, "subscription not found")
		return
	}

	// Get changes since last tx
	changes, _ := h.db.GetChangesSince(ctx, sub.AppID, sub.LastTxID, 100)

	var txes []interface{}
	for _, ch := range changes {
		txes = append(txes, map[string]interface{}{
			"tx-id":     ch.ID,
			"entity-id": ch.EntityID,
			"attr-id":   ch.AttrID,
			"value":     ch.Value,
			"action":    ch.Action,
		})
		sub.LastTxID = ch.ID
	}

	if len(changes) > 0 {
		h.db.UpdateSyncLastTxID(ctx, subID, sub.LastTxID)
	}

	sess.Send(map[string]interface{}{
		"op":              "sync-update-triples",
		"client-event-id": clientEventID,
		"subscription-id": subID,
		"txes":            txes,
	})
}

func (h *Handler) handleResyncTable(ctx context.Context, sess *reactive.Session, msg map[string]json.RawMessage, clientEventID string) {
	// Resync resets the sync position and sends all data
	h.handleRefreshSyncTable(ctx, sess, msg, clientEventID)
}

func generateStreamID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]))
}
