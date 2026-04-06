# Self Hosting InstantDB

An InstantDB self hosted deployment consists of 3 urls (subdomains)
1. Backend API
2. Dashboard URL
3. Files URL

## Hetzner Setup
Create a new server on Hetzner. We tested used 4vcpu, 8GB of RAM, for more memory constrained environments, the `JAVA_OPTIONS` env can be set to limit the memory the server container uses.

### Install Docker (optional if docker is already installed)
```sh
apt update
sudo apt install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```sh
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
```

```sh
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Clone the instant DB repo.
```sh
git clone https://github.com/instantdb/instant.git
```

### Edit Environment Variables
```sh
cd instant/self-hosting
cp .env.example .env
nano .env
```

Example:
```bash
# Public URLs. Change these when deploying behind a domain or proxy.
INSTANT_BACKEND_URL=https://api.myinstant.com
INSTANT_DASHBOARD_URL=https://dash.myinstant.com
S3_PUBLIC_ENDPOINT=https://files.myinstant.com

# Domains used by the Caddy compose file. For production, point DNS at this host
# and update the public URLs above to use these domins with https://.
DASHBOARD_DOMAIN=dash.myinstant.com
BACKEND_DOMAIN=api.myinstant.com
STORAGE_DOMAIN=files.myinstant.com
```

The _DOMAIN variables are only used by the Caddy reverse proxy so if you are bringing your own reverse proxy, you can ignore them.

### DNS 
Before running Instant, make sure that you have pointed the subdomain DNS records to the IP address of the server so that when the Caddy reverse proxy starts, it is able to setup TLS certificates automatically.

### Start!
```sh
docker compose -f docker-compose.with-caddy.yml --env-file .env up --build
```

After everything starts up, the dashboard should be available at wherever you set INSTANT_DASHBOARD_URL to.
