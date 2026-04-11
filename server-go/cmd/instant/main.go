// Command instant is the single-binary Instant server with SQLite backend.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/necrodome/instant/server-go/pkg/admin"
	"github.com/necrodome/instant/server-go/pkg/auth"
	"github.com/necrodome/instant/server-go/pkg/config"
	"github.com/necrodome/instant/server-go/pkg/engine"
	"github.com/necrodome/instant/server-go/pkg/reactive"
	"github.com/necrodome/instant/server-go/pkg/storage"
	"github.com/necrodome/instant/server-go/pkg/transport"
)

func main() {
	cfg := config.Load()

	log.Printf("Starting Instant server (SQLite) on port %d", cfg.Port)
	log.Printf("Database: %s", cfg.DBPath)

	// Open SQLite database
	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Initialize components
	qe := engine.NewQueryEngine(db)
	txp := engine.NewTxProcessor(db)

	perms, err := engine.NewPermissionEngine(db, qe)
	if err != nil {
		log.Fatalf("Failed to create permission engine: %v", err)
	}

	sessions := reactive.NewSessionStore()
	eph := reactive.NewEphemeralStore()

	inv := reactive.NewInvalidator(db)
	inv.Start()
	defer inv.Stop()

	authSvc := auth.NewService(db, cfg.JWTSecret)

	// Transport handler
	th := transport.NewHandler(db, sessions, eph, inv, qe, txp, perms, authSvc)

	// Admin handler
	ah := admin.NewHandler(db, qe, txp, authSvc)

	// Set up HTTP routes
	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("GET /runtime/session", th.ServeWS)

	// SSE endpoints
	mux.HandleFunc("GET /runtime/sse", th.ServeSSE)
	mux.HandleFunc("POST /runtime/sse", th.ServeSSEMessage)

	// Admin API
	ah.RegisterRoutes(mux)

	// CORS middleware
	handler := corsMiddleware(mux)

	// Start server
	addr := fmt.Sprintf(":%d", cfg.Port)
	server := &http.Server{
		Addr:    addr,
		Handler: handler,
	}

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down...")
		server.Close()
	}()

	log.Printf("Listening on %s", addr)
	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, app-id, as-token, as-email, as-guest")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
