MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)
DC = $(shell command -v docker-compose >/dev/null 2>&1 && echo "docker-compose" || echo "docker compose")

dev:
	@echo "Booting up backend w/ local db..."
	clojure -M:dev:run

bootstrap-oss:
	clojure -X:dev:oss-bootstrap

dev-oss:
	@echo "Booting up backend w/ local db..."
	clojure -X:dev:oss-bootstrap
	@echo "Starting server..."
	clojure -M:dev:run

docker-compose:
	$(DC) -f ./docker-compose-dev.yml build && $(DC) -f ./docker-compose-dev.yml up

dev-up:
	@echo "Migrating dev db up to latest"
	migrate -database "postgresql://localhost:5432/instant?sslmode=disable" -path resources/migrations up

dev-down:
	@echo "Migrating dev db up down by 1"
	migrate -database "postgresql://localhost:5432/instant?sslmode=disable" -path resources/migrations down 1

dev-storm:
	@echo "Booting up dev with storm debugger..."
	@echo "Usage:"
	@echo " user> (require '[flow-storm.api :as fs-api])"
	@echo " user> (fs-api/local-connect)"
	clojure -M:dev:storm:run

test:
	TEST=true clojure -M:test

retest:
	TEST=true clojure -M:retest

deploy:
	./scripts/eb_deploy.clj

manual-deploy:
	./scripts/manual_deploy.sh

restart:
	@echo "Restarting beanstalk..."
	aws elasticbeanstalk restart-app-server --environment-name Instant-prod-env

dev-with-prod-db:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "[IMPORTANT] Booting up backend w/ prod db..." && \
	DATABASE_URL="$${DATABASE_URL}" clj -M:dev:run

prod-tunnel:
	./scripts/prod_tunnel.sh

prod-connect:
	clj -M:repl-connect

prod-version:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "Checking prod db version... [y/N]" && \
		read ans && [ $$ans = y ] && \
	migrate -database "$${DATABASE_URL}" -path resources/migrations version

prod-up:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "[IMPORTANT] Migrating prod up to latest -- are you sure you want to do this? [y/N]" && \
		read ans && [ $$ans = y ] && \
		migrate -database "$${DATABASE_URL}" -path resources/migrations up

prod-down:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "[IMPORTANT] Migrating prod db down by 1 -- are you sure you want to do this? [y/N]" && \
		read ans && [ $$ans = y ] && \
		migrate -database "$${DATABASE_URL}" -path resources/migrations down 1

psql:
	@echo "Connecting to local db..."
	psql -h localhost -d instant

prod-psql:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "[IMPORTANT] Connecting to prod db -- are you sure you want to do this? [y/N]" && \
		read ans && [ $$ans = y ] && \
		psql $${DATABASE_URL}

psql-dump:
	@DATABASE_URL=$$(./scripts/prod_connection_string.sh); \
	echo "Exporting prod db..." && \
	pg_dump $${DATABASE_URL} -f dump.sql

tail-web:
	aws logs tail /aws/elasticbeanstalk/Instant-docker-prod-env/var/log/eb-docker/containers/eb-current-app/stdouterr.log --follow

MINS?=30
errors:
	aws logs filter-log-events \
		--log-group-name "/aws/elasticbeanstalk/Instant-docker-prod-env/var/log/eb-docker/containers/eb-current-app/stdouterr.log" \
		--start-time $$(expr `date -v-$(MINS)M +%s` \* 1000) \
		--filter-pattern "ERROR" \
	    --output text

tail-pg:
	aws logs tail /aws/rds/cluster/instant-aurora-1/postgresql  --follow

encrypt-secret-dev:
	clj -X:encrypt-secret :env :dev

encrypt-secret-prod:
	clj -X:encrypt-secret :env :prod

lint:
	clojure -M:lint
