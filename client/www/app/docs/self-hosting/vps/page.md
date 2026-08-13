---
nextjs:
  metadata:
    title: 'Self hosting on VPS'
    description: 'Run Instant on a VPS.'
---

You can run the Instant backend, dashboard, PostgreSQL, MinIO, and Caddy on a
single VPS. A server with 2 vCPUs and 4 GB of RAM is enough to get started and
usually costs around $30 per month.

Already have a VPS and domain? Continue with the server's SSH address and the
hostnames you want to use.

Starting from scratch? Ask your agent for guided help creating the VPS and
setting up DNS.

Any provider that offers a recent Ubuntu image will work. We've tested this
setup with [DigitalOcean](https://www.digitalocean.com/pricing/droplets/) and
[Hetzner](https://www.hetzner.com/cloud/).

## Create the server

Start with:

- Ubuntu 24.04 LTS
- 2 vCPUs
- 4 GB of RAM

You will also need a domain where you can create DNS records. This guide uses:

```text
dash.myinstant.com
api.myinstant.com
files.myinstant.com
```

Point each hostname to the server.

Allow inbound HTTP, HTTPS, and administrator access to the server. PostgreSQL
and MinIO only need to be reachable by the other containers on the host.

## Install Docker

Skip this section if Docker and the Compose plugin are already installed. These
commands come from Docker's [Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/):

```sh {% showCopy=true %}
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```sh {% showCopy=true %}
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## Configure Instant

Clone Instant and copy the example environment file:

```sh {% showCopy=true %}
git clone https://github.com/instantdb/instant.git
cd instant/self-hosting
cp .env.example .env
nano .env
```

Set the public URLs and the domains Caddy should use:

```shell {% showCopy=true %}
INSTANT_BACKEND_URL=https://api.myinstant.com
INSTANT_DASHBOARD_URL=https://dash.myinstant.com
S3_PUBLIC_ENDPOINT=https://files.myinstant.com

DASHBOARD_DOMAIN=dash.myinstant.com
BACKEND_DOMAIN=api.myinstant.com
STORAGE_DOMAIN=files.myinstant.com
```

The `_DOMAIN` variables are only used by Caddy. You can ignore them if you use a
different reverse proxy.

`S3_PUBLIC_ENDPOINT` must be an origin without a path, such as
`https://files.myinstant.com`. MinIO cannot serve its S3 API from a path such as
`/storage`.

Review the rest of `.env` and replace the default PostgreSQL and MinIO
credentials. The MinIO bucket is private and Instant serves files with signed
URLs.

## Start Instant

Once the DNS records resolve to the server, run:

```sh {% showCopy=true %}
sudo docker compose -f docker-compose.with-caddy.yml --env-file .env up -d
```

Caddy will request TLS certificates for the three domains. Check the containers
and backend health:

```sh {% showCopy=true %}
sudo docker compose -f docker-compose.with-caddy.yml --env-file .env ps
curl -fsS https://api.myinstant.com/health/system
```

A healthy backend returns `{"wal":"ok"}`. Open the dashboard and create an app
to check queries, writes, and file uploads.

Until an email provider is configured, login codes are written to the backend
logs. Tail them with:

```sh {% showCopy=true %}
sudo docker compose -f docker-compose.with-caddy.yml --env-file .env logs --follow server
```

## Scale the server

As your apps grow, watch CPU, memory, disk usage, and query latency. Moving to a
larger VPS is usually the simplest way to add capacity. A common next step is 4
vCPUs and 8 GB of RAM, but you can size the server to match your workload.

If you want to scale application servers and PostgreSQL independently, use the
[AWS guide](/docs/self-hosting/aws).

Once Instant is running, see [Operating Instant](/docs/self-hosting#operating)
to configure email, dashboard access, the CLI, and health checks.
