# car_watch.py

A dependency-light Python CLI that monitors used-car listings on the
[MarketCheck](https://www.marketcheck.com/automotive/apis) active-listings API
and emails you (via SendGrid) when **new** matches appear. It's meant to be run
hourly from cron on an Ubuntu box.

It will:

1. Query MarketCheck for every configured **search** — each search is one
   vehicle configuration (make/model/trims/year/price/package), queried in turn
   and merged.
2. Scan each listing's text for that search's option package (e.g. *Driving
   Assistance Professional*, *Professional Package*, *Advanced*) and flag it as
   `confirmed` or `verify`.
3. Dedupe against a local SQLite DB (`seen.db`) so you only get alerted once per
   car (keyed by VIN).
4. Email **only** the new matches — confirmed-package cars listed first.
5. Optionally **text** the same matches via Twilio SMS (best-effort; in
   addition to email).
6. Log everything to `car_watch.log` and **never crash the cron job** on an
   API / network / DB / email error (it logs and exits 0).

---

## What you're searching for

Searches live in the `SEARCHES` list at the top of `car_watch.py`. Each entry
is one independent vehicle configuration; add, remove, or edit entries freely.
Any field left as `None` is simply omitted from the query (no filter on that
attribute). The three shipped searches are:

| Search        | Make/Model    | Trims               | Year    | Mileage    | Price     | Color                   | Option package                    |
|---------------|---------------|---------------------|---------|------------|-----------|-------------------------|-----------------------------------|
| BMW iX        | BMW iX        | `M60`               | ≥ 2023  | < 30,000   | ≤ $55,000 | Black Sapphire Metallic | Driving Assistance Professional   |
| BMW X5        | BMW X5        | any                 | 2025    | —          | —         | any                     | Professional Package              |
| Genesis GV80  | Genesis GV80  | `3.5T Advanced`     | any     | —          | —         | any                     | Advanced                          |

Location is shared by every search: within `RADIUS_MILES` (250) of `ZIP_CODE`
(33544, Wesley Chapel FL).

Per-search fields:

| Field              | Meaning                                                                    |
|--------------------|----------------------------------------------------------------------------|
| `trims`            | Trims to query (one request each); `[]` means "any trim" (a single query). |
| `year_min`/`year_max` | Inclusive year bounds; set both equal for an exact model year.          |
| `miles_max`        | Mileage ceiling.                                                           |
| `price_max`        | Price ceiling.                                                             |
| `exterior_color`   | Exact color; applied only when `STRICT_COLOR` **and** the search's `strict_color` are `True`. |
| `package_label`    | Human-readable name of the option package shown in the alert.              |
| `package_keywords` | If **any** appears in a listing's text (case-insensitive), the listing is flagged `confirmed`, else `verify`. |

`STRICT_COLOR` (module-level) is a master switch: set it to `False` to drop the
color filter from **every** search and widen the net (handy for testing). All
other filters and package detection still apply.

The base URL and endpoint are also constants (`MARKETCHECK_BASE_URL`,
`MARKETCHECK_ENDPOINT`) so they're easy to swap later.

---

## Setup

### 1. Install

```bash
# On the Ubuntu EC2 box
sudo apt-get update && sudo apt-get install -y python3 python3-pip
git clone <your-repo> /home/ubuntu/car_watch
cd /home/ubuntu/car_watch
pip3 install -r requirements.txt
```

The only third-party dependency is `requests`; everything else
(`sqlite3`, `argparse`, `logging`, `json`, `html`) ships with Python 3.

### 2. Environment variables (no secrets in the code)

```bash
export MARKETCHECK_API_KEY="your-marketcheck-key"
export SENDGRID_API_KEY="your-sendgrid-key"
# Optional — only needed if you want text-message alerts (see below):
export TWILIO_ACCOUNT_SID="your-twilio-account-sid"
export TWILIO_AUTH_TOKEN="your-twilio-auth-token"
```

Put these in `/home/ubuntu/car_watch/.env` and source them, or add them to the
cron environment (see the crontab note below). **Nothing sensitive is
hardcoded** — both keys are read from the environment at runtime.

You must also set two constants at the top of `car_watch.py`:

```python
FROM_EMAIL = "car-watch@example.com"   # a SendGrid-verified sender
TO_EMAILS  = [                         # everyone who gets the alert
    "you@example.com",
    "someone-else@example.com",
]
```

### 3. How to get a MarketCheck API key

1. Go to <https://www.marketcheck.com/automotive/apis> and sign up for a
   developer account.
2. Create an application in their dashboard — you'll be issued an **API key**
   (and secret).
3. Export the key as `MARKETCHECK_API_KEY`. The script passes it as the
   `api_key` query parameter on every request.

### 4. How to get a SendGrid API key

1. Sign up at <https://sendgrid.com/> and verify a sender identity (the address
   you set as `FROM_EMAIL`).
