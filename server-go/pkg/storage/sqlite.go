package storage

import (
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// DB wraps an SQLite connection with the triple store operations.
type DB struct {
	db          *sql.DB
	mu          sync.RWMutex
	changeSubMu sync.RWMutex
	changeSubs  []chan ChangelogEntry
}

// Open creates a new DB backed by the given SQLite file path.
func Open(path string) (*DB, error) {
	dsn := path + "?_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=5000&_foreign_keys=ON"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite writes are single-writer
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(0)

	store := &DB{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return store, nil
}

// Close closes the database.
func (s *DB) Close() error {
	return s.db.Close()
}

// RawDB returns the underlying sql.DB for advanced use cases.
func (s *DB) RawDB() *sql.DB {
	return s.db
}

func (s *DB) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS apps (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT '',
			creator_id TEXT NOT NULL DEFAULT '',
			admin_token TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS app_users (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
			email TEXT NOT NULL DEFAULT '',
			refresh_token TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_app_email ON app_users(app_id, email)`,
		`CREATE INDEX IF NOT EXISTS idx_app_users_refresh_token ON app_users(app_id, refresh_token)`,
		`CREATE TABLE IF NOT EXISTS attrs (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
			fwd_ident_id TEXT NOT NULL DEFAULT '',
			fwd_etype TEXT NOT NULL DEFAULT '',
			fwd_label TEXT NOT NULL DEFAULT '',
			rev_ident_id TEXT NOT NULL DEFAULT '',
			rev_etype TEXT NOT NULL DEFAULT '',
			rev_label TEXT NOT NULL DEFAULT '',
			value_type TEXT NOT NULL DEFAULT 'blob',
			cardinality TEXT NOT NULL DEFAULT 'one',
			is_unique INTEGER NOT NULL DEFAULT 0,
			is_index INTEGER NOT NULL DEFAULT 0,
			is_required INTEGER NOT NULL DEFAULT 0,
			checked_data_type TEXT NOT NULL DEFAULT '',
			inferred_types INTEGER NOT NULL DEFAULT 0,
			indexing INTEGER NOT NULL DEFAULT 0,
			checking_data_type INTEGER NOT NULL DEFAULT 0,
			setting_unique INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_attrs_app_id ON attrs(app_id)`,
		`CREATE INDEX IF NOT EXISTS idx_attrs_fwd ON attrs(app_id, fwd_etype, fwd_label)`,
		`CREATE INDEX IF NOT EXISTS idx_attrs_rev ON attrs(app_id, rev_etype, rev_label)`,
		`CREATE TABLE IF NOT EXISTS triples (
			app_id TEXT NOT NULL,
			entity_id TEXT NOT NULL,
			attr_id TEXT NOT NULL,
			value TEXT NOT NULL DEFAULT 'null',
			value_md5 TEXT NOT NULL DEFAULT '',
			ea INTEGER NOT NULL DEFAULT 0,
			eav INTEGER NOT NULL DEFAULT 0,
			av INTEGER NOT NULL DEFAULT 0,
			ave INTEGER NOT NULL DEFAULT 0,
			vae INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT 0,
			FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE,
			FOREIGN KEY (attr_id) REFERENCES attrs(id) ON DELETE CASCADE
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_triples_pk ON triples(app_id, entity_id, attr_id, value_md5)`,
		`CREATE INDEX IF NOT EXISTS idx_triples_ea ON triples(app_id, attr_id, entity_id) WHERE ea = 1`,
		`CREATE INDEX IF NOT EXISTS idx_triples_eav ON triples(app_id, entity_id, attr_id, value) WHERE eav = 1`,
		`CREATE INDEX IF NOT EXISTS idx_triples_av ON triples(app_id, attr_id, value) WHERE av = 1`,
		`CREATE INDEX IF NOT EXISTS idx_triples_ave ON triples(app_id, attr_id, value, entity_id) WHERE ave = 1`,
		`CREATE INDEX IF NOT EXISTS idx_triples_vae ON triples(app_id, value, attr_id, entity_id) WHERE vae = 1`,
		`CREATE TABLE IF NOT EXISTS rules (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
			code TEXT NOT NULL DEFAULT '{}'
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_app_id ON rules(app_id)`,
		`CREATE TABLE IF NOT EXISTS changelog (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			app_id TEXT NOT NULL,
			entity_id TEXT NOT NULL DEFAULT '',
			attr_id TEXT NOT NULL DEFAULT '',
			value TEXT NOT NULL DEFAULT 'null',
			action TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_changelog_app_id ON changelog(app_id, id)`,
		// Files table
		`CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL,
			path TEXT NOT NULL DEFAULT '',
			content_type TEXT NOT NULL DEFAULT '',
			content_disposition TEXT NOT NULL DEFAULT '',
			size_bytes INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_files_app_id ON files(app_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_files_app_path ON files(app_id, path)`,
		// Streams table
		`CREATE TABLE IF NOT EXISTS streams (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL,
			client_id TEXT NOT NULL DEFAULT '',
			done INTEGER NOT NULL DEFAULT 0,
			size_bytes INTEGER NOT NULL DEFAULT 0,
			abort_reason TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_streams_app_id ON streams(app_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_streams_client_id ON streams(app_id, client_id)`,
		// Stream data chunks
		`CREATE TABLE IF NOT EXISTS stream_data (
			stream_id TEXT NOT NULL,
			seq INTEGER NOT NULL,
			data BLOB NOT NULL,
			PRIMARY KEY (stream_id, seq),
			FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
		)`,
		// Sync subscriptions
		`CREATE TABLE IF NOT EXISTS sync_subscriptions (
			id TEXT PRIMARY KEY,
			app_id TEXT NOT NULL,
			query TEXT NOT NULL DEFAULT '{}',
			last_tx_id INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_sync_subs_app_id ON sync_subscriptions(app_id)`,
		// OAuth states
		`CREATE TABLE IF NOT EXISTS oauth_states (
			state TEXT PRIMARY KEY,
			app_id TEXT NOT NULL,
			provider TEXT NOT NULL DEFAULT '',
			redirect_url TEXT NOT NULL DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		// Trigger to log inserts
		`CREATE TRIGGER IF NOT EXISTS triples_after_insert AFTER INSERT ON triples
		BEGIN
			INSERT INTO changelog(app_id, entity_id, attr_id, value, action)
			VALUES (NEW.app_id, NEW.entity_id, NEW.attr_id, NEW.value, 'insert');
		END`,
		// Trigger to log updates
		`CREATE TRIGGER IF NOT EXISTS triples_after_update AFTER UPDATE ON triples
		BEGIN
			INSERT INTO changelog(app_id, entity_id, attr_id, value, action)
			VALUES (NEW.app_id, NEW.entity_id, NEW.attr_id, NEW.value, 'update');
		END`,
		// Trigger to log deletes
		`CREATE TRIGGER IF NOT EXISTS triples_after_delete AFTER DELETE ON triples
		BEGIN
			INSERT INTO changelog(app_id, entity_id, attr_id, value, action)
			VALUES (OLD.app_id, OLD.entity_id, OLD.attr_id, OLD.value, 'delete');
		END`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("exec migration %q: %w", stmt[:min(len(stmt), 60)], err)
		}
	}
	return nil
}

// ---- App CRUD ----

func (s *DB) CreateApp(ctx context.Context, app *App) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO apps(id, title, creator_id, admin_token, created_at)
		 VALUES (?, ?, ?, ?, ?)`,
		app.ID, app.Title, app.CreatorID, app.AdminToken, app.CreatedAt)
	return err
}

func (s *DB) GetApp(ctx context.Context, id string) (*App, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, title, creator_id, admin_token, created_at FROM apps WHERE id = ?`, id)
	var app App
	if err := row.Scan(&app.ID, &app.Title, &app.CreatorID, &app.AdminToken, &app.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &app, nil
}

func (s *DB) DeleteApp(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM apps WHERE id = ?`, id)
	return err
}

// ---- Attr CRUD ----

func (s *DB) CreateAttr(ctx context.Context, attr *Attr) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO attrs(id, app_id, fwd_ident_id, fwd_etype, fwd_label,
		  rev_ident_id, rev_etype, rev_label, value_type, cardinality,
		  is_unique, is_index, is_required, checked_data_type, inferred_types)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		attr.ID, attr.AppID,
		attr.ForwardIdentity[0], attr.ForwardIdentity[1], attr.ForwardIdentity[2],
		attr.ReverseIdentity[0], attr.ReverseIdentity[1], attr.ReverseIdentity[2],
		attr.ValueType, attr.Cardinality,
		boolToInt(attr.IsUnique), boolToInt(attr.IsIndex),
		boolToInt(attr.IsRequired), attr.CheckedDataType, attr.InferredTypes)
	return err
}

func (s *DB) UpdateAttr(ctx context.Context, attr *Attr) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE attrs SET
		  fwd_ident_id=?, fwd_etype=?, fwd_label=?,
		  rev_ident_id=?, rev_etype=?, rev_label=?,
		  value_type=?, cardinality=?,
		  is_unique=?, is_index=?, is_required=?,
		  checked_data_type=?, inferred_types=?
		 WHERE id = ?`,
		attr.ForwardIdentity[0], attr.ForwardIdentity[1], attr.ForwardIdentity[2],
		attr.ReverseIdentity[0], attr.ReverseIdentity[1], attr.ReverseIdentity[2],
		attr.ValueType, attr.Cardinality,
		boolToInt(attr.IsUnique), boolToInt(attr.IsIndex),
		boolToInt(attr.IsRequired), attr.CheckedDataType, attr.InferredTypes,
		attr.ID)
	return err
}

func (s *DB) DeleteAttr(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM attrs WHERE id = ?`, id)
	return err
}

func (s *DB) GetAttrsByAppID(ctx context.Context, appID string) ([]*Attr, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, app_id, fwd_ident_id, fwd_etype, fwd_label,
		  rev_ident_id, rev_etype, rev_label, value_type, cardinality,
		  is_unique, is_index, is_required, checked_data_type, inferred_types,
		  indexing, checking_data_type, setting_unique
		 FROM attrs WHERE app_id = ?`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var attrs []*Attr
	for rows.Next() {
		a := &Attr{}
		var isUnique, isIndex, isRequired, indexing, checking, setting int
		if err := rows.Scan(
			&a.ID, &a.AppID,
			&a.ForwardIdentity[0], &a.ForwardIdentity[1], &a.ForwardIdentity[2],
			&a.ReverseIdentity[0], &a.ReverseIdentity[1], &a.ReverseIdentity[2],
			&a.ValueType, &a.Cardinality,
			&isUnique, &isIndex, &isRequired,
			&a.CheckedDataType, &a.InferredTypes,
			&indexing, &checking, &setting,
		); err != nil {
			return nil, err
		}
		a.IsUnique = isUnique != 0
		a.IsIndex = isIndex != 0
		a.IsRequired = isRequired != 0
		a.Indexing = indexing != 0
		a.CheckingDataType = checking != 0
		a.SettingUnique = setting != 0
		attrs = append(attrs, a)
	}
	return attrs, rows.Err()
}

func (s *DB) GetAttrByID(ctx context.Context, id string) (*Attr, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, fwd_ident_id, fwd_etype, fwd_label,
		  rev_ident_id, rev_etype, rev_label, value_type, cardinality,
		  is_unique, is_index, is_required, checked_data_type, inferred_types,
		  indexing, checking_data_type, setting_unique
		 FROM attrs WHERE id = ?`, id)
	a := &Attr{}
	var isUnique, isIndex, isRequired, indexing, checking, setting int
	if err := row.Scan(
		&a.ID, &a.AppID,
		&a.ForwardIdentity[0], &a.ForwardIdentity[1], &a.ForwardIdentity[2],
		&a.ReverseIdentity[0], &a.ReverseIdentity[1], &a.ReverseIdentity[2],
		&a.ValueType, &a.Cardinality,
		&isUnique, &isIndex, &isRequired,
		&a.CheckedDataType, &a.InferredTypes,
		&indexing, &checking, &setting,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	a.IsUnique = isUnique != 0
	a.IsIndex = isIndex != 0
	a.IsRequired = isRequired != 0
	a.Indexing = indexing != 0
	a.CheckingDataType = checking != 0
	a.SettingUnique = setting != 0
	return a, nil
}

// ---- Triple CRUD ----

func valueMD5(value json.RawMessage) string {
	h := md5.Sum(value)
	return hex.EncodeToString(h[:])
}

// IndexFlags computes which indexes a triple should be in, based on the attribute.
func IndexFlags(attr *Attr) (ea, eav, av, ave, vae bool) {
	if attr == nil {
		return true, false, false, false, false
	}
	ea = true
	if attr.ValueType == "ref" {
		vae = true
		eav = true
	}
	if attr.IsIndex || attr.IsUnique {
		av = true
		ave = true
		eav = true
	}
	return
}

func (s *DB) InsertTriple(ctx context.Context, appID string, t *Triple, attr *Attr) error {
	ea, eav, av, ave, vae := IndexFlags(attr)
	md5 := valueMD5(t.Value)
	now := time.Now().UnixMilli()
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO triples(app_id, entity_id, attr_id, value, value_md5, ea, eav, av, ave, vae, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(app_id, entity_id, attr_id, value_md5) DO UPDATE SET value=excluded.value, created_at=excluded.created_at`,
		appID, t.EntityID, t.AttrID, string(t.Value), md5,
		boolToInt(ea), boolToInt(eav), boolToInt(av), boolToInt(ave), boolToInt(vae), now)
	return err
}

func (s *DB) DeleteTriple(ctx context.Context, appID, entityID, attrID string, value json.RawMessage) error {
	md5 := valueMD5(value)
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ? AND value_md5 = ?`,
		appID, entityID, attrID, md5)
	return err
}

func (s *DB) DeleteEntityTriples(ctx context.Context, appID, entityID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ?`,
		appID, entityID)
	return err
}

// RetractTriplesByAttr retracts all triples for an entity+attr (cardinality:one upsert).
func (s *DB) RetractTriplesByAttr(ctx context.Context, appID, entityID, attrID string) (int64, error) {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ?`,
		appID, entityID, attrID)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// GetTriplesByEntity returns all triples for an entity.
func (s *DB) GetTriplesByEntity(ctx context.Context, appID, entityID string) ([]*Triple, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT entity_id, attr_id, value, value_md5, created_at
		 FROM triples WHERE app_id = ? AND entity_id = ?`, appID, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTriples(rows)
}

// GetTriplesByAttr returns all triples for an attr (ea index scan).
func (s *DB) GetTriplesByAttr(ctx context.Context, appID, attrID string) ([]*Triple, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT entity_id, attr_id, value, value_md5, created_at
		 FROM triples WHERE app_id = ? AND attr_id = ? AND ea = 1`, appID, attrID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTriples(rows)
}

// QueryTriples executes a parameterized query returning triples.
func (s *DB) QueryTriples(ctx context.Context, query string, args ...interface{}) ([]*Triple, error) {
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTriples(rows)
}

func scanTriples(rows *sql.Rows) ([]*Triple, error) {
	var triples []*Triple
	for rows.Next() {
		t := &Triple{}
		var valStr string
		if err := rows.Scan(&t.EntityID, &t.AttrID, &valStr, &t.ValueMD5, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.Value = json.RawMessage(valStr)
		triples = append(triples, t)
	}
	return triples, rows.Err()
}

// LookupEntityByUniqueAttr finds an entity by a unique attr value.
func (s *DB) LookupEntityByUniqueAttr(ctx context.Context, appID, attrID string, value json.RawMessage) (string, error) {
	md5 := valueMD5(value)
	var entityID string
	err := s.db.QueryRowContext(ctx,
		`SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND value_md5 = ? AND av = 1`,
		appID, attrID, md5).Scan(&entityID)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return entityID, err
}

// ---- App User ----

func (s *DB) CreateAppUser(ctx context.Context, u *AppUser) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO app_users(id, app_id, email, refresh_token)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(app_id, email) DO UPDATE SET refresh_token=excluded.refresh_token`,
		u.ID, u.AppID, u.Email, u.RefreshToken)
	return err
}

func (s *DB) GetAppUserByRefreshToken(ctx context.Context, appID, token string) (*AppUser, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, email, refresh_token FROM app_users WHERE app_id = ? AND refresh_token = ?`,
		appID, token)
	var u AppUser
	if err := row.Scan(&u.ID, &u.AppID, &u.Email, &u.RefreshToken); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *DB) GetAppUserByEmail(ctx context.Context, appID, email string) (*AppUser, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, email, refresh_token FROM app_users WHERE app_id = ? AND email = ?`,
		appID, email)
	var u AppUser
	if err := row.Scan(&u.ID, &u.AppID, &u.Email, &u.RefreshToken); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *DB) GetAppUserByID(ctx context.Context, id string) (*AppUser, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, email, refresh_token FROM app_users WHERE id = ?`, id)
	var u AppUser
	if err := row.Scan(&u.ID, &u.AppID, &u.Email, &u.RefreshToken); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (s *DB) DeleteAppUser(ctx context.Context, appID, userID string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM app_users WHERE app_id = ? AND id = ?`, appID, userID)
	return err
}

// ---- Rules ----

func (s *DB) SetRules(ctx context.Context, appID string, code json.RawMessage) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO rules(id, app_id, code) VALUES (?, ?, ?)
		 ON CONFLICT(app_id) DO UPDATE SET code=excluded.code`,
		appID, appID, string(code))
	return err
}

func (s *DB) GetRules(ctx context.Context, appID string) (*Rule, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, code FROM rules WHERE app_id = ?`, appID)
	var r Rule
	var code string
	if err := row.Scan(&r.ID, &r.AppID, &code); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	r.Code = json.RawMessage(code)
	return &r, nil
}

// ---- Changelog (for reactive invalidation) ----

func (s *DB) GetChangesSince(ctx context.Context, appID string, sinceID int64, limit int) ([]*ChangelogEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, app_id, entity_id, attr_id, value, action, created_at
		 FROM changelog WHERE app_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
		appID, sinceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []*ChangelogEntry
	for rows.Next() {
		e := &ChangelogEntry{}
		var valStr string
		if err := rows.Scan(&e.ID, &e.AppID, &e.EntityID, &e.AttrID, &valStr, &e.Action, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Value = json.RawMessage(valStr)
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// TruncateChangelog removes changelog entries older than the given ID.
func (s *DB) TruncateChangelog(ctx context.Context, appID string, beforeID int64) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM changelog WHERE app_id = ? AND id < ?`, appID, beforeID)
	return err
}

// SubscribeChanges returns a channel that receives new changelog entries.
func (s *DB) SubscribeChanges() chan ChangelogEntry {
	ch := make(chan ChangelogEntry, 256)
	s.changeSubMu.Lock()
	s.changeSubs = append(s.changeSubs, ch)
	s.changeSubMu.Unlock()
	return ch
}

// UnsubscribeChanges removes a subscription channel.
func (s *DB) UnsubscribeChanges(ch chan ChangelogEntry) {
	s.changeSubMu.Lock()
	defer s.changeSubMu.Unlock()
	for i, sub := range s.changeSubs {
		if sub == ch {
			s.changeSubs = append(s.changeSubs[:i], s.changeSubs[i+1:]...)
			close(ch)
			return
		}
	}
}

// NotifyChange pushes a changelog entry to all subscribers (called after tx).
func (s *DB) NotifyChange(entry ChangelogEntry) {
	s.changeSubMu.RLock()
	defer s.changeSubMu.RUnlock()
	for _, ch := range s.changeSubs {
		select {
		case ch <- entry:
		default:
			// drop if subscriber is too slow
		}
	}
}

// ---- Files ----

func (s *DB) CreateFile(ctx context.Context, f *FileRecord) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO files(id, app_id, path, content_type, content_disposition, size_bytes)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(app_id, path) DO UPDATE SET content_type=excluded.content_type, size_bytes=excluded.size_bytes`,
		f.ID, f.AppID, f.Path, f.ContentType, f.ContentDisposition, f.SizeBytes)
	return err
}

func (s *DB) GetFilesByAppID(ctx context.Context, appID string) ([]*FileRecord, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, app_id, path, content_type, content_disposition, size_bytes, created_at
		 FROM files WHERE app_id = ? ORDER BY created_at ASC`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var files []*FileRecord
	for rows.Next() {
		f := &FileRecord{}
		if err := rows.Scan(&f.ID, &f.AppID, &f.Path, &f.ContentType, &f.ContentDisposition, &f.SizeBytes, &f.CreatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

func (s *DB) GetFile(ctx context.Context, appID, fileID string) (*FileRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, path, content_type, content_disposition, size_bytes, created_at
		 FROM files WHERE app_id = ? AND id = ?`, appID, fileID)
	f := &FileRecord{}
	if err := row.Scan(&f.ID, &f.AppID, &f.Path, &f.ContentType, &f.ContentDisposition, &f.SizeBytes, &f.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return f, nil
}

func (s *DB) DeleteFile(ctx context.Context, appID, fileID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM files WHERE app_id = ? AND id = ?`, appID, fileID)
	return err
}

// ---- Streams ----

func (s *DB) CreateStream(ctx context.Context, st *StreamRecord) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO streams(id, app_id, client_id) VALUES (?, ?, ?)
		 ON CONFLICT(app_id, client_id) DO UPDATE SET done=0, size_bytes=0, abort_reason=''`,
		st.ID, st.AppID, st.ClientID)
	return err
}

func (s *DB) GetStream(ctx context.Context, streamID string) (*StreamRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, client_id, done, size_bytes, abort_reason, created_at
		 FROM streams WHERE id = ?`, streamID)
	st := &StreamRecord{}
	var done int
	if err := row.Scan(&st.ID, &st.AppID, &st.ClientID, &done, &st.SizeBytes, &st.AbortReason, &st.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	st.Done = done != 0
	return st, nil
}

func (s *DB) GetStreamByClientID(ctx context.Context, appID, clientID string) (*StreamRecord, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, client_id, done, size_bytes, abort_reason, created_at
		 FROM streams WHERE app_id = ? AND client_id = ?`, appID, clientID)
	st := &StreamRecord{}
	var done int
	if err := row.Scan(&st.ID, &st.AppID, &st.ClientID, &done, &st.SizeBytes, &st.AbortReason, &st.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	st.Done = done != 0
	return st, nil
}

func (s *DB) AppendStreamData(ctx context.Context, streamID string, data []byte) error {
	// Get next sequence number
	var maxSeq int64
	s.db.QueryRowContext(ctx,
		`SELECT COALESCE(MAX(seq), -1) FROM stream_data WHERE stream_id = ?`, streamID).Scan(&maxSeq)

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO stream_data(stream_id, seq, data) VALUES (?, ?, ?)`,
		streamID, maxSeq+1, data)
	if err != nil {
		return err
	}

	// Update size
	_, err = s.db.ExecContext(ctx,
		`UPDATE streams SET size_bytes = size_bytes + ? WHERE id = ?`,
		len(data), streamID)
	return err
}

func (s *DB) GetStreamData(ctx context.Context, streamID string, byteOffset int64) ([]byte, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT data FROM stream_data WHERE stream_id = ? ORDER BY seq ASC`, streamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []byte
	for rows.Next() {
		var chunk []byte
		if err := rows.Scan(&chunk); err != nil {
			return nil, err
		}
		all = append(all, chunk...)
	}
	if byteOffset > 0 && int64(len(all)) > byteOffset {
		all = all[byteOffset:]
	} else if byteOffset > 0 {
		all = nil
	}
	return all, rows.Err()
}

func (s *DB) CloseStream(ctx context.Context, streamID string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE streams SET done = 1 WHERE id = ?`, streamID)
	return err
}

func (s *DB) AbortStream(ctx context.Context, streamID, reason string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE streams SET done = 1, abort_reason = ? WHERE id = ?`, reason, streamID)
	return err
}

