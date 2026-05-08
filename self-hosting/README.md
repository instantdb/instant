# Self Hosting InstantDB

An InstantDB self hosted deployment consists of 3 urls (subdomains)
1. Backend API
2. Dashboard URL
3. Files URL


## Localhost Setup
Use this setup if you want to self-host InstantDB while developing on your own machine. In most cases, it's more convenient to use our cloud service to spin up unlimited free apps.
```bash
git clone https://github.com/instantdb/instant.git
cd instant/self-hosting
docker compose --env-file .env.example up
```

The dashboard will be available on http://localhost:3000. 

The server will be available on http://localhost:8888.

If you are developing an app and would like to use port 3000 (for example: NextJS), you can modify the port assignment in the `docker-compose.yml` file like so:
```yaml
  www:
    ports:
      - "3001:3000"
```
Then you will need to change the value for `INSTANT_DASHBOARD_URL` in `.env.example`

Apply changes with:
```bash
docker compose --env-file .env.example up -d
```

## Full Hetzner Setup Guide
Create a new server on Hetzner. We tested on a server with 4vcpu, 8GB of RAM. For more memory constrained environments, the `JAVA_OPTIONS` env can be set to limit the memory the server container uses.

This setup guide assumes that you have a domain name and can set DNS A records. 
If you do not have a domain name, you can use [sslip.io](https://sslip.io/) to create a domain name on the fly that points to the IP address of your server.

### Install Docker (optional if docker is already installed)
The following Docker install instructions come from [docs.docker.com](https://docs.docker.com/engine/install/ubuntu/)
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

### Clone the Instant DB Repo
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

# Domains used by the Caddy file. For production, point DNS at this host
# and update the public URLs above to use these domains with https://.
DASHBOARD_DOMAIN=dash.myinstant.com
BACKEND_DOMAIN=api.myinstant.com
STORAGE_DOMAIN=files.myinstant.com
```

The _DOMAIN variables are only used by the Caddy reverse proxy so if you are bringing your own reverse proxy, you can ignore them.

The MinIO bucket is private by default. Files are accessed through Instant-generated signed URLs.

### DNS 
Before running Instant, make sure that you have pointed the subdomain DNS records to the IP address of the server so that when the Caddy reverse proxy starts, it is able to setup TLS certificates automatically.

### Start!
```sh
docker compose -f docker-compose.with-caddy.yml --env-file .env up --build
```

After everything starts up, the dashboard will be available at wherever you set INSTANT_DASHBOARD_URL to.

## Using Self-Hosted InstantDB

Without a POSTMARK_TOKEN environment variable set, OTP codes will not be emailed. 
You must read the console output of the server container, which will print the body of any emails that would get sent. 

You can use this command to print out recent logs from the server (last 50 lines):
```bash
docker compose logs server -n 50
```

### Using the self-hosted instance with instant-cli

To use the Instant CLI with your local backend, you can set the `INSTANT_CLI_API_URI` environment variable to `http://localhost:8888`. For example:
```bash
# Local Machine Deployment
INSTANT_CLI_API_URI=http://localhost:8888 npx instant-cli@latest init 

# Server Deployment
INSTANT_CLI_API_URI=https://api.myinstant.com npx instant-cli@latest init 
```
