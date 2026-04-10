// Package reactive implements the reactive query invalidation system.
package reactive

import (
	"encoding/json"
	"fmt"
	"sync"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

// Topic represents a subscription topic for invalidation.
type Topic string

// Invalidator watches for data changes and invalidates affected queries.
type Invalidator struct {
	db        *storage.DB
	mu        sync.RWMutex
	listeners map[string][]InvalidationHandler // topic -> handlers
	changeCh  chan storage.ChangelogEntry
	stopCh    chan struct{}
}

// InvalidationHandler is called when a topic is invalidated.
type InvalidationHandler func(appID string, entry *storage.ChangelogEntry)

// NewInvalidator creates a new invalidator.
func NewInvalidator(db *storage.DB) *Invalidator {
	return &Invalidator{
		db:        db,
		listeners: make(map[string][]InvalidationHandler),
		changeCh:  db.SubscribeChanges(),
		stopCh:    make(chan struct{}),
	}
}

// Start begins the invalidation loop.
func (inv *Invalidator) Start() {
	go inv.run()
}

// Stop shuts down the invalidator.
func (inv *Invalidator) Stop() {
	close(inv.stopCh)
	inv.db.UnsubscribeChanges(inv.changeCh)
}

func (inv *Invalidator) run() {
	for {
		select {
		case <-inv.stopCh:
			return
		case entry, ok := <-inv.changeCh:
			if !ok {
				return
			}
			inv.handleChange(entry)
		}
	}
}

func (inv *Invalidator) handleChange(entry storage.ChangelogEntry) {
	// Generate topics that this change affects
	topics := inv.generateTopics(entry)

	inv.mu.RLock()
	defer inv.mu.RUnlock()

	for _, topic := range topics {
		handlers, ok := inv.listeners[topic]
		if !ok {
			continue
		}
		for _, h := range handlers {
			h(entry.AppID, &entry)
		}
	}
}

func (inv *Invalidator) generateTopics(entry storage.ChangelogEntry) []string {
	var topics []string

	// ea topic: app_id:attr_id:ea
	topics = append(topics, fmt.Sprintf("%s:%s:ea", entry.AppID, entry.AttrID))

	// av topic: app_id:attr_id:av
	topics = append(topics, fmt.Sprintf("%s:%s:av", entry.AppID, entry.AttrID))

	// eav topic: app_id:entity_id:attr_id:eav
	topics = append(topics, fmt.Sprintf("%s:%s:%s:eav", entry.AppID, entry.EntityID, entry.AttrID))

	// vae topic: app_id:attr_id:vae
	topics = append(topics, fmt.Sprintf("%s:%s:vae", entry.AppID, entry.AttrID))

	return topics
}

// Subscribe registers a handler for the given topics.
func (inv *Invalidator) Subscribe(topics []string, handler InvalidationHandler) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	for _, topic := range topics {
		inv.listeners[topic] = append(inv.listeners[topic], handler)
	}
}

// Unsubscribe removes all handlers for the given topics that match the handler.
// Since Go functions aren't comparable, we remove by index tracking externally.
func (inv *Invalidator) UnsubscribeAll(topics []string) {
	inv.mu.Lock()
	defer inv.mu.Unlock()
	for _, topic := range topics {
		delete(inv.listeners, topic)
	}
}

// ---- Session Store ----

// SessionStore tracks active sessions and their subscriptions.
type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

// Session represents an active client connection.
type Session struct {
	ID       string
	AppID    string
	Auth     *SessionAuth
	Features map[string]bool
	Queries  map[string]*QuerySub // client-event-id -> subscription
	SendFn   func(msg interface{})
	mu       sync.RWMutex
}

// SessionAuth holds auth info for a session.
type SessionAuth struct {
	App    *storage.App     `json:"app"`
	User   *storage.AppUser `json:"user"`
	Admin  bool             `json:"admin?"`
}

// QuerySub tracks a single query subscription.
type QuerySub struct {
	Query     json.RawMessage `json:"query"`
	Hash      string          `json:"hash"`
	Topics    []string        `json:"topics"`
	LastResult interface{}    `json:"last-result"`
}

// NewSessionStore creates a new session store.
func NewSessionStore() *SessionStore {
	return &SessionStore{
		sessions: make(map[string]*Session),
	}
}

// AddSession registers a new session.
func (ss *SessionStore) AddSession(sess *Session) {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	ss.sessions[sess.ID] = sess
}

// RemoveSession removes a session.
func (ss *SessionStore) RemoveSession(id string) *Session {
	ss.mu.Lock()
	defer ss.mu.Unlock()
	sess, ok := ss.sessions[id]
	if ok {
		delete(ss.sessions, id)
	}
	return sess
}

// GetSession retrieves a session by ID.
func (ss *SessionStore) GetSession(id string) *Session {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	return ss.sessions[id]
}

// GetSessionsByApp returns all sessions for an app.
func (ss *SessionStore) GetSessionsByApp(appID string) []*Session {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	var result []*Session
	for _, s := range ss.sessions {
		if s.AppID == appID {
			result = append(result, s)
		}
	}
	return result
}

// SessionCount returns the number of active sessions.
func (ss *SessionStore) SessionCount() int {
	ss.mu.RLock()
	defer ss.mu.RUnlock()
	return len(ss.sessions)
}

// AddQuery adds a query subscription to a session.
func (s *Session) AddQuery(eventID string, sub *QuerySub) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Queries == nil {
		s.Queries = make(map[string]*QuerySub)
	}
	s.Queries[eventID] = sub
}

// RemoveQuery removes a query subscription from a session.
func (s *Session) RemoveQuery(eventID string) *QuerySub {
	s.mu.Lock()
	defer s.mu.Unlock()
	sub, ok := s.Queries[eventID]
	if ok {
		delete(s.Queries, eventID)
	}
	return sub
}

// GetQueries returns all query subscriptions.
func (s *Session) GetQueries() map[string]*QuerySub {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// Return a copy
	result := make(map[string]*QuerySub, len(s.Queries))
	for k, v := range s.Queries {
		result[k] = v
	}
	return result
}

// Send sends a message to the session.
func (s *Session) Send(msg interface{}) {
	if s.SendFn != nil {
		s.SendFn(msg)
	}
}

// TopicFromAttr creates a topic string from app and attr ids.
func TopicFromAttr(appID, attrID, index string) string {
	return fmt.Sprintf("%s:%s:%s", appID, attrID, index)
}