// ---- Sync Subscriptions ----

func (s *DB) CreateSyncSubscription(ctx context.Context, sub *SyncSubscription) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sync_subscriptions(id, app_id, query) VALUES (?, ?, ?)`,
		sub.ID, sub.AppID, string(sub.Query))
	return err
}

func (s *DB) GetSyncSubscription(ctx context.Context, id string) (*SyncSubscription, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, app_id, query, last_tx_id, created_at FROM sync_subscriptions WHERE id = ?`, id)
	sub := &SyncSubscription{}
	var query string
	if err := row.Scan(&sub.ID, &sub.AppID, &query, &sub.LastTxID, &sub.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	sub.Query = json.RawMessage(query)
	return sub, nil
}

func (s *DB) DeleteSyncSubscription(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sync_subscriptions WHERE id = ?`, id)
	return err
}

func (s *DB) UpdateSyncLastTxID(ctx context.Context, id string, txID int64) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE sync_subscriptions SET last_tx_id = ? WHERE id = ?`, txID, id)
	return err
}

// ---- Transaction execution ----

// ExecTx runs a function within a database transaction.
func (s *DB) ExecTx(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// ---- Helpers ----

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// BuildAttrMap creates a lookup map from attr ID to Attr.
func BuildAttrMap(attrs []*Attr) map[string]*Attr {
	m := make(map[string]*Attr, len(attrs))
	for _, a := range attrs {
		m[a.ID] = a
	}
	return m
}

// SeekAttrByFwdIdent finds an attr by [etype, label] in a list.
func SeekAttrByFwdIdent(attrs []*Attr, etype, label string) *Attr {
	for _, a := range attrs {
		if a.FwdEtype() == etype && a.FwdLabel() == label {
			return a
		}
	}
	return nil
}

// SeekAttrByRevIdent finds an attr by reverse [etype, label] in a list.
func SeekAttrByRevIdent(attrs []*Attr, etype, label string) *Attr {
	for _, a := range attrs {
		if a.RevEtype() == etype && a.RevLabel() == label {
			return a
		}
	}
	return nil
}

// JSONValue marshals a Go value to json.RawMessage for storage.
func JSONValue(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage("null")
	}
	return b
}

// DeepMerge merges two JSON objects, with b overriding a.
func DeepMerge(a, b json.RawMessage) json.RawMessage {
	var aMap, bMap map[string]json.RawMessage
	if json.Unmarshal(a, &aMap) != nil {
		return b
	}
	if json.Unmarshal(b, &bMap) != nil {
		return b
	}
	for k, v := range bMap {
		if existing, ok := aMap[k]; ok {
			aMap[k] = DeepMerge(existing, v)
		} else {
			aMap[k] = v
		}
	}
	result, _ := json.Marshal(aMap)
	return result
}

// WhereClause helps build dynamic WHERE clauses.
type WhereClause struct {
	parts []string
	args  []interface{}
}

func NewWhere() *WhereClause {
	return &WhereClause{}
}

func (w *WhereClause) And(clause string, args ...interface{}) *WhereClause {
	w.parts = append(w.parts, clause)
	w.args = append(w.args, args...)
	return w
}

func (w *WhereClause) Build() (string, []interface{}) {
	if len(w.parts) == 0 {
		return "1=1", nil
	}
	return strings.Join(w.parts, " AND "), w.args
}
