# Rex for Susan — setup plan

Goal: Susan can ask Rex (Telegram, @Synergy_staffing_bot) anything she would ask Charles's
Claude Code — LaborEdge, QuickBooks, Paychex Flex, Gmail, Drive — and get a **correct** answer
or an honest "I'm not sure", and can have things done safely.

Written 2026-10-01 evening by the session on branch `claude/dreamy-shannon-4ozf1l` (started on the
web, teleported to the Chromebook). Read `CLAUDE.md` → "OpenClaw and Rex" first for what exists.
Tick items here as they are done, in the same change as the work.

**Live tracker:** https://claude.ai/artifact/XNrkcnd3wAUm8G6QQcnTCs ("Rex Rollout", private to Charles). Its task list is the
artifact's database — collection `tasks` (fields `section`, `order`, `title`, `detail`, `status`
todo|doing|blocked|done, `owner`, `note`, `updated`) and `log` (`at`, `text`). A session with the
Artifact tools updates it with `ArtifactData` (read the doc, then write with its `if_version`).
Keep this file and the tracker in step.

**Rules that apply to every step:** the OpenClaw gateway on the EC2 box is shared by eight agents —
change only Rex unless Charles says otherwise; back up to `~/.openclaw/backups/<date>-<reason>/`
before editing; external APIs are read-only (GET, or a POST read whose shape is copied from code
already live) — never a guessed write; never print a secret into a session (grep for **names**, not
values — a grep on 10/01 printed two LaborEdge secrets).

---

## Done on 2026-10-01

