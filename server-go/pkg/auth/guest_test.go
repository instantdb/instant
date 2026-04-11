package auth

import (
	"context"
	"testing"
	"time"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

func TestSignInAsGuest(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	svc := NewService(db, "test-secret")

	user, token, err := svc.SignInAsGuest(ctx, "app-1")
	if err != nil {
		t.Fatal(err)
	}
	if user == nil {
		t.Fatal("expected user")
	}
	if user.Email != "" {
		t.Errorf("guest should have empty email, got %q", user.Email)
	}
	if user.ID == "" {
		t.Error("expected non-empty user ID")
	}
	if token == "" {
		t.Error("expected non-empty token")
	}

	// Should be able to look up by refresh token
	found, err := svc.VerifyRefreshToken(ctx, "app-1", user.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != user.ID {
		t.Errorf("got user %q, want %q", found.ID, user.ID)
	}
}

func TestCreateCustomTokenByEmail(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	svc := NewService(db, "test-secret")

	// Create token for new user
	token, err := svc.CreateCustomToken(ctx, "app-1", "new@example.com", "")
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Verify token
	claims, err := svc.VerifyToken(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Email != "new@example.com" {
		t.Errorf("got email %q, want %q", claims.Email, "new@example.com")
	}

	// User should have been created
	user, _ := db.GetAppUserByEmail(ctx, "app-1", "new@example.com")
	if user == nil {
		t.Fatal("expected user to be created")
	}
}

func TestCreateCustomTokenByID(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	app := &storage.App{ID: "app-1", Title: "Test", AdminToken: "admin", CreatedAt: time.Now()}
	db.CreateApp(ctx, app)

	user := &storage.AppUser{ID: "user-1", AppID: "app-1", Email: "alice@example.com", RefreshToken: "rt"}
	db.CreateAppUser(ctx, user)

	svc := NewService(db, "test-secret")

	token, err := svc.CreateCustomToken(ctx, "app-1", "", "user-1")
	if err != nil {
		t.Fatal(err)
	}

	claims, _ := svc.VerifyToken(token)
	if claims.UserID != "user-1" {
		t.Errorf("got user ID %q, want %q", claims.UserID, "user-1")
	}
}

func TestCreateCustomTokenUserNotFound(t *testing.T) {
	db := tempDB(t)
	ctx := context.Background()

	svc := NewService(db, "test-secret")

	_, err := svc.CreateCustomToken(ctx, "app-1", "", "nonexistent")
	if err != ErrUserNotFound {
		t.Errorf("expected ErrUserNotFound, got %v", err)
	}
}
