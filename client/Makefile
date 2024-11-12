MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)

dev:
	@echo "Booting up frontend..."
	pnpm run dev

index-docs:
	@echo "Indexing docs..."
	node ./www/scripts/index-docs.mjs

publish:
	@echo "Building + Publishing Packages..."
	./scripts/publish_packages.clj

publish-experimental:
	@echo "(Experimental Build) Building + Publishing Packages..."
	./scripts/publish_packages.clj experimental

build-email:
	$(MAKE) text-email
	$(MAKE) html-email

text-email:
	echo "Generating text verison of email..."
	sed -e 's/!\[[^]]*\]([^)]*)//g' www/_emails/markdown/$(slug).md | sed '/^$$/N;/^\n$$/D' > www/_emails/txt/$(slug).txt

html-email:
	echo "Generating HTML version email..."
	pandoc -f markdown -t html www/_emails/markdown/$(slug).md -o www/_emails/html/$(slug).html
