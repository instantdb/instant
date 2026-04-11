// Package admin implements the admin REST API.
package admin

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/necrodome/instant/server-go/pkg/auth"
	"github.com/necrodome/instant/server-go/pkg/engine"
	"github.com/necrodome/instant/server-go/pkg/storage"
)

// Handler implements the admin API routes.
type Handler struct {
	db      *storage.DB
	qe      *engine.QueryEngine
	txp     *engine.TxProcessor
	authSvc *auth.Service
}

// NewHandler creates a new admin handler.
func NewHandler(db *storage.DB, qe *engine.QueryEngine, txp *engine.TxProcessor, authSvc *auth.Service) *Handler {
	return &Handler{db: db, qe: qe, txp: txp, authSvc: authSvc}
}

func (h *Handler) getAppID(r *http.Request) string {
	appID := r.Header.Get("app-id")
	if appID == "" {
		appID = r.URL.Query().Get("app_id")
	}
	return appID
}

func (h *Handler) authenticate(r *http.Request) (string, bool, error) {
	appID := h.getAppID(r)
	if appID == "" {
		return "", false, nil
	}

	token := auth.ExtractBearerToken(r)
	if token == "" {
		return appID, false, nil
	}

	app, err := h.authSvc.VerifyAdminToken(r.Context(), appID, token)
	if err != nil {
		return appID, false, err
	}
	_ = app
	return appID, true, nil
}

// RegisterRoutes registers the admin API routes on a mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /admin/query", h.handleQuery)
	mux.HandleFunc("POST /admin/transact", h.handleTransact)
	mux.HandleFunc("GET /admin/apps", h.handleGetApp)
	mux.HandleFunc("POST /admin/apps", h.handleCreateApp)
	mux.HandleFunc("DELETE /admin/apps", h.handleDeleteApp)
	mux.HandleFunc("POST /admin/schema", h.handlePushSchema)
	mux.HandleFunc("GET /admin/schema", h.handleGetSchema)
	mux.HandleFunc("POST /admin/rules", h.handleSetRules)
	mux.HandleFunc("GET /admin/rules", h.handleGetRules)
	mux.HandleFunc("POST /admin/users", h.handleCreateUser)
	mux.HandleFunc("GET /admin/users", h.handleListUsers)
	mux.HandleFunc("POST /admin/sign-in-as-guest", h.handleSignInAsGuest)
	mux.HandleFunc("POST /admin/custom-auth-token", h.handleCustomAuthToken)
	mux.HandleFunc("DELETE /admin/users", h.handleDeleteUser)
	mux.HandleFunc("POST /admin/magic-code/send", h.handleMagicCodeSend)
	mux.HandleFunc("POST /admin/magic-code/verify", h.handleMagicCodeVerify)
	mux.HandleFunc("GET /health", h.handleHealth)
}

// getImpersonation extracts impersonation headers (as-email, as-token, as-guest).
func (h *Handler) getImpersonation(r *http.Request) (isAdmin bool, userID, userEmail string) {
	asEmail := r.Header.Get("as-email")
	asToken := r.Header.Get("as-token")
	asGuest := r.Header.Get("as-guest")

	if asGuest == "true" {
		return false, "", ""
	}
	if asEmail != "" {
		user, _ := h.db.GetAppUserByEmail(r.Context(), h.getAppID(r), asEmail)
		if user != nil {
			return false, user.ID, user.Email
		}
		return false, "", asEmail
	}
	if asToken != "" {
		user, _ := h.authSvc.VerifyRefreshToken(r.Context(), h.getAppID(r), asToken)
		if user != nil {
			return false, user.ID, user.Email
		}
		return false, "", ""
	}
	return true, "", "" // admin by default
}

func (h *Handler) handleQuery(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Query     json.RawMessage `json:"query"`
		Inference bool            `json:"inference"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	ctx := r.Context()
	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		writeError(w, 500, "failed to load attrs")
		return
	}

	result, err := h.qe.ExecuteQuery(ctx, appID, body.Query, attrs)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	writeJSON(w, 200, result.Data)
}

func (h *Handler) handleTransact(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Steps []json.RawMessage `json:"steps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	ctx := r.Context()
	attrs, err := h.db.GetAttrsByAppID(ctx, appID)
	if err != nil {
		writeError(w, 500, "failed to load attrs")
		return
	}

	result, err := h.txp.ProcessTransaction(ctx, appID, body.Steps, attrs)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{
		"status": "ok",
		"tx-id":  result.TxID,
	})
}