2. Settings → API Keys → **Create API Key** (Mail Send permission is enough).
3. Export it as `SENDGRID_API_KEY`.

### 5. (Optional) Text-message alerts via Twilio

Texts are sent **in addition** to email and are **best-effort**: if a text
fails it's logged but never blocks the email or causes a re-alert (email is the
system of record for what's been "seen"). Texting is **off** until you add at
least one recipient number.

1. Sign up at <https://www.twilio.com/>, then grab your **Account SID** and
   **Auth Token** from the console and buy/verify an SMS-capable phone number.
2. Export the credentials as `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
3. In `car_watch.py`, set your Twilio sending number and the recipients (all in
   [E.164](https://www.twilio.com/docs/glossary/what-e164) format, e.g.
   `+18135551234`):

   ```python
   TWILIO_FROM_NUMBER = "+1XXXXXXXXXX"   # your Twilio number
   SMS_TO_NUMBERS = [
       "+1XXXXXXXXXX",                   # Rex
   ]
   ```

Leave `SMS_TO_NUMBERS` empty to disable texting entirely (the run just logs
that SMS is off and continues).

---

## Try it dry-run first

Always do a dry run before wiring up cron. `--dry-run` does everything except
send email/text and does **not** write to the dedupe DB — it prints the matches
plus an SMS preview to stdout.

```bash
# Against your real MarketCheck key:
MARKETCHECK_API_KEY=xxxx python3 car_watch.py --dry-run
```

To prove the parsing / dedupe / email-formatting logic **without any real API
keys**, run the included stub test, which feeds a sample MarketCheck response
through the whole pipeline with `STRICT_COLOR=False`:

```bash
python3 test_dry_run.py
```

You should see 5 sample matches print (4 package-confirmed, 1 to verify) across
the BMW iX, BMW X5, and Genesis GV80 searches, the email HTML render with
confirmed cars first, and the dedupe DB record all 5 VINs so a re-check yields
0 new.

---

## CLI flags

| Flag        | Effect                                                                 |
|-------------|------------------------------------------------------------------------|
| `--dry-run` | Do everything except send email; print matches. Does not touch the DB. |
| `--reset`   | Clear `seen.db` and exit (start fresh).                                 |
| `--once`    | Run a single check. This is the default — the script is cron-driven, not a long-running loop. |

```bash
python3 car_watch.py            # single live check (default)
python3 car_watch.py --dry-run  # preview, no email, no DB writes
python3 car_watch.py --reset    # wipe the dedupe DB
```

---

## Run it hourly with cron

```bash
crontab -e
```

Add exactly this line:

```cron
0 * * * * cd /home/ubuntu/car_watch && /usr/bin/python3 car_watch.py >> car_watch.log 2>&1
```

> **Cron doesn't inherit your shell environment.** Make sure
> `MARKETCHECK_API_KEY` and `SENDGRID_API_KEY` are visible to cron. Easiest
> options:
>
> - Put `export` lines in a file and source it in the cron command:
>   `0 * * * * cd /home/ubuntu/car_watch && . ./.env && /usr/bin/python3 car_watch.py >> car_watch.log 2>&1`
> - Or define the vars at the top of the crontab (above the schedule line).

The script also writes structured, timestamped entries to `car_watch.log`
itself (how many results came back, how many were new, what was emailed), so
the `>> car_watch.log` redirect simply captures anything else cron prints.

---

## How option-package detection works

MarketCheck (like most listing APIs) doesn't reliably filter on option
packages, so the script does its own keyword scan over whatever text the API
returns for each listing — description, options, and high-value/installed
features. Each search brings its own keyword list:

- `package_status = "confirmed"` if the text contains **any** of that search's
  `package_keywords` (case-insensitive).
- `package_status = "verify"` otherwise — meaning *you should check the listing
  manually*; the package may still be present but unlisted in the API text.

Edit a search's `package_keywords` / `package_label` in the `SEARCHES` list to
change what counts as confirmed and how it's labeled in the alert.

---

## Files

| File               | Purpose                                            |
|--------------------|----------------------------------------------------|
| `car_watch.py`     | The tool.                                          |
| `requirements.txt` | The single dependency (`requests`).                |
| `test_dry_run.py`  | Offline stub test — proves the logic, no API keys. |
| `seen.db`          | SQLite dedupe DB (auto-created; `--reset` to wipe).|
| `car_watch.log`    | Timestamped run log (auto-created).                |
