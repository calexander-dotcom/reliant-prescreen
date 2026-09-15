# Read this first: how work in this repository is coordinated

Several Claude Code sessions work in this repository and on the owner's
infrastructure. Each one runs in its own container with a fresh clone and
**no view of the others** — no shared memory, no access to the servers unless
the owner grants it, no way to know what another session deployed. This file
is the one thing every session reads (it is loaded automatically when a
session starts). It is the only reason a session can know what the others
are doing, so keep it true: if you deploy, schedule or run anything outside
this repository, or start a new line of work, record it here **in the same
change**.

The owner is Charles.

## Rules for every session

1. **The owner's EC2 instance runs many things, most of them not in this
   repository.** Never propose stopping, terminating, rebooting, resizing or
   reconfiguring it, and never assume it does only what this file lists. A
   session that has not been given access to the box knows nothing about it
   beyond what is written here.
2. Before touching anything that runs outside this repository — the EC2
   box, Vercel, AWS, DNS, SendGrid, Twilio, GHIN, Redis — read the inventory
   below and ask the owner. Say plainly what you know and what you are
   guessing.
3. When you add a cron job, service, deploy, scheduled task, webhook or
   credential anywhere, add a row to the inventory in the same pull request.
   When you retire something: stop it where it runs, revoke its credentials,
   remove its code, and update this file.
4. One repository, several projects. Work inside your project's directory.
   `main` is an empty initial commit; the **default and production branch is
   `claude/car-watch-cli-tool-takl8x`** — a historical name; it is the golf
   app's production branch on Vercel. Branch from it, not from `main`, or
   your branch will lack the other projects and Vercel's preview build for
   the golf app will fail on it (harmless, but noisy).
5. Do not delete, force-push or rebase another session's branch.

## Projects in this repository

| Where | What | Runs on | Status |
|---|---|---|---|
| `golf/` | **Golf Bets** — a round and gambling tracker for a foursome (Next.js). One downs, banker, nassau, skins; GHIN import; view-only share links. See `golf/README.md`. | Vercel project **golf_bets**, root directory `golf`, production branch `claude/car-watch-cli-tool-takl8x`, https://golfbets-mocha.vercel.app. A Redis Cloud store (Vercel marketplace, free tier) holds shared rounds. | Live. Session `claude/golf-gambling-tracker-2xn3ty` develops it and merges its own PRs into the production branch with the owner's standing approval. |
| `car_watch.py` (removed) | CLI that watched used-car listings and emailed matches. | Was an hourly cron job on the EC2 box (`/home/ubuntu/car_watch`). | **Retired 2026-09-15.** Code removed in PR #24; last version at commit `3d895ee`. The cron line and directory on the box, and its SendGrid and MarketCheck keys, are the owner's to remove and revoke. |
| `claude/car-buying-search-05or0p` | Another session's work. Latest commit (2026-07-28): "Add .env.example and deployment-update docs". Top level: .env.example .gitignore README.md car_watch.py requirements.txt test_dry_run.py | **Unknown — that session or the owner to fill in** | **Unknown** |
| `claude/resume-twilio-q9x9yj` | Another session's work. Latest commit (2026-07-13): "Scaffold Twilio SMS pre-screening service". Top level: .env.example .gitignore README.md package-lock.json package.json src tsconfig.json | **Unknown — that session or the owner to fill in** | **Unknown** |
| `claude/website-down-notifications-j6toqp` | Another session's work. Latest commit (2026-09-15): "Add triage script for intermittent 503 on the new site". Top level: .gitignore README.md car_watch.py ops requirements.txt test_dry_run.py | **Unknown — that session or the owner to fill in** | **Unknown** |

## Shared infrastructure

### EC2 instance (Ubuntu)

**The owner has said a lot runs here.** This inventory is what the sessions
have been told; it is not what is there. Owner-maintained.

| What | How it runs | Path | Ports / domains | Owned by | Notes |
|---|---|---|---|---|---|
| `car_watch.py` | cron, hourly (`0 * * * *`), user `ubuntu` | `/home/ubuntu/car_watch` | — | retired | Remove the cron line and the directory; the `.env` there holds SendGrid and MarketCheck API keys — revoke them. |
| *everything else* | ? | ? | ? | ? | **Owner to fill in.** |

To fill this in, **SSH into the instance first** (the user there is
`ubuntu`; the owner's Chromebook prompt reads `calexander@penguin`, which is
a different machine), then run this and paste the output to a session, which
will write it up here:

```
crontab -l; sudo ls /etc/cron.d; systemctl list-units --type=service --state=running --no-pager; systemctl list-timers --all --no-pager; docker ps 2>/dev/null; pm2 list 2>/dev/null; sudo ss -ltnp; ls -la ~
```

### Chromebook Linux container (`penguin`, user `calexander`)

The owner's own machine, not a server — but things have been installed on
it. Inventoried 2026-09-15 from the owner's paste; identification pending.

| What | How it runs | Path | Ports | Owned by | Notes |
|---|---|---|---|---|---|
| A Node process | started at boot (pid 188) — probably a user-level systemd service | **unknown** | `*:8085` | **unknown** | Identify with `ps -o pid,user,etimes,args -p $(pgrep -o node)` and `systemctl --user list-units --type=service --no-pager`. |
| `vms-reply-monitor` | a file in `/etc/cron.d` | **unknown** | — | **unknown** | `cron` is not installed on the machine (`crontab: command not found`, no cron daemon among running services), so this job is most likely **not running**. Read it with `cat /etc/cron.d/vms-reply-monitor`. |

Nothing else listens on the machine; the only other running services are the
container's own (avahi, dbus, polkit, getty, journald, logind, udevd,
wpa_supplicant).

### Vercel

- Project **golf_bets** → this repo, root directory `golf`, production branch
  `claude/car-watch-cli-tool-takl8x`, https://golfbets-mocha.vercel.app.
  Every branch push gets a preview build; a branch without `golf/` fails its
  preview, which affects nothing. Settings → Git → Ignored Build Step
  ("Only build Production") would silence that.
- Redis store connected to golf_bets for shared rounds (Redis Cloud, free
  tier, RAM-only). The app tolerates it being wiped.

### Credentials known to exist

| Credential | Where | For | Status |
|---|---|---|---|
| SendGrid API key | `/home/ubuntu/car_watch/.env` on the EC2 box | car watcher emails | retire with the watcher — revoke |
| MarketCheck API key | same | car listings | revoke if nothing else uses it |
| Redis Cloud connection string | Vercel env of golf_bets (injected by the integration) | shared golf rounds | active |
| GHIN login | typed on the phone; token kept in the browser only | golf app's GHIN import | nothing stored server-side |

## Active work log

Append a row when you start, deploy, or finish something. Newest last.

| Date | Session / branch | What | Where it runs | Status |
|---|---|---|---|---|
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | Golf Bets app, ongoing features | Vercel | live |
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | Retired `car_watch.py` (PR #24) | EC2 cron — owner removing | done in repo; box and keys pending |
| 2026-09-15 | `claude/website-down-notifications-j6toqp` | Site-down notifications / 503 triage | **unknown** | in progress — that session to fill in |
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | Inventory of the owner's Chromebook container from a paste; EC2 inventory still pending | — | partial — see Shared infrastructure |
