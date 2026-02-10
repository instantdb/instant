MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)

# Set DEV_SLOT=1, DEV_SLOT=2, etc. to run multiple instances on different ports
DEV_SLOT ?= 0

dev:
	@echo "Booting up frontend...$(if $(filter-out 0,$(DEV_SLOT)), (slot $(DEV_SLOT)),)"
	PORT=$$((3000 + $(DEV_SLOT) * 100)) \
	SB_PORT=$$((4000 + $(DEV_SLOT) * 100)) \
	SB_EXPRESS_PORT=$$((3005 + $(DEV_SLOT) * 100)) \
	NEXT_PUBLIC_LOCAL_SERVER_PORT=$$((8888 + $(DEV_SLOT) * 1000)) \
	NEXT_PUBLIC_FEEDBACK_API_URI=http://localhost:$$((8888 + $(DEV_SLOT) * 1000)) \
	pnpm run dev --ui tui $(filter-out $@,$(MAKECMDGOALS))

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
	@echo "There is a new way to publish packages!"
	@echo "1. Create a new branch and update client/packages/version/src/version.ts with your new version."
	@echo "2. Open a PR with that branch."
	@echo "3. Merge change to main and GitHub actions will publish your package."
	@echo "If you absolutely need to publish manually, run make publish-ci"

publish-ci:
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
