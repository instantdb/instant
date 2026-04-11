package engine

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
)

// OAuthStateInfo holds the data associated with an OAuth state token.
type OAuthStateInfo struct {
	AppID       string
	Provider    string
	RedirectURL string
	CreatedAt   time.Time
}

// OAuthService manages OAuth state tokens and provider configuration.
type OAuthService struct {
	mu     sync.Mutex
	states map[string]*OAuthStateInfo
}

// NewOAuthService creates a new OAuth service.
func NewOAuthService() *OAuthService {
	return &OAuthService{
		states: make(map[string]*OAuthStateInfo),
	}
}

// GenerateState creates a state token for an OAuth flow.
func (s *OAuthService) GenerateState(appID, redirectURL, provider string) string {
	b := make([]byte, 32)
	rand.Read(b)
	state := hex.EncodeToString(b)

	s.mu.Lock()
	defer s.mu.Unlock()
	s.states[state] = &OAuthStateInfo{
		AppID:       appID,
		Provider:    provider,
		RedirectURL: redirectURL,
		CreatedAt:   time.Now(),
	}
	return state
}

// ValidateState validates and consumes an OAuth state token (single-use).
func (s *OAuthService) ValidateState(state string) (*OAuthStateInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	info, ok := s.states[state]
	if !ok {
		return nil, errors.New("invalid or expired OAuth state")
	}

	// Check expiration (10 min)
	if time.Since(info.CreatedAt) > 10*time.Minute {
		delete(s.states, state)
		return nil, errors.New("OAuth state expired")
	}

	delete(s.states, state)
	return info, nil
}

// GetAuthorizationURL builds the OAuth authorization URL for a provider.
func (s *OAuthService) GetAuthorizationURL(provider, clientID, redirectURI, state string) (string, error) {
	switch provider {
	case "google":
		return fmt.Sprintf("https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=email+profile&state=%s",
			clientID, redirectURI, state), nil
	case "github":
		return fmt.Sprintf("https://github.com/login/oauth/authorize?client_id=%s&redirect_uri=%s&scope=user:email&state=%s",
			clientID, redirectURI, state), nil
	case "apple":
		return fmt.Sprintf("https://appleid.apple.com/auth/authorize?client_id=%s&redirect_uri=%s&response_type=code&scope=email+name&state=%s&response_mode=form_post",
			clientID, redirectURI, state), nil
	default:
		return "", fmt.Errorf("unsupported OAuth provider: %s", provider)
	}
}

// OAuthProviderConfig holds configuration for an OAuth provider.
type OAuthProviderConfig struct {
	ClientID     string `json:"client-id"`
	ClientSecret string `json:"client-secret"`
	RedirectURI  string `json:"redirect-uri"`
}

// CleanupExpiredStates removes expired OAuth states (call periodically).
func (s *OAuthService) CleanupExpiredStates() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for state, info := range s.states {
		if time.Since(info.CreatedAt) > 10*time.Minute {
			delete(s.states, state)
		}
	}
}