func (h *Handler) handleGetApp(w http.ResponseWriter, r *http.Request) {
	appID := h.getAppID(r)
	if appID == "" {
		writeError(w, 400, "app-id is required")
		return
	}

	app, err := h.db.GetApp(r.Context(), appID)
	if err != nil || app == nil {
		writeError(w, 404, "app not found")
		return
	}

	writeJSON(w, 200, map[string]interface{}{
		"app": map[string]interface{}{
			"id":    app.ID,
			"title": app.Title,
		},
	})
}

func (h *Handler) handleCreateApp(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title string `json:"title"`
		ID    string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	if body.ID == "" {
		body.ID = generateUUID()
	}

	adminToken := generateUUID()

	app := &storage.App{
		ID:         body.ID,
		Title:      body.Title,
		AdminToken: adminToken,
	}

	if err := h.db.CreateApp(r.Context(), app); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	// Create default "id" attrs for the app
	// (The client SDK expects the server to auto-create attrs)

	writeJSON(w, 200, map[string]interface{}{
		"app": map[string]interface{}{
			"id":          app.ID,
			"title":       app.Title,
			"admin-token": adminToken,
		},
	})
}

func (h *Handler) handleDeleteApp(w http.ResponseWriter, r *http.Request) {
	appID, authed, err := h.authenticate(r)
	if err != nil || !authed {
		writeError(w, 401, "unauthorized")
		return
	}

	if err := h.db.DeleteApp(r.Context(), appID); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (h *Handler) handlePushSchema(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Schema json.RawMessage `json:"schema"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	// Parse schema and create/update attrs
	var schema map[string]interface{}
	if err := json.Unmarshal(body.Schema, &schema); err != nil {
		writeError(w, 400, "invalid schema")
		return
	}

	ctx := r.Context()
	existingAttrs, _ := h.db.GetAttrsByAppID(ctx, appID)

	// Process entities and links from schema
	if entities, ok := schema["entities"].(map[string]interface{}); ok {
		for etype, entityDef := range entities {
			entityMap, ok := entityDef.(map[string]interface{})
			if !ok {
				continue
			}
			if attrs, ok := entityMap["attrs"].(map[string]interface{}); ok {
				for label, attrDef := range attrs {
					h.ensureAttr(ctx, appID, etype, label, attrDef, existingAttrs)
				}
			}
		}
	}

	if links, ok := schema["links"].(map[string]interface{}); ok {
		for linkName, linkDef := range links {
			h.ensureLink(ctx, appID, linkName, linkDef, existingAttrs)
		}
	}

	// Re-read attrs
	newAttrs, _ := h.db.GetAttrsByAppID(ctx, appID)
	writeJSON(w, 200, map[string]interface{}{
		"status": "ok",
		"attrs":  newAttrs,
	})
}

func (h *Handler) ensureAttr(ctx context.Context, appID, etype, label string, attrDef interface{}, existing []*storage.Attr) {
	// Check if attr already exists
	if storage.SeekAttrByFwdIdent(existing, etype, label) != nil {
		return
	}

	attr := &storage.Attr{
		ID:              generateUUID(),
		AppID:           appID,
		ForwardIdentity: [3]string{generateUUID(), etype, label},
		ValueType:       "blob",
		Cardinality:     "one",
	}

	if defMap, ok := attrDef.(map[string]interface{}); ok {
		if unique, ok := defMap["unique"].(bool); ok {
			attr.IsUnique = unique
		}
		if indexed, ok := defMap["indexed"].(bool); ok {
			attr.IsIndex = indexed
		}
		if required, ok := defMap["required"].(bool); ok {
			attr.IsRequired = required
		}
		if cdt, ok := defMap["type"].(string); ok {
			attr.CheckedDataType = cdt
		}
	}

	h.db.CreateAttr(ctx, attr)
}

func (h *Handler) ensureLink(ctx context.Context, appID, linkName string, linkDef interface{}, existing []*storage.Attr) {
	defMap, ok := linkDef.(map[string]interface{})
	if !ok {
		return
	}

	fwd, _ := defMap["forward"].(map[string]interface{})
	rev, _ := defMap["reverse"].(map[string]interface{})
	if fwd == nil || rev == nil {
		return
	}

	fwdOn, _ := fwd["on"].(string)
	fwdHas, _ := fwd["has"].(string)
	fwdLabel, _ := fwd["label"].(string)
	revOn, _ := rev["on"].(string)
	revHas, _ := rev["has"].(string)
	revLabel, _ := rev["label"].(string)

	_ = fwdHas
	_ = revHas

	// Check if link already exists
	if storage.SeekAttrByFwdIdent(existing, fwdOn, fwdLabel) != nil {
		return
	}

	cardinality := "many"

	attr := &storage.Attr{
		ID:              generateUUID(),
		AppID:           appID,
		ForwardIdentity: [3]string{generateUUID(), fwdOn, fwdLabel},
		ReverseIdentity: [3]string{generateUUID(), revOn, revLabel},
		ValueType:       "ref",
		Cardinality:     cardinality,
	}

	h.db.CreateAttr(ctx, attr)
}

func (h *Handler) handleGetSchema(w http.ResponseWriter, r *http.Request) {
	appID := h.getAppID(r)
	if appID == "" {
		writeError(w, 400, "app-id is required")
		return
	}

	attrs, err := h.db.GetAttrsByAppID(r.Context(), appID)
	if err != nil {
		writeError(w, 500, "failed to load attrs")
		return
	}

	writeJSON(w, 200, map[string]interface{}{"attrs": attrs})
}

func (h *Handler) handleSetRules(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Code json.RawMessage `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	if err := h.db.SetRules(r.Context(), appID, body.Code); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (h *Handler) handleGetRules(w http.ResponseWriter, r *http.Request) {
	appID := h.getAppID(r)
	if appID == "" {
		writeError(w, 400, "app-id is required")
		return
	}

	rules, err := h.db.GetRules(r.Context(), appID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	if rules == nil {
		writeJSON(w, 200, map[string]interface{}{"rules": json.RawMessage("{}")})
		return
	}

	writeJSON(w, 200, map[string]interface{}{"rules": rules.Code})
}

func (h *Handler) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	user := &storage.AppUser{
		ID:           generateUUID(),
		AppID:        appID,
		Email:        body.Email,
		RefreshToken: generateUUID(),
	}

	if err := h.db.CreateAppUser(r.Context(), user); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{"user": user})
}

func (h *Handler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	appID := h.getAppID(r)
	if appID == "" {
		writeError(w, 400, "app-id is required")
		return
	}

	// Simple implementation - query all users for the app
	rows, err := h.db.RawDB().QueryContext(r.Context(),
		`SELECT id, app_id, email, refresh_token FROM app_users WHERE app_id = ?`, appID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	defer rows.Close()

	var users []map[string]string
	for rows.Next() {
		var u storage.AppUser
		if err := rows.Scan(&u.ID, &u.AppID, &u.Email, &u.RefreshToken); err != nil {
			continue
		}
		users = append(users, map[string]string{
			"id":    u.ID,
			"email": u.Email,
		})
	}

	if users == nil {
		users = []map[string]string{}
	}

	writeJSON(w, 200, map[string]interface{}{"users": users})
}

func (h *Handler) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		UserID string `json:"user-id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	if err := h.db.DeleteAppUser(r.Context(), appID, body.UserID); err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func (h *Handler) handleMagicCodeSend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AppID string `json:"app-id"`
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	code, err := h.authSvc.SendMagicCode(body.AppID, body.Email)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	// In production, the code would be sent via email.
	// For the self-hosted SQLite backend, we return it directly.
	writeJSON(w, 200, map[string]interface{}{
		"status": "ok",
		"sent":   true,
		"code":   code, // Only in dev mode
	})
}

func (h *Handler) handleMagicCodeVerify(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AppID string `json:"app-id"`
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	user, token, err := h.authSvc.VerifyMagicCode(r.Context(), body.AppID, body.Email, body.Code)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{
		"user": map[string]interface{}{
			"id":            user.ID,
			"email":         user.Email,
			"refresh_token": user.RefreshToken,
		},
		"token": token,
	})
}

func (h *Handler) handleSignInAsGuest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AppID string `json:"app-id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	user, token, err := h.authSvc.SignInAsGuest(r.Context(), body.AppID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{
		"user": map[string]interface{}{
			"id":            user.ID,
			"refresh_token": user.RefreshToken,
			"is_guest":      true,
		},
		"token": token,
	})
}

func (h *Handler) handleCustomAuthToken(w http.ResponseWriter, r *http.Request) {
	appID, _, err := h.authenticate(r)
	if err != nil {
		writeError(w, 401, "unauthorized")
		return
	}

	var body struct {
		Email  string `json:"email"`
		UserID string `json:"user-id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid body")
		return
	}

	token, err := h.authSvc.CreateCustomToken(r.Context(), appID, body.Email, body.UserID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{"token": token})
}

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

// ---- Helpers ----

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]interface{}{
		"error":   true,
		"message": message,
	})
}

func generateUUID() string {
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