- [x] Inventoried OpenClaw/Rex into `CLAUDE.md` (PR #92, merged).
- [x] Rex model → `anthropic/claude-opus-4-7`, fallback Sonnet 4.6; his sub-agents Sonnet 4.6 (were Haiku).
- [x] `bootstrapMaxChars` 12000 → 24000 — Rex's `MEMORY.md` was being cut off mid-"Benefits 2026–27".
- [x] `AGENTS.md`: read `memory/knowledge/INDEX.md` every session; answering rules (open the whole
      note, fetch live data, cite the source, say "I'm not sure").
- [x] `SOUL.md` replaced (generic "boil the ocean" → accuracy first, ask before acting).
- [x] Skill `synergy-quickbooks` (read-only, SELECT only). Tested: A/R answer correct.
- [x] Brave web search: plugin pinned to 2026.5.7 (9.7 broke on the 5.7 core), key stored. Tested.
- [x] LaborEdge MCP connected to Rex only (others `tools.deny: ["bundle-mcp"]`). Tested both ways.
- [x] LE MCP server: added `find_candidate`, `get_deal_sheets`, `get_journal`. First two tested.
- [x] Rex `MEMORY.md`: Working/Onboarding status IDs were swapped (2321/2325) — corrected.
- [x] Knowledge-sync redactor now catches lowercase `basic …` credentials; Rex's copy re-synced.
- [x] Chromebook watchers identified: user systemd timers (table in `CLAUDE.md`).

---

## 1. Security — do first

- [ ] **Rotate the LaborEdge credentials exposed on 10/01**: the `api_synergy_recruiter` password
      and the LE client `basic` value (both hardcoded as fallbacks in `~/le-mcp/wf-le.js` on EC2).
      Ask LaborEdge support. Before rotating, list **every place** that uses them (search by variable
      or user name, never by value): `~/le-mcp/wf-le.js`, `~/.openclaw/workspace/workflow-portal/wf-le.js`,
      `~/laboredge-app/laboredge-server.js`, `~/.openclaw/workspace/credentials/laboredge*.json`, pm2
      env, Chromebook scripts and `~/credentials/`. Update all, restart, test, then remove the
      hardcoded fallbacks.
- [ ] Remove the deal-sheet `basic` value from the local memory note `project_laboredge_api.md`,
      from the EC2 mirror `/home/ubuntu/.claude/projects/-home-ubuntu/memory/` (written by
      `sync-memory-to-ec2.sh`), and decide about Rex's old session logs.
- [ ] Run the redactor in audit mode over the whole memory dir
      (`~/.claude/rex-knowledge-redact.py <memory> <tmp> --show`) and read what it changed and what
      it missed — it only knows the secret shapes it was taught.
- [ ] Brave dashboard: set a monthly usage limit (currently "No limit").
- [ ] Review who can reach Rex: `channels.telegram.accounts.rex.allowFrom` = Charles, Susan only.

## 2. Verify Rex really changed (before telling Susan)

- [ ] **Susan's own conversation may still be pinned to Sonnet.** `agents/rex/sessions/sessions.json`
      stored `model: claude-sonnet-4-6` on `agent:rex:telegram:direct:8070985319` (and Charles's).
      Check what her next real message runs on (session log `model` field); if pinned, reset that
      session (`/new` in Telegram, or clear the override) — **ask Charles first**, it drops her chat context.
- [ ] Read one real Rex session trajectory: did he actually read `INDEX.md` at startup and open the
      whole note before answering? If not, the startup line is not enough — consider injecting a
      short index instead.
- [ ] Prompt size: `INDEX.md` is ~21.5K chars read every session on Opus — check cost per message
      (below) and trim if needed.

## 3. Rex's knowledge — remove what is wrong

- [ ] Audit Rex's `MEMORY.md` (now fully visible to him) against the knowledge notes, section by
      section. Known stale: LE host `laborchannel.medefis.com` is dead (use `api-nexus.laboredge.com`).
- [ ] Rex's workspace has ~35 old spec/plan `.md` files (`CLAUDE_CODE_PROMPT.md`,
      `LE_OUTREACH_SPEC.md` — both with the swapped status IDs — `PAYROLL_AUDIT_*`, `VMS_API_*`,
      `VIVIAN_MARKET_IQ_ANALYSIS.md`, …) plus scripts and screenshots. Move the dead ones into
      `workspace/archive/` with a README so he stops treating them as current. Commit the workspace
      to its own git repo (`workspace/.git`, last commit 07/16) for history.
- [ ] Reconcile the Chromebook memory notes with today: `project_openclaw.md` (says v2026.4.29;
      pm2 app list), `project_rex_migration.md` (says "migrate Rex to EC2 next" — he is there),
      `project_rex_susan_access.md`. Add a note for the 10/01 upgrade (no secrets — it syncs to Rex).

## 4. Tools Susan needs — fill the gaps

- [ ] **Ask Susan for her real list**: the 10–20 things she asks most (state filings, licences,
      payroll punch audit, open enrollment, SLR factoring feed, timecards…). Build from that, not guesses.
- [ ] LaborEdge journal notes: `get_journal` gets 403 — LE user `api_synergy_compliance` lacks
      journal access. Either ticket LE (as 59576) or run the MCP server as `api_synergy_recruiter`
      (changes what every MCP client does in LE's logs — Charles decides).
- [ ] LaborEdge name search: the app's index was built 05/20 with 6,242 of ~60K candidates.
      Rebuild it (laboredge-app `POST /api/index/rebuild` — Charles approves) and schedule it, or
      build a live name lookup.
- [ ] Drive: `synergy-drive` runs as Charles. Does Susan need her own Drive (Weekly Time Cards —
      she is Manager there)?
- [ ] Decide **what Rex may do, not just read**, and how he asks first: today it is Gmail drafts only.
      Candidates: SignNow send, LE journal note, LE recruiter change, Paychex/QB changes. Each needs
      a confirmed payload (from a real captured request) and an explicit "yes" step.
- [ ] Rex's cron jobs run on Haiku 4.5 (`agent:rex:cron:*`). List them (`openclaw cron list`) and
      check each is still wanted and accurate enough on Haiku.

## 5. Test with real questions

- [ ] Build a test set from Susan's list (§4) with the right answer for each, checked by hand.
      Run them through Rex in an isolated session (`openclaw agent --agent rex --session-id <test-id>`),
      score right / wrong / "not sure". Re-run after every change.
- [ ] Then have Susan use him for a week; ask her what went wrong. Log misses in this file.
- [ ] If Rex is still unreliable after that: put Claude Code itself behind Telegram (Claude Code
      channels, or an OpenClaw ACP agent — there is an unused `agents/claude-code` folder and an
      `acpx` plugin entry on the box), or give Susan her own Claude seat.

## 6. Infrastructure

- [ ] OpenClaw 2026.5.7 → 2026.9.x: newest Claude models need it. Affects all eight agents; plan a
      window, re-pin the Brave plugin to the new core version, re-test Rex and the Barb bots.
      The systemd unit description still says v2026.4.25 (cosmetic).
- [ ] Cost: Rex now runs Opus. Check Anthropic spend after a few days against the August
      `AI_Cost_Reduction_Plan_080426.md`; set a spend alert.
- [ ] Finish the EC2 inventory into `CLAUDE.md`: `pm2 list`, `/etc/systemd/system` services
      (e.g. `atlas-trader`), system crontab, nginx sites, and the ~25 listening node ports.
      Much of this is already in the memory note `project_openclaw.md` — reconcile, don't redo.
- [ ] Chromebook `~/.claude/CLAUDE.md` should import the repo's `CLAUDE.md`
      (`@/home/calexander/reliant-prescreen/CLAUDE.md`) so sessions started outside the repo read
      the inventory (rule 6). Today it holds only the GET-only rule.
- [ ] Chromebook git identity (`git config --global user.name/email`) — commits today passed it per command.
- [ ] Record in `CLAUDE.md` that Charles granted Claude Code on the Chromebook a permission rule
      for `ssh`/`scp` to the EC2 box (10/01) — every local session can now run commands there.

## Where things are

| What | Where |
|---|---|
| Rex config | EC2 `~/.openclaw/openclaw.json` (agent `rex`, `agents.list[2]`) |
| Rex instructions | EC2 `~/.openclaw/workspace/{SOUL,AGENTS,TOOLS,USER,IDENTITY,MEMORY}.md`, `agents/rex/agent/agent.md` |
| Rex skills | EC2 `~/.openclaw/workspace/skills/synergy-{gmail,drive,paychex,quickbooks}` |
| LaborEdge MCP | EC2 `~/le-mcp/le-mcp-server/server.js` (pm2 `le-mcp-server`), `~/le-mcp/wf-le.js` |
| Backups from 10/01 | EC2 `~/.openclaw/backups/20261001-rex-upgrade/`, `~/le-mcp/le-mcp-server/server.js.bak-20261001` |
| Knowledge sync | Chromebook `~/.claude/rex-knowledge-sync.sh`, `rex-knowledge-redact.py` (+ `.bak-20261001`), timer 02:30 |
| Test sessions | `openclaw agent --agent rex --session-id rex-upgrade-test-…` (isolated from Susan's chat) |
| Restart | `ssh … 'systemctl --user restart openclaw-gateway.service'` (drops all bots ~10 s) |
