# Setup Guide

1. Copy `config/taskagent.env.example` to `/etc/taskagent/taskagent.env` and set mode `0600`.
2. Keep `TASKAGENT_BACKUP_ROOT` on a different filesystem or failure domain from live uploads.
3. Install `/etc/taskagent/taskagent.env` as `root:<service-group>` mode `0640`: systemd reads it and the deterministic monitor, running as the service user, sources the same canonical file. Keep `network-observer.secret.env` root-owned mode `0600`; systemd injects it without the process sourcing it.
3. Run `scripts/validate-config.sh /etc/taskagent/taskagent.env`.
4. Run `scripts/render-config.sh /etc/taskagent/taskagent.env /etc/taskagent/rendered`.
5. Validate the rendered Caddyfile with the installed Caddy binary before reload.
6. Install observer dependencies with `npm ci --omit=dev` and store its bearer token in `/etc/taskagent/network-observer.secret.env`.
7. Install systemd units only after backup and isolated restore verification.

Do not create the TaskAgent team during setup. Provisioning follows the completed deployment verification gate.
