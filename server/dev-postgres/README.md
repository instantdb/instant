Builds the image for postgres that is used in the local docker compose setup.

Log in to the instant public ecr registry:

```sh
make ecr-login
```

Build and push the image:

```sh
make build-and-push-image
```
