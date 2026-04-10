package auth

import (
	"context"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

func tempDB(t *testing.T) *storage.DB {
	t.Helper()
	f, err := os.CreateTemp("", "instant-auth-test-*.db")
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
	return db
}

func TestCreateAndVerifyToken(t *testing.T) {
	svc := NewService(nil, "test-secret")

	token, err := svc.CreateToken("app-1", "user-1", "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := svc.VerifyToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.AppID != "app-1" {
		t.Errorf("got app_id %q, want %q", claims.AppID, "app-1")
	}
	if claims.UserID != "user-1" {
		t.Errorf("got user_id %q, want %q", claims.UserID, "user-1")
	}
	if claims.Email != "alice@example.com" {
		t.Errorf("got email %q, want %q", claims.Email, "alice@example.com")
	}
}

func TestVerifyInvalidToken(t *testing.T) {
	svc := NewService(nil, "test-secret")

	_, err := svc.VerifyToken("invalid.token.here")
	if err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken, got %v", err)
	}
}

func TestVerifyTokenWrongSecret(t *testing.T) {
	svc1 := NewService(nil, "secret-1")
	svc2 := NewService(nil, "secret-2")

	token, _ := svc1.CreateToken("app-1", "user-1", "alice@example.com")
	_, err := svc2.VerifyToken(token)
	if err != ErrInvalidToken {
		t.Errorf("expected ErrInvalidToken for wrong secret, got %v", err)
	}
}

func TestMagicCodeFlow(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	svc := NewService(db, "test-secret")

	// Send magic code
	code, err := svc.SendMagicCode("app-1", "alice@example.com")
	if err != nil {
		t.Fatal(err)
	}
	if code == "" {
		t.Fatal("expected non-empty code")
	}

	// Verify magic code
	user, token, err := svc.VerifyMagicCode(ctx, "app-1", "alice@example.com", code)
	if err != nil {
		t.Fatal(err)
	}
	if user == nil {
		t.Fatal("expected user")
	}
	if user.Email != "alice@example.com" {
		t.Errorf("got email %q, want %q", user.Email, "alice@example.com")
	}
	if token == "" {
		t.Fatal("expected non-empty JWT token")
	}

	// Verify the user was created in the database
	dbUser, _ := db.GetAppUserByEmail(ctx, "app-1", "alice@example.com")
	if dbUser == nil {
		t.Fatal("expected user to be created in DB")
	}
}

func TestMagicCodeInvalid(t *testing.T) {
	db := tempDB(t)
	svc := NewService(db, "test-secret")

	svc.SendMagicCode("app-1", "alice@example.com")

	_, _, err := svc.VerifyMagicCode(context.Background(), "app-1", "alice@example.com", "wrong-code")
	if err != ErrInvalidCode {
		t.Errorf("expected ErrInvalidCode, got %v", err)
	}
}

func TestMagicCodeExpired(t *testing.T) {
	db := tempDB(t)
	svc := NewService(db, "test-secret")

	code, _ := svc.SendMagicCode("app-1", "alice@example.com")

	// Manually expire the code
	svc.mu.Lock()
	svc.magicCodes["app-1:alice@example.com"].ExpiresAt = time.Now().Add(-1 * time.Minute)
	svc.mu.Unlock()

	_, _, err := svc.VerifyMagicCode(context.Background(), "app-1", "alice@example.com", code)
	if err != ErrInvalidCode {
		t.Errorf("expected ErrInvalidCode for expired code, got %v", err)
	}
}

func TestMagicCodeReuse(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	svc := NewService(db, "test-secret")

	code, _ := svc.SendMagicCode("app-1", "alice@example.com")
	_, _, _ = svc.VerifyMagicCode(ctx, "app-1", "alice@example.com", code)

	// Second use should fail
	_, _, err := svc.VerifyMagicCode(ctx, "app-1", "alice@example.com", code)
	if err != ErrInvalidCode {
		t.Error("expected code reuse to fail")
	}
}

func TestVerifyAdminToken(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "secret-admin-token", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	svc := NewService(db, "test-secret")

	got, err := svc.VerifyAdminToken(ctx, "app-1", "secret-admin-token")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "app-1" {
		t.Errorf("got %q, want %q", got.ID, "app-1")
	}

	_, err = svc.VerifyAdminToken(ctx, "app-1", "wrong-token")
	if err == nil {
		t.Error("expected error for wrong token")
	}
}

func TestVerifyRefreshToken(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	user := &storage.AppUser{ID: "user-1", AppID: "app-1", Email: "alice@example.com", RefreshToken: "refresh-tok"}
	db.CreateAppUser(ctx, user)

	svc := NewService(db, "test-secret")

	got, err := svc.VerifyRefreshToken(ctx, "app-1", "refresh-tok")
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != "user-1" {
		t.Errorf("got %q, want %q", got.ID, "user-1")
	}

	_, err = svc.VerifyRefreshToken(ctx, "app-1", "wrong-token")
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}

func TestExtractBearerToken(t *testing.T) {
	tests := []struct {
		header string
		want   string
	}{
		{"Bearer my-token", "my-token"},
		{"bearer my-token", "my-token"},
		{"BEARER my-token", "my-token"},
		{"", ""},
		{"Basic abc", ""},
		{"Bearer", ""},
	}

	for _, tt := range tests {
		req, _ := http.NewRequest("GET", "/", nil)
		if tt.header != "" {
			req.Header.Set("Authorization", tt.header)
		}
		got := ExtractBearerToken(req)
		if got != tt.want {
			t.Errorf("header %q: got %q, want %q", tt.header, got, tt.want)
		}
	}
}

func TestDefaultJWTSecret(t *testing.T) {
	svc := NewService(nil, "")
	if string(svc.jwtSecret) != "instant-dev-secret" {
		t.Errorf("expected default secret, got %q", string(svc.jwtSecret))
	}
}
