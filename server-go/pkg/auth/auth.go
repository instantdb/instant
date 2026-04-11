// Package auth handles JWT verification, OAuth, and magic code authentication.
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
	ErrUserNotFound = errors.New("user not found")
	ErrInvalidCode  = errors.New("invalid magic code")
)

// Service handles authentication.
type Service struct {
	db         *storage.DB
	jwtSecret  []byte
	mu         sync.RWMutex
	magicCodes map[string]*MagicCode
}

// MagicCode holds a pending magic code.
type MagicCode struct {
	Code      string
	AppID     string
	Email     string
	ExpiresAt time.Time
}

// NewService creates a new auth service.
func NewService(db *storage.DB, jwtSecret string) *Service {
	if jwtSecret == "" {
		jwtSecret = "instant-dev-secret"
	}
	return &Service{
		db:         db,
		jwtSecret:  []byte(jwtSecret),
		magicCodes: make(map[string]*MagicCode),
	}
}

// ---- JWT (minimal HS256 implementation) ----

// JWTClaims holds the claims in a JWT.
type JWTClaims struct {
	AppID  string `json:"app_id,omitempty"`
	UserID string `json:"user_id,omitempty"`
	Email  string `json:"email,omitempty"`
	Exp    int64  `json:"exp,omitempty"`
	Iat    int64  `json:"iat,omitempty"`
}

// CreateToken creates a JWT for a user.
func (s *Service) CreateToken(appID, userID, email string) (string, error) {
	header := base64URLEncode([]byte(`{"alg":"HS256","typ":"JWT"}`))

	claims := JWTClaims{
		AppID:  appID,
		UserID: userID,
		Email:  email,
		Exp:    time.Now().Add(30 * 24 * time.Hour).Unix(),
		Iat:    time.Now().Unix(),
	}
	claimsJSON, _ := json.Marshal(claims)
	payload := base64URLEncode(claimsJSON)

	signingInput := header + "." + payload
	sig := signHS256([]byte(signingInput), s.jwtSecret)

	return signingInput + "." + sig, nil
}

// VerifyToken verifies a JWT and returns the claims.
func (s *Service) VerifyToken(tokenStr string) (*JWTClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, ErrInvalidToken
	}

	signingInput := parts[0] + "." + parts[1]
	expectedSig := signHS256([]byte(signingInput), s.jwtSecret)

	if parts[2] != expectedSig {
		return nil, ErrInvalidToken
	}

	claimsJSON, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, ErrInvalidToken
	}

	var claims JWTClaims
	if err := json.Unmarshal(claimsJSON, &claims); err != nil {
		return nil, ErrInvalidToken
	}

	if claims.Exp > 0 && time.Now().Unix() > claims.Exp {
		return nil, ErrExpiredToken
	}

	return &claims, nil
}

func signHS256(data, key []byte) string {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return base64URLEncode(mac.Sum(nil))
}

func base64URLEncode(data []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(data), "=")
}

func base64URLDecode(s string) ([]byte, error) {
	// Add padding
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}

// ---- Magic Code Auth ----

// SendMagicCode creates a magic code.
func (s *Service) SendMagicCode(appID, email string) (string, error) {
	code := generateCode()

	s.mu.Lock()
	defer s.mu.Unlock()

	key := appID + ":" + email
	s.magicCodes[key] = &MagicCode{
		Code:      code,
		AppID:     appID,
		Email:     email,
		ExpiresAt: time.Now().Add(15 * time.Minute),
	}

	return code, nil
}

// VerifyMagicCode verifies a magic code and returns user info.
func (s *Service) VerifyMagicCode(ctx context.Context, appID, email, code string) (*storage.AppUser, string, error) {
	s.mu.Lock()
	key := appID + ":" + email
	mc, ok := s.magicCodes[key]
	if !ok || mc.Code != code || time.Now().After(mc.ExpiresAt) {
		s.mu.Unlock()
		return nil, "", ErrInvalidCode
	}
	delete(s.magicCodes, key)
	s.mu.Unlock()

	user, err := s.db.GetAppUserByEmail(ctx, appID, email)
	if err != nil {
		return nil, "", err
	}

	if user == nil {
		userID := generateUUID()
		refreshToken := generateUUID()
		user = &storage.AppUser{
			ID:           userID,
			AppID:        appID,
			Email:        email,
			RefreshToken: refreshToken,
		}
		if err := s.db.CreateAppUser(ctx, user); err != nil {
			return nil, "", err
		}
	}

	token, err := s.CreateToken(appID, user.ID, user.Email)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ---- Guest Auth ----

// SignInAsGuest creates a guest user with no email.
func (s *Service) SignInAsGuest(ctx context.Context, appID string) (*storage.AppUser, string, error) {
	userID := generateUUID()
	refreshToken := generateUUID()
	user := &storage.AppUser{
		ID:           userID,
		AppID:        appID,
		Email:        "", // guest has no email
		RefreshToken: refreshToken,
	}
	if err := s.db.CreateAppUser(ctx, user); err != nil {
		return nil, "", err
	}

	token, err := s.CreateToken(appID, user.ID, "")
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ---- Custom Auth Token ----

// CreateCustomToken creates an auth token for a user identified by email or ID.
func (s *Service) CreateCustomToken(ctx context.Context, appID string, email string, userID string) (string, error) {
	if email != "" {
		user, err := s.db.GetAppUserByEmail(ctx, appID, email)
		if err != nil {
			return "", err
		}
		if user == nil {
			// Create the user
			uid := generateUUID()
			refreshToken := generateUUID()
			user = &storage.AppUser{
				ID: uid, AppID: appID, Email: email, RefreshToken: refreshToken,
			}
			if err := s.db.CreateAppUser(ctx, user); err != nil {
				return "", err
			}
		}
		return s.CreateToken(appID, user.ID, user.Email)
	}
	if userID != "" {
		user, err := s.db.GetAppUserByID(ctx, userID)
		if err != nil {
			return "", err
		}
		if user == nil {
			return "", ErrUserNotFound
		}
		return s.CreateToken(appID, user.ID, user.Email)
	}
	return "", fmt.Errorf("email or user ID required")
}

// ---- Admin Token Auth ----

// VerifyAdminToken checks if the token matches the app's admin token.
func (s *Service) VerifyAdminToken(ctx context.Context, appID, token string) (*storage.App, error) {
	app, err := s.db.GetApp(ctx, appID)
	if err != nil {
		return nil, err
	}
	if app == nil {
		return nil, fmt.Errorf("app not found: %s", appID)
	}
	if app.AdminToken != token {
		return nil, ErrInvalidToken
	}
	return app, nil
}

// ---- Refresh Token Auth ----

// VerifyRefreshToken looks up a user by their refresh token.
func (s *Service) VerifyRefreshToken(ctx context.Context, appID, token string) (*storage.AppUser, error) {
	user, err := s.db.GetAppUserByRefreshToken(ctx, appID, token)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, ErrUserNotFound
	}
	return user, nil
}

// ---- Middleware helpers ----

// ExtractBearerToken extracts a bearer token from the Authorization header.
func ExtractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}
	parts := strings.SplitN(auth, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return parts[1]
}

// ---- Helpers ----

func generateCode() string {
	b := make([]byte, 3)
	rand.Read(b)
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000)
}

func generateUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40 // v4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%s-%s-%s-%s-%s",
		hex.EncodeToString(b[0:4]),
		hex.EncodeToString(b[4:6]),
		hex.EncodeToString(b[6:8]),
		hex.EncodeToString(b[8:10]),
		hex.EncodeToString(b[10:16]))
}
