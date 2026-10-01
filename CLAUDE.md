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
6. **Sessions run in two places** and cannot see each other: Claude Code on
   the web (a fresh container per session; reads this file from the repo)
   and Claude Code installed on the owner's Chromebook (reads
   `~/.claude/CLAUDE.md` on that machine). This file is the canonical
   record. The Chromebook's `~/.claude/CLAUDE.md` should import it —
   `@/home/calexander/reliant-prescreen/CLAUDE.md` with the repo cloned
   there — or carry a copy, so a local session reads the same rules and
   inventory. A local session that changes what runs on the Chromebook
   must record it here, in the repo, not only locally.

## Projects in this repository

| Where | What | Runs on | Status |
|---|---|---|---|
| `golf/` | **One Downs** (formerly Golf Bets) — a round and gambling tracker for a foursome (Next.js). One downs, banker, nassau, skins; GHIN import; view-only share links. See `golf/README.md`. | Vercel project **golf_bets**, root directory `golf`, production branch `claude/car-watch-cli-tool-takl8x`, https://golfbets-mocha.vercel.app. A Redis Cloud store (Vercel marketplace, free tier) holds shared rounds. | Live. Session `claude/golf-gambling-tracker-2xn3ty` develops it and merges its own PRs into the production branch with the owner's standing approval. |
| `car_watch.py` (removed) | CLI that watched used-car listings and emailed matches. | Was an hourly cron job on the EC2 box (`/home/ubuntu/car_watch`). | **Retired 2026-09-15.** Code removed in PR #24; last version at commit `3d895ee`. The cron line and directory on the box, and its SendGrid and MarketCheck keys, are the owner's to remove and revoke. |
| `claude/car-buying-search-05or0p` | Another session's work. Latest commit (2026-07-28): "Add .env.example and deployment-update docs". Top level: .env.example .gitignore README.md car_watch.py requirements.txt test_dry_run.py | **Unknown — that session or the owner to fill in** | **Unknown** |
| `claude/resume-twilio-q9x9yj` | Another session's work. Latest commit (2026-07-13): "Scaffold Twilio SMS pre-screening service". Top level: .env.example .gitignore README.md package-lock.json package.json src tsconfig.json | **Unknown — that session or the owner to fill in** | **Unknown** |
| `claude/website-down-notifications-j6toqp` | Another session's work. Latest commit (2026-09-15): "Add triage script for intermittent 503 on the new site". Top level: .gitignore README.md car_watch.py ops requirements.txt test_dry_run.py | **Unknown — that session or the owner to fill in** | **Unknown** |

## Shared infrastructure

### EC2 instance (Ubuntu)

Separate from the Chromebook below, which turned out to be where most of
the automation lives. Apart from OpenClaw (next section), what runs here is
still unknown to the sessions; the Chromebook holds `sync-memory-to-ec2.sh`,
`~/.claude/rex-knowledge-sync.sh` and SSH access to this box (the `ec2`
host alias in `~/.ssh/config`, and `~/.ssh/openclaw-key.pem`).
Owner-maintained.

| What | How it runs | Path | Ports / domains | Owned by | Notes |
|---|---|---|---|---|---|
| `car_watch.py` | cron, hourly (`0 * * * *`), user `ubuntu` | `/home/ubuntu/car_watch` | — | retired | Remove the cron line and the directory; the `.env` there holds SendGrid and MarketCheck API keys — revoke them. |
| OpenClaw gateway — Telegram/WhatsApp AI agents, including **Rex** | OpenClaw, user `ubuntu` | `/home/ubuntu/.openclaw/` | Telegram bots | owner | See **OpenClaw and Rex** below. |
| LaborEdge app (`laboredge-server.js`) — holds the working LE auth (`leAuth()`) | node, user `ubuntu`, up since about 2026-09-11 | `/home/ubuntu/laboredge-app/` | `*:8084` | owner | Seen running 2026-10-01; how it is started not checked. |
| LE job board (`server.js`) | node, user `ubuntu` | `/home/ubuntu/le-jobboard/` | ? | owner | Feeds le.synergymedicalstaffing.com; `search_jobs` below reads it. |
| **LaborEdge MCP server** — read-only tools `search_jobs`, `search_candidates_by_status`, `get_candidate`, `search_assignments`, `master_lists` | node, user `ubuntu` | `/home/ubuntu/le-mcp/le-mcp-server/` | `8099`, path `/mcp/<MCP_AUTH_TOKEN>` | owner | Not yet connected to Rex. |
| *everything else* (about 25 node ports listening) | ? | ? | ? | ? | **Owner to fill in.** |

