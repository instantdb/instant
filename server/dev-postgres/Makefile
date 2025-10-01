MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)

github-login:
	echo "Follow instructions at https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry"

build-and-push-image:
	docker buildx build --platform linux/amd64,linux/arm64 --push \
		-t ghcr.io/instantdb/postgresql:postgresql-16-pg-hint-plan .
