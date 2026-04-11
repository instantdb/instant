// Package storage implements the SQLite-backed triple store.
package storage

import (
	"encoding/json"
	"time"
)

// Triple represents an EAV triple in the store.
type Triple struct {
	EntityID  string          `json:"entity-id"`
	AttrID    string          `json:"attr-id"`
	Value     json.RawMessage `json:"value"`
	ValueMD5  string          `json:"value-md5"`
	CreatedAt int64           `json:"created-at"`
}

// Attr represents an attribute definition.
type Attr struct {
	ID               string   `json:"id"`
	AppID            string   `json:"app-id"`
	ForwardIdentity  [3]string `json:"forward-identity"`  // [id, etype, label]
	ReverseIdentity  [3]string `json:"reverse-identity"`  // [id, etype, label] (for refs)
	ValueType        string   `json:"value-type"`         // "blob" or "ref"
	Cardinality      string   `json:"cardinality"`        // "one" or "many"
	IsUnique         bool     `json:"unique?"`
	IsIndex          bool     `json:"index?"`
	IsRequired       bool     `json:"required?"`
	CheckedDataType  string   `json:"checked-data-type,omitempty"`
	InferredTypes    int32    `json:"inferred-types,omitempty"`
	Indexing         bool     `json:"indexing?,omitempty"`
	CheckingDataType bool     `json:"checking-data-type?,omitempty"`
	SettingUnique    bool     `json:"setting-unique?,omitempty"`
}

// FwdEtype returns the forward entity type.
func (a *Attr) FwdEtype() string {
	return a.ForwardIdentity[1]
}

// FwdLabel returns the forward label.
func (a *Attr) FwdLabel() string {
	return a.ForwardIdentity[2]
}

// RevEtype returns the reverse entity type (empty for blobs).
func (a *Attr) RevEtype() string {
	return a.ReverseIdentity[1]
}

// RevLabel returns the reverse label (empty for blobs).
func (a *Attr) RevLabel() string {
	return a.ReverseIdentity[2]
}

// App represents an application.
type App struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatorID string    `json:"creator-id"`
	AdminToken string   `json:"admin-token"`
	CreatedAt time.Time `json:"created-at"`
}

// AppUser represents an authenticated user in an app.
type AppUser struct {
	ID           string `json:"id"`
	AppID        string `json:"app-id"`
	Email        string `json:"email"`
	RefreshToken string `json:"refresh-token"`
}

// Rule represents a permission rule for an app.
type Rule struct {
	ID    string          `json:"id"`
	AppID string          `json:"app-id"`
	Code  json.RawMessage `json:"code"`
}

// FileRecord represents a file stored in the system.
type FileRecord struct {
	ID                 string `json:"id"`
	AppID              string `json:"app-id"`
	Path               string `json:"path"`
	URL                string `json:"url,omitempty"`
	ContentType        string `json:"content-type"`
	ContentDisposition string `json:"content-disposition,omitempty"`
	SizeBytes          int64  `json:"size-bytes"`
	CreatedAt          time.Time `json:"created-at,omitempty"`
}

// StreamRecord represents a data stream.
type StreamRecord struct {
	ID          string `json:"id"`
	AppID       string `json:"app-id"`
	ClientID    string `json:"client-id"`
	Done        bool   `json:"done"`
	SizeBytes   int64  `json:"size-bytes"`
	AbortReason string `json:"abort-reason,omitempty"`
	CreatedAt   time.Time `json:"created-at,omitempty"`
}

// SyncSubscription tracks a sync table subscription.
type SyncSubscription struct {
	ID        string          `json:"id"`
	AppID     string          `json:"app-id"`
	Query     json.RawMessage `json:"query"`
	LastTxID  int64           `json:"last-tx-id"`
	CreatedAt time.Time       `json:"created-at,omitempty"`
}

// ChangelogEntry records a mutation for reactive invalidation.
type ChangelogEntry struct {
	ID        int64           `json:"id"`
	AppID     string          `json:"app-id"`
	EntityID  string          `json:"entity-id"`
	AttrID    string          `json:"attr-id"`
	Value     json.RawMessage `json:"value"`
	Action    string          `json:"action"` // "insert", "update", "delete"
	CreatedAt time.Time       `json:"created-at"`
}

// TxStep represents a single step in a transaction.
type TxStep struct {
	Op       string          `json:"op"`
	EntityID interface{}     `json:"entity-id,omitempty"` // string or [attrID, value] lookup
	AttrID   string          `json:"attr-id,omitempty"`
	Value    json.RawMessage `json:"value,omitempty"`
	Etype    string          `json:"etype,omitempty"`
	Attr     *Attr           `json:"attr,omitempty"`
	AttrUpdate *Attr         `json:"attr-update,omitempty"`
	Opts     *TxOpts         `json:"opts,omitempty"`
}

// TxOpts are optional modifiers on a transaction step.
type TxOpts struct {
	Mode string `json:"mode,omitempty"` // "create", "update", "upsert"
}