To fill this in, **SSH into the instance first** (the user there is
`ubuntu`; the owner's Chromebook prompt reads `calexander@penguin`, which is
a different machine), then run this and paste the output to a session, which
will write it up here:

```
crontab -l; sudo ls /etc/cron.d; systemctl list-units --type=service --state=running --no-pager; systemctl list-timers --all --no-pager; docker ps 2>/dev/null; pm2 list 2>/dev/null; sudo ss -ltnp; ls -la ~
```

### OpenClaw and Rex (on the EC2 box) — the team's Telegram AI agents

Inventoried 2026-10-01 by a local Claude Code session on the Chromebook,
read-only, from `~/.openclaw/openclaw.json`, the agent folders and session
logs. **OpenClaw** is an agent framework that connects LLM agents to chat
apps. One gateway on the EC2 box serves several agents, each bound to its own
Telegram bot:

| Agent id | Bot account | Who talks to it | Workspace |
|---|---|---|---|
| `rex` | `rex` (@Synergy_staffing_bot) | Charles and Susan (allowlist; separate conversation each) | `~/.openclaw/workspace` |
| `recruiter` ("Barb") | `barb` | recruiters, incl. Angela | `~/.openclaw/workspace-recruiterasst` |
| `barb-marcia`, `barb-tracey`, `barb-ann` | `default`, `tracey`, `ann` | Marcia, Tracey, Ann | `~/.openclaw/workspace-recruiterasst` |
| `atlas` | `atlas` | Charles | `~/openclaw-trading/workspace` |
| `alexanderfambot` | WhatsApp (channel disabled) | family | `~/openclaw/workspace/alexanderfambot` |
| `main` | — | — | `~/openclaw/workspace` (the default) |

There is also an agent folder `~/.openclaw/agents/claude-code` (not in the
agent list) and an `~/.openclaw/acpx` folder — possibly a bridge that runs
Claude Code as an OpenClaw agent; not investigated.

**Rex** is the back-office assistant for Charles and **Susan** (Susan's access
was given on 2026-09-10). As found on 2026-10-01:

- **Model:** global default `anthropic/claude-sonnet-4-6`, fallback Haiku 4.5;
  sub-agents and cron jobs run Haiku 4.5. Rex has no per-agent override.
- **Instructions:** `agents/rex/agent/agent.md`, and in the workspace
  `SOUL.md` (OpenClaw's generic template), `IDENTITY.md`, `USER.md` (Charles +
  Susan), `AGENTS.md` (red lines: LaborEdge and other APIs GET-only; email
  drafts only; never reveal credentials), `TOOLS.md`, `MEMORY.md`.
  `SOUL-rex.md` is a separate candidate-texting persona, not his main soul.
- **Knowledge:** the Chromebook's Claude Code memory
  (`~/.claude/projects/-home-calexander/memory/`) is copied nightly to
  `workspace/memory/knowledge/` by the user systemd timer
  `rex-knowledge-sync.timer` (02:30) → `~/.claude/rex-knowledge-sync.sh` →
  `~/.claude/rex-knowledge-redact.py`, which blanks credentials and refuses to
  ship if anything secret-shaped survives. `MEMORY.md` arrives as `INDEX.md`.
  **Anything written into that memory directory reaches Rex** — never put a
  raw secret there. Rex reaches it only through memory search, which he often
  skips.
