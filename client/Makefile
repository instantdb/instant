MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)

dev:
	@echo "Booting up frontend..."
	pnpm run dev

lint:
	pnpm run check-format

lint-fix:
	pnpm run check-format --write

index-docs-dry-run:
	@echo "Dry run..."
	pnpm exec tsx ./www/scripts/index-docs.ts --dry-run

index-docs-manual:
	@echo "Manual indexing..."
	pnpm exec tsx ./www/scripts/index-docs.ts

publish:
	@echo "Building + Publishing Packages..."
	./scripts/publish_packages.clj

publish-experimental:
	@echo "(Experimental Build) Building + Publishing Packages..."
	./scripts/publish_packages.clj experimental

build-email:
	$(MAKE) replace-email-images
	$(MAKE) text-email
	$(MAKE) html-email

replace-email-images:
	echo "Replacing images..."
	node www/_emails/replace-images/index.mjs $(slug)

text-email:
	echo "Generating text verison of email..."
	sed -e 's/!\[[^]]*\]([^)]*)//g' www/_emails/markdown/$(slug).md | sed '/^$$/N;/^\n$$/D' > www/_emails/txt/$(slug).txt

html-email:
	echo "Generating HTML version email..."
	pandoc -f markdown -t html www/_emails/markdown/$(slug).md -o www/_emails/html/$(slug).html

feedback-app-push:
	cd www && \
		FEEDBACK_APP_ID=$$(grep NEXT_PUBLIC_FEEDBACK_APP_ID .env | cut -d '=' -f2) \
		INSTANT_SCHEMA_FILE_PATH=./lib/intern/docs-feedback/instant.schema.ts \
		INSTANT_PERMS_FILE_PATH=./lib/intern/docs-feedback/instant.perms.ts \
		pnpm exec instant-cli push --app=$$FEEDBACK_APP_ID

feedback-app-pull:
	cd www && \
	FEEDBACK_APP_ID=$$(grep NEXT_PUBLIC_FEEDBACK_APP_ID .env | cut -d '=' -f2) \
	INSTANT_SCHEMA_FILE_PATH=./lib/intern/docs-feedback/instant.schema.ts \
	INSTANT_PERMS_FILE_PATH=./lib/intern/docs-feedback/instant.perms.ts \
	pnpm exec instant-cli pull --app=$$FEEDBACK_APP_ID
