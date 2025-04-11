<p align="center">
  <a href="#">
    <img alt="Shows the Instant logo" src="https://instantdb.com/img/icon/android-chrome-512x512.png" width="10%">
  </a>
  <h1 align="center">instant-server</h1>
</p>

This houses Instant's backend. Let’s get you started!

# Development

## Docker Compose

The easiest way to get started is to run `make docker-compose`. That command will use docker compose to set up a new postgres database and start the server. The instant server will be available at http://localhost:8888 and you can connect to nrepl on port `6005`.

## Without Docker Compose

If you want to run Instant locally, first install dependencies:

1. Install Java 22 for [mac](https://docs.aws.amazon.com/corretto/latest/corretto-22-ug/macos-install.html), [linux](https://docs.aws.amazon.com/corretto/latest/corretto-22-ug/generic-linux-install.html), or [windows](https://docs.aws.amazon.com/corretto/latest/corretto-22-ug/windows-install.html).

2. Install Clojure [https://clojure.org/guides/install_clojure](https://clojure.org/guides/install_clojure).

3. Install golang-migrate [https://github.com/golang-migrate/migrate/tree/master/cmd/migrate#installation](https://github.com/golang-migrate/migrate/tree/master/cmd/migrate#installation).

Create a new postgres database called `instant`:

```sh
createdb instant
```

Ensure your `postgresql.conf` has logical replication enabled:

```conf
wal_level = logical
```

Run the migrations to initialize the database:

```sh
make dev-up
```

Bootstrap a config file (this creates a few dummy secrets for working locally):

```sh
make bootstrap-oss
```

And start the server:
```sh
make dev
```

The instant server will run at [localhost:8888](http://localhost:8888) and you can connect to nrepl on port 6005.

To run tests:

```sh
make compile-java
make test
```

# Config

If you want to make any changes to your configuration, update the `resources/config/override.edn` file that was created when you ran `make docker-compose` or `make bootstrap-oss`. `src/instant/config_edn.clj` has a spec that describes the data for the file, or you can look at `resources/config/dev.edn` for an example.

# Questions?

If you have any questions, feel free to drop us a line on our [Discord](https://discord.com/invite/VU53p7uQcE).
