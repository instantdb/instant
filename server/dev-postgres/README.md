Builds the image for postgres that is used in the local docker compose setup.

Log in to GitHub's container registry:

[Check the docs to see if GitHub has improved the signin process](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

1. Create a new personal access token (classic) with the write:packages scope
2. Save your personal access token (classic). We recommend saving your token as an environment variable.
```bash
export CR_PAT=YOUR_TOKEN
```
3. Sign in to the Container registry service at ghcr.io.
```bash
echo $CR_PAT | docker login ghcr.io -u USERNAME --password-stdin
```
Build and push the image:

```sh
make build-and-push-image
```
