# Admin / observability stack (EC2 debugging platform)

Opt-in add-on to the production-shaped stack (`compose.prod.yaml`, see `deploy/RUNBOOK.md`). It
gives you a browser UI on the EC2 host for the four things asked for: **Docker container
management, log tracing, database access, and network/system metrics.** It changes nothing about
the app itself — it's a second compose file layered on top.

| Need                     | Tool                           | URL (default ports) |
| ------------------------ | ------------------------------ | ------------------- |
| Manage containers        | Portainer                      | `:8091`             |
| Logs + metrics + network | Grafana (Explore + dashboards) | `:8092`             |
| Database                 | Adminer                        | `:8093`             |
| Raw PromQL               | Prometheus                     | `:8094`             |

Grafana is the one pane for both logs (via Loki, fed by Promtail from every container's stdout)
and metrics (via Prometheus, scraping the API's own `/metrics`, cAdvisor's per-container stats,
and node-exporter's host CPU/memory/disk/**network** counters). That combination — logs and
metrics next to each other, filterable by container and time range — is what "full trace" means
here in practice; see "Using it" below for how that maps onto an actual incident.

## 1. Before you start: EC2 sizing and swap

This adds real memory pressure on top of the app stack. Every admin-stack service has a
`mem_limit` in `compose.admin.yaml` (soft caps, ~1.1 GB combined at the ceiling), but on a small
instance (`t3.micro`/`t3.small`) that ceiling plus the app stack can still exceed physical RAM.
The fix is swap, not raising the caps — a debugging tool that swaps a little is fine; an
OOM-killed app container is not.

```bash
# Size: at least 2x RAM, and at least 4G if RAM <= 2G. Adjust count= for the size you pick.
sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
# Prefer RAM, only swap under real pressure (default 60 swaps too eagerly for a server).
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.d/99-swappiness.conf
free -h   # confirm the new Swap: line
```

## 2. Generate secrets (never commit these — .gitignore already excludes them)

```bash
cd /path/to/car-rental-system

# Grafana admin password: put a real value in your server-side .env
#   GRAFANA_ADMIN_PASSWORD=<openssl rand -base64 24>

# Portainer: --admin-password-file wants the PLAINTEXT password in the file (verified against
# 2.21.4 — --admin-password, not this flag, is the one that takes a hash; the flag names invite
# the opposite assumption). Writing it here also sidesteps Portainer's "set your password within
# 5 minutes of first boot or start over" window entirely, since the password is already set the
# moment the container starts.
mkdir -p deploy/secrets
openssl rand -base64 24 | tr -d '\n' > deploy/secrets/portainer_admin_password
cat deploy/secrets/portainer_admin_password
# ^ note that value down (a password manager, not a scrollback you'll lose) — it's your Portainer
# login and the file is gitignored, so this is the only place it exists in plaintext.

# admin-edge Basic Auth (shared by all four tools, on top of Portainer/Grafana's own logins):
docker run --rm httpd:2.4-alpine htpasswd -nbB admin '<choose-a-password>' > deploy/admin.htpasswd
```

## 3. Bring it up

```bash
cp .env.example .env   # if you haven't already (deploy/RUNBOOK.md) — then set GRAFANA_ADMIN_PASSWORD
docker compose -f compose.prod.yaml -f compose.admin.yaml up -d
docker compose -f compose.prod.yaml -f compose.admin.yaml ps   # everything healthy?
```

It joins the same compose project as `compose.prod.yaml`, so Prometheus/Adminer reach `api` /
`postgres` by their existing service names — no network wiring needed.

## 4. Access options — pick one

**A. Open the ports (what "from the web" implies).** The ports are already gated by HTTP Basic
Auth at the nginx layer, but that's a second line of defense, not the first — the first is your
EC2 **security group**: restrict 8091–8094 to your own IP (or a short allow-list), never
`0.0.0.0/0`. This is a Docker-management and database-browser UI; it is a much higher-value
target than the app itself.

**B. SSH tunnel instead (no inbound ports at all).** Leave the security group closed on
8091–8094 and tunnel per session:

```bash
ssh -N -L 8091:localhost:8091 -L 8092:localhost:8092 -L 8093:localhost:8093 -L 8094:localhost:8094 ec2-user@<host>
```

then browse `http://localhost:809x/` from your machine. Safer default; costs you the tunnel step
each time. If you pick this, also bind the ports to the loopback interface in
`compose.admin.yaml` (`'127.0.0.1:${ADMIN_PORTAINER_PORT:-8091}:8091'`, etc.) so they're not
reachable even if the security group is ever loosened by mistake.

**Either way, put TLS in front eventually** (same caveat `compose.prod.yaml` already states for
the main edge) — Basic Auth over plain HTTP sends the password unencrypted. A self-signed cert or
a second Caddy/nginx+certbot in front is enough for an internal admin tool; it doesn't need a
real CA cert the way the customer-facing site does.

## 5. Deploying the app itself as a Portainer stack

Portainer can deploy `compose.prod.yaml` directly from this repo (Stacks → Add stack → build
method "Repository" → this repo's URL + branch + `compose.prod.yaml` as the compose path, secrets
pasted into its own "Environment variables" box). This works, but one thing about it is not
obvious and will silently break the deploy if missed:

**Portainer's own `/data` must be a host bind-mount at the identical path on both sides —
`/data:/data`, not a named volume, not `/opt/something:/data`** (verified the hard way; see the
comment on the `portainer` service in `compose.admin.yaml` for the mechanism). Get this wrong and
the symptom is silent and confusing: the deployed stack reports success, every container is
healthy, but any service that bind-mounts a file _from the git checkout_ (this repo's own `edge`
service mounts `deploy/nginx.edge.conf`) gets an **empty directory instead of that file** — no
error anywhere, nginx just falls back to its stock default config and the app is unreachable on
its actual port. If you ever see `edge` (or any bind-mount-from-repo service) come up "healthy"
but not actually serve anything, this is almost certainly why —
`docker exec <container> cat <mounted-path>` will show it's a directory, not the expected file.

Also: don't run manual `docker compose -p carrental-app ...` commands from a different checkout
of this repo against a Portainer-managed stack's project name. Portainer stores the secrets you
typed into its UI in `/data/compose/<id>/stack.env` on the host, completely separate from any
`.env` you have elsewhere — running compose against the same project name from a different
directory silently substitutes _your_ env values (different passwords, etc.) and can recreate
containers (including the database) with mismatched credentials. If you need to intervene
manually, use that stack's own `stack.env`: `docker compose -p carrental-app -f compose.prod.yaml
--env-file /data/compose/<id>/stack.env up -d`.

One more consequence of the app and the admin stack being deployed two different ways (Portainer
git-stack vs. this runbook's manual `docker compose -f compose.prod.yaml -f compose.admin.yaml`):
they end up on two different Docker networks, and Prometheus's `carrental-api` scrape target
shows `down` (DNS lookup failure for `api`) even though the app is perfectly healthy — Loki still
sees its logs fine, since Promtail discovers every container on the host regardless of network,
but a metrics scrape is a real HTTP connection that needs the two on the same network. Fix:
`docker network connect <app's-project-name>_default carrental-prometheus-1` (find the network
name with `docker network ls`). This doesn't happen if you deploy both from the _same_ `docker
compose -f compose.prod.yaml -f compose.admin.yaml up -d` invocation, as this runbook otherwise
recommends — they'd share one project and one network from the start.

## 6. Using it

- **"A container is misbehaving"** → Portainer: see its state, logs tail, restart it, or exec a
  shell in without SSH-ing into the host and running raw `docker` commands.
- **"Something failed for one request"** → Grafana → Explore → Loki, filter
  `{container="carrental-api-1"}`, search for the `X-Request-Id`/`X-Correlation-Id` value from
  the failing response (the API already sets these — DEC-017) to pull every log line for that one
  request, then flip to the Prometheus tab in the same time window for latency/error-rate context.
- **"Is the DB okay / let me check this row"** → Adminer, server `postgres`, credentials from
  your `.env` (`POSTGRES_PASSWORD`). Read-only habits recommended even though nothing enforces
  it — this is a direct line to production data.
- **"Is it a network problem"** → Grafana dashboards from node-exporter (host-level: interface
  throughput, retransmits, connection counts) and cAdvisor (container-level: which service is
  saturating the link). For anything below that — actual packet capture, `mtr`, `dig` — those
  dashboards won't get you there; drop a one-off tool container on the same network instead:
  `docker run --rm -it --network container:carrental-api-1 nicolaka/netshoot` gives you `tcpdump`,
  `mtr`, `dig`, `curl` etc. from the exact network namespace the API container sees.

## 7. Trimming it down

If the full stack is too heavy even with swap, drop pieces independently — nothing else depends
on cAdvisor or node-exporter being present, Prometheus just has one fewer target:

```bash
docker compose -f compose.prod.yaml -f compose.admin.yaml stop cadvisor node-exporter
```

Portainer + Adminer alone (container management + DB) is a reasonable floor if you want to skip
the Grafana/Prometheus/Loki log-and-metrics layer entirely.

## 8. Teardown

```bash
docker compose -f compose.prod.yaml -f compose.admin.yaml down   # add -v to also drop metrics/log history
```

This never touches `compose.prod.yaml`'s own volumes (`pgdata`, `redisdata`) — the admin stack's
volumes (`prometheusdata`, `lokidata`, `grafanadata`, `portainerdata`) are separate.
