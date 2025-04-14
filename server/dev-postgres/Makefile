MAKEFLAGS = --no-print-directory --always-make --silent
MAKE = make $(MAKEFLAGS)

ecr-login:
	aws ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws

build-and-push-image:
	docker buildx build --platform linux/amd64,linux/arm64 --push \
		-t public.ecr.aws/z9j8u5b3/instant-public:postgresql-16-pg-hint-plan .