- **Tools:** skills `synergy-gmail` (search/read/draft in Charles's or
  Susan's mailbox; no send), `synergy-drive` (read-only, as Charles),
  `synergy-paychex` (Paychex Flex, read-only), `synergy-quickbooks` (added
  2026-10-01, below); plus shell, web search and fetch. **No LaborEdge
  skill yet** — `TOOLS.md` tells him not to hand-write LE API calls.
- **Known weakness:** wrong answers to Susan on basics (e.g. the 2026-09-10
  benefits question answered from a dead rate sheet). Fixes in progress — see
  the work log.
- **Prompt size limit:** OpenClaw injects each workspace file into the prompt
  only up to `agents.defaults.bootstrapMaxChars` (default 12,000 characters).
  Rex's `MEMORY.md` is about 15,900, so until 2026-10-01 it was cut mid-way
  through the "Benefits 2026–27" section and the Paychex section never reached
  him. The owner raised the limit to 24,000 on 2026-10-01; Rex's was the only
  file over 12,000 in any workspace, so no other agent changed.
- **Gateway:** user systemd service `openclaw-gateway.service` (port 18790),
  OpenClaw 2026.5.7 installed (2026.9.4 available; 5.7's catalogue stops at
  Opus 4.7). Config changes need `systemctl --user restart
  openclaw-gateway.service`, which briefly drops every agent. Brave web search
  is configured but its plugin is not installed, so Rex's web search is dead.

**Changed 2026-10-01** (backups in
`~/.openclaw/backups/20261001-rex-upgrade/`): Rex's own model set to
`anthropic/claude-opus-4-7`, fallback Sonnet 4.6, sub-agents Sonnet 4.6 (in
his `agents.list` entry; other agents untouched) — live after the owner's
restart at 12:56 EDT, confirmed by a test question in an isolated session
(`rex-upgrade-test-20261001`) that ran on Opus 4.7 and cited its source;
new skill `workspace/skills/synergy-quickbooks/` (`qb.js`: customers,
invoice, invoices, open-balances, payments, raw `query`) — SELECT-only by
code, reuses `credentials/qbo.json` + `qbo-token.json` and the same refresh
logic as `workspace/qbo.js`; tested live (Rex answered an A/R question with
the right five invoices and total); Brave web-search plugin
`@openclaw/brave-plugin` installed (owner-approved) — 2026.9.7 failed to load
on the 2026.5.7 core (missing module), so it was pinned to **2026.5.7**, which
loads; the owner stored the Brave key with `openclaw configure --section web`
at about 13:35 EDT and a test search worked (no restart needed) — Rex's web
search had never worked before, as no key was ever set. **Pin the plugin to
the core's version** whenever OpenClaw is updated; `AGENTS.md` startup now reads `memory/knowledge/INDEX.md`
and adds rules for answering (open the whole note, fetch live data, cite the
source, say "I'm not sure"); `SOUL.md` replaced with an accuracy-first one.
`bootstrapMaxChars` raised to 24000 (owner). **Not done:** connecting Rex to
the LaborEdge MCP server above — it needs the server's `MCP_AUTH_TOKEN` put
into OpenClaw's config, which a session's permission check would not allow;
the owner to do or approve.

**Knowledge-sync redaction fix (2026-10-01):** `rex-knowledge-redact.py`
matched only a capitalised `Basic` header, so the LE deal-service client
credential in `project_laboredge_api.md` (written `basic …`) reached Rex.
The pattern is now case-insensitive and also a residual check; a re-sync at
13:11 EDT cleaned Rex's copy. The original note, the plain mirror that
`sync-memory-to-ec2.sh` keeps on the box, and old Rex session logs still hold
it — owner to decide whether to scrub the note and ask LaborEdge to rotate it.

Rules for sessions: the gateway is shared by every agent above, so change
only Rex's own entry and files unless the owner says otherwise, back up
before editing (`~/.openclaw/backups/<date>-<reason>/`), and use value-mode
`openclaw config set` then `openclaw config validate` (`config patch` fails
on an old schema complaint).

### Chromebook Linux container (`penguin`, user `calexander`) — where most of the owner's automation lives

**This is the machine the owner means by "a lot running on it."** It holds
the recruiting-operations tooling for the owner's staffing business:
LaborEdge (ATS/VMS) integrations, Twilio SMS and voice, Vivian Health lead
handling, SignNow contracts, payroll, compliance and licence checks. Claude
Code is also installed and used **locally** here (`~/.claude`), so sessions
on this machine are among the agents this file is for — and they read
`~/.claude/CLAUDE.md` on that machine, not this file, unless it is imported
(rule 6). Inventoried 2026-09-15 from the owner's paste.

**Running now, confirmed:**

| What | How it runs | Path | Ports | Notes |
|---|---|---|---|---|
| LE SMS Dashboard (recruiter comms) | user systemd service `le-sms-dashboard.service`, up since about 2026-09-09 | `~/le-sms-dashboard.js` | `*:8085` | Log `~/le-sms-dashboard.log`. The only thing listening on the machine. |

**Ran today — scheduler not yet identified** (there is no cron daemon on
the box; most likely user systemd timers or a supervising process — see the
commands below):

| What | Evidence | Path |
|---|---|---|
| Twilio email watch | log and state written 2026-09-15 11:37 | `~/twilio-email-watch.js` |
| Twilio campaign watch | log and state written 2026-09-15 08:17 | `~/twilio-campaign-watch.js` |
| LaborEdge job data check | log written 2026-09-15 08:01 | `~/le-job-data-check.js` |

**Installed but not running:**

| What | Why it is inert |
|---|---|
| `/etc/cron.d/vms-reply-monitor` → `python3 ~/vms-reply-monitor.py` every 30 minutes | `cron` is not installed on the machine; no log file exists; its state file was last written 2026-05-04. Whatever it was meant to catch, it has not been catching since May. |
| `~/car_watch/` | A copy of the retired car watcher. No cron here either. |

**On disk, running state unknown** — servers that are not listening now
(they may be deployed elsewhere, such as the EC2 box, or run by hand), bots,
watchers and one-off scripts. Do not assume any of these is dead or alive:

- Servers: `laboredge-server.js`, `le-jobboard-server.js`, `rtr-server.js`,
  `payroll-server.js`, `srv.js`, `le-sms-dash.js`, `le-sms-dashboard-demo.js`,
  `sms-inbound-webhook.js`, `click-to-call.js` (+ `ivr-config.json`).
- Bots and watchers: `le-outreach-bot.js`, `le-outreach-sms-reply.js`,
  `vivian-lead-intake.js`, `vivian-lead-dashboard.js`, `vivian-propose-bot.js`,
  `vivian-pay-compare.js`, `compliance-watchdog.js`,
  `telegram-gateway-watchdog.sh`, `ai-comms-monitor.js`,
  `call-summary-engine.js`, `le-gm.js` (log last 2026-08-12), `le-journal.js`.
- Tools and one-offs: `contract-autofill.js` / `contract-fill-engine.js`,
  `twilio-tfv-submit.js`, `sms-optout.js`, backfill, probe, sweep and
  per-person fix scripts, `create-vms-drafts.py`, `create-huvi-draft.py`,
  `gmail-auth.py`.
- Directories: `synergy-web/` (the company site — the "new site" of the
  website-down work?), `workflow-portal/`, `oe-console/`,
  `new-hire-benefits/`, `signnow-work/`, `nursys/`, `mr-promote/`,
  `sms_work/`, `workflows/`, `le-text-extension/` and
  `synergy-comms-extension/` (Chrome extensions), and `Open Claw/` —
  despite the name, **not** OpenClaw itself: a working folder of business
  documents (tax returns, payroll and commission reports, timesheets) and
  tools (`qb_tool/`, `flex_tool/`, `qc_tool`). Sensitive; never copy it out.
  The OpenClaw agents run on the EC2 box (see above).
- `sync-memory-to-ec2.sh` — mirrors the Claude Code memory directory to
  `/home/ubuntu/.claude/projects/-home-ubuntu/memory` on the EC2 box (run
  by hand). `~/.claude/rex-knowledge-sync.sh` sends a redacted copy to Rex
  nightly (see OpenClaw and Rex).

**Secrets and sensitive data on this machine** — never copy them anywhere,
never print them into a session: `~/credentials/`, `~/gmail-token.json`,
`~/.ssh/`, and caches holding candidate data
(`.laboredge-candidate-index.json` 3 MB, `.le-gm-cache.json` 9 MB,
`le-jobs-raw.json` 15 MB, `le-outreach-journal-cache.json`).

To finish identifying what runs and how, on the Chromebook:

```
systemctl --user list-timers --all --no-pager; ps -eo pid,user,etimes,args | grep -E "node|python" | grep -v grep
```

### Vercel

- Project **golf_bets** → this repo, root directory `golf`, production branch
  `claude/car-watch-cli-tool-takl8x`, https://golfbets-mocha.vercel.app.
  Every branch push gets a preview build; a branch without `golf/` fails its
  preview, which affects nothing. Settings → Git → Ignored Build Step
  ("Only build Production") would silence that.
- Redis store connected to golf_bets for shared rounds (Redis Cloud, free
  tier, RAM-only). The app tolerates it being wiped.
- **Three Vercel projects are connected to this one repository** — golf_bets,
  workspace-recruiterasst and reliant-prescreen — so every push to any branch
  starts a build in all three. The account is on the Hobby plan, which allows
  100 deployments a day across the account. That limit was hit on 2026-09-21
  at about 23:30 UTC after a day of small golf pull requests: Vercel answered
  every build with "Deployment rate limited — retry in 24 hours" (API error
  `api-deployments-free-per-day`). **A rate-limited deployment is dropped,
  not queued** — no row appears in the Deployments list at all — so the site
  goes on serving the last build that got through until a fresh push after
  the limit lifts. What it cost here: the newest production build of the golf
  app was PR #46, and PRs #47–#60 sat merged and unbuilt.
  Two things worth knowing for next time:
  - **The window is rolling, not a calendar day.** The counter had not reset
    at 00:00 UTC. Capacity returns gradually, roughly 24 hours after each of
    the spent deployments.
  - **The dashboard cannot work around it.** Redeploy and Promote to
    Production go through the same deployments API and are refused with the
    same error, so there is no way to publish already-built work while the
    cap is in force. The only levers are waiting or the Pro plan.
- **All three projects now skip builds that are not theirs** (2026-09-22), so
  a push costs one build instead of three:
  - **golf_bets** — `golf/vercel.json` turns off preview deployments for the
    golf session's branch (a PR is merged within minutes anyway) and sets
    `ignoreCommand` to `git diff --quiet HEAD^ HEAD ./`, run in the project's
    root directory, which skips any build in which nothing under `golf/`
    changed.
  - **workspace-recruiterasst** and **reliant-prescreen** — the owner set
    Settings → Build and Deployment → Ignored Build Step → Custom to
    `git diff --quiet HEAD^ HEAD -- . ':(exclude)golf/'` on 2026-09-22.
    Both had an empty Root Directory, so the whole repository counted as
    their code and every golf push rebuilt them. The pathspec form is safe
    whichever way Root Directory is set: with it empty the command means
    "skip when `golf/` was the only change", and with it set to a folder the
    `.` narrows to that folder and it means "skip when nothing of mine
    changed". A session that later gives one of these projects a real root
    directory can simplify it to `git diff --quiet HEAD^ HEAD ./`.
  Note the consequence for the golf app: **a production push that changes
  nothing under `golf/` no longer deploys the site.** Only a golf-touching
  push does, or a Redeploy from the golf_bets dashboard. In Vercel, Ignored
  Build Step lives under Settings → Build and Deployment, not under Git.
  Sessions cannot change these dashboard settings themselves: no session has
  a Vercel login or token, and this file's rule 2 applies — ask the owner.

### Credentials known to exist

| Credential | Where | For | Status |
|---|---|---|---|
| SendGrid API key | `/home/ubuntu/car_watch/.env` on the EC2 box | car watcher emails | retire with the watcher — revoke |
| MarketCheck API key | same | car listings | revoke if nothing else uses it |
| Redis Cloud connection string | Vercel env of golf_bets (injected by the integration) | shared golf rounds | active |
| GHIN login | typed on the phone; token kept in the browser only | golf app's GHIN import | nothing stored server-side |
| Brave Search API key ("Synergy oClaw") | `~/.openclaw/openclaw.json` on the EC2 box, set via `openclaw configure --section web`; owner's Brave account (api-dashboard.search.brave.com) | web search for the OpenClaw agents (Rex) | active (stored 2026-10-01); the plan's monthly usage limit was "No limit" — owner advised to set a cap |
| Golf Genius API key (`GOLF_GENIUS_API_KEY`) | Vercel env of golf_bets (Production, type Secret); read server-side only, never in the browser or repo | golf app's Golf Genius read: foursome auto-fill and live score cross-check | active (added by owner 2026-09-30) |

## Active work log

Append a row when you start, deploy, or finish something. Newest last.

| Date | Session / branch | What | Where it runs | Status |
|---|---|---|---|---|
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | One Downs app (renamed from Golf Bets 2026-09-21), ongoing features | Vercel | live |
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | Retired `car_watch.py` (PR #24) | EC2 cron — owner removing | done in repo; box and keys pending |
| 2026-09-15 | `claude/website-down-notifications-j6toqp` | Site-down notifications / 503 triage | **unknown** | in progress — that session to fill in |
| 2026-09-15 | `claude/golf-gambling-tracker-2xn3ty` | Inventory of the owner's Chromebook container from two pastes: the SMS dashboard service, three watchers that ran today by a scheduler not yet identified, an inert cron file, and the toolkit on disk | Chromebook | partial — scheduler and `Open Claw` to identify; EC2 still pending |
| 2026-09-21 | `claude/golf-gambling-tracker-2xn3ty` | Vercel's daily deployment limit hit at ~23:30 UTC; golf PRs #47–#62 ended up merged into the production branch but unbuilt. | Vercel | resolved 2026-09-22 |
| 2026-09-22 | `claude/golf-gambling-tracker-2xn3ty` + owner | Build guards so one push is one build: `ignoreCommand` in `golf/vercel.json` for golf_bets (PR #58), and the owner set an Ignored Build Step on workspace-recruiterasst and reliant-prescreen excluding `golf/`. | Vercel | done |
| 2026-09-22 | `claude/golf-gambling-tracker-2xn3ty` | Cap lifted about 19:20 UTC, roughly 20 hours after it bit. PR #63 (a service worker cache bump) was the golf-touching push that carried PRs #47–#62 to production; golf_bets reported "Deployment has completed" at 19:22 UTC. | Vercel | live |
| 2026-09-30 | `claude/golf-gambling-tracker-2xn3ty` | Golf Genius live integration: type a foursome GGID at round setup → the app auto-fills the four players, handicaps and course; scores poll in during play (~15s) and cross-check hand entry, flagging any clash in pulsing red without overwriting your card. Read-only — Golf Genius has no score-write API. Needs `GOLF_GENIUS_API_KEY` (added to Vercel by owner 2026-09-30). | Vercel | built; key live in Vercel |
| 2026-10-01 | `claude/dreamy-shannon-4ozf1l` (teleported to the Chromebook) | Identified OpenClaw on the EC2 box and its agent Rex (Telegram assistant for Charles and Susan): model, instructions, knowledge sync, tools. Next: upgrade Rex's model, load his knowledge index at startup, add read-only LaborEdge and QuickBooks skills, replace the generic SOUL.md. | EC2 (OpenClaw) | inventoried |
| 2026-10-01 | `claude/dreamy-shannon-4ozf1l` (Chromebook) | Rex upgrade, part 1: own model Opus 4.7 (sub-agents Sonnet 4.6), knowledge index read at startup plus answering rules in `AGENTS.md`, accuracy-first `SOUL.md`. Owner raised `bootstrapMaxChars` to 24000 and restarted the gateway at 12:56 EDT; test run confirmed Opus 4.7. Pending: LaborEdge and QuickBooks read-only skills. | EC2 (OpenClaw) | live |
| 2026-10-01 | `claude/dreamy-shannon-4ozf1l` (Chromebook) | Rex upgrade, part 2: read-only QuickBooks skill (tested live), Brave web-search plugin installed (loads at next restart), knowledge-sync redactor fixed for lowercase `basic` credentials and Rex's copy re-synced. Found the read-only LaborEdge MCP server on the box; connecting it to Rex waits on the owner. | EC2 (OpenClaw), Chromebook | QB live; web search live; LE pending |
