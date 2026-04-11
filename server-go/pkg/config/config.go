// Package config manages configuration for the Instant server.
package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port       int
	DBPath     string
	JWTSecret  string
	AdminToken string
	Dev        bool
}

func Load() *Config {
	port := 8888
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			port = v
		}
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "instant.db"
	}

	return &Config{
		Port:       port,
		DBPath:     dbPath,
		JWTSecret:  os.Getenv("JWT_SECRET"),
		AdminToken: os.Getenv("ADMIN_TOKEN"),
		Dev:        os.Getenv("ENV") != "production",
	}
}
