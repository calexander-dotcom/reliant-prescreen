#!/usr/bin/env python3
"""
car_watch.py — Monitor used-car listings and email when new matches appear.

Designed to be run hourly via cron on an Ubuntu box. It is intentionally
dependency-light: only the `requests` library is required (plus the Python
standard library). See README.md for setup and the crontab line.

High-level flow on each run:
  1. Query the MarketCheck active-listings API for vehicles matching the
     criteria configured below (one request per trim, results merged).
  2. Scan each listing's text for a specific option package (DAP keywords).
  3. Dedupe against a local SQLite DB of VINs already alerted on.
  4. Email ONLY the new matches via SendGrid.
  5. Log everything; never let an API/network error crash the cron job.

All secrets come from environment variables — nothing sensitive is hardcoded.
"""

import argparse
import html
import json
import logging
import os
import sqlite3
import sys
import time
from datetime import datetime, timezone

# `requests` is the single third-party dependency. Import defensively so a
# missing dependency produces a clear message instead of a stack trace.
try:
    import requests
except ImportError:  # pragma: no cover - environment setup issue
    print("Missing dependency 'requests'. Run: pip install -r requirements.txt",
          file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# CONFIGURATION  —  edit these to change what gets monitored.
# ---------------------------------------------------------------------------

# --- Data source (MarketCheck) ---------------------------------------------
# Base URL and endpoint are split out so they're trivial to swap later.
MARKETCHECK_BASE_URL = "https://mc-api.marketcheck.com"
MARKETCHECK_ENDPOINT = "/v2/search/car/active"

# --- Search criteria -------------------------------------------------------
MAKE = "BMW"
MODEL = "iX"
# The API generally wants one trim per call; we query each and merge results.
TRIMS = ["xDrive50", "M60"]

EXTERIOR_COLOR = "Black Sapphire Metallic"
YEAR_MIN = 2023
MILES_MAX = 30000
PRICE_MAX = 55000

# Location: within RADIUS_MILES of ZIP_CODE.
ZIP_CODE = "33544"          # Wesley Chapel, FL
RADIUS_MILES = 250

# How many rows to request per trim (API max is typically 50 per page).
ROWS = 50

# When STRICT_COLOR is False, the color filter is dropped from the query so you
# can widen the net (handy for testing). DAP detection and all other filters
# still apply.
STRICT_COLOR = True

# --- Option-package (DAP) detection ----------------------------------------
# If a listing's description/options/features text contains ANY of these
# (case-insensitive), we mark dap_status="confirmed"; otherwise "verify".
DAP_KEYWORDS = ["Driving Assistance Professional", "Highway Assistant"]

# --- Email (SendGrid) ------------------------------------------------------
FROM_EMAIL = "car-watch@example.com"          # must be a SendGrid-verified sender
# Everyone who should receive the alert. Add/remove addresses freely.
TO_EMAILS = [
    "calexander@synergymedicalstaffing.com",
    "susan@synergymedicalstaffing.com",
]
SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send"

# --- Local files -----------------------------------------------------------
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seen.db")
LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "car_watch.log")

# --- Networking ------------------------------------------------------------
HTTP_TIMEOUT = 30  # seconds


# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------

def setup_logging():
    """Configure logging to both the log file and stdout with timestamps."""
    logger = logging.getLogger("car_watch")
    logger.setLevel(logging.INFO)
    # Avoid duplicate handlers if called more than once (e.g. in tests).
    if logger.handlers:
        return logger

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = logging.FileHandler(LOG_PATH)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(fmt)
    logger.addHandler(stream_handler)

    return logger


log = setup_logging()


# ---------------------------------------------------------------------------
# DEDUPE DATABASE (SQLite)
# ---------------------------------------------------------------------------

def db_connect():
    """Open the SQLite DB and ensure the schema exists."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS seen (
            vin                TEXT PRIMARY KEY,
            first_seen_timestamp TEXT NOT NULL,
            price              REAL,
            url                TEXT
        )
        """
    )
    conn.commit()
    return conn


def db_known_vins(conn):
    """Return the set of VINs we've already alerted on."""
    rows = conn.execute("SELECT vin FROM seen").fetchall()
    return {r[0] for r in rows}


def db_mark_seen(conn, listings):
    """Insert listings (after a successful email) so we don't re-alert."""
    now = datetime.now(timezone.utc).isoformat()
    for lst in listings:
        conn.execute(
            "INSERT OR IGNORE INTO seen (vin, first_seen_timestamp, price, url) "
            "VALUES (?, ?, ?, ?)",
            (lst["vin"], now, lst["price"], lst["url"]),
        )
    conn.commit()


def db_reset():
    """Delete the dedupe DB entirely (used by --reset)."""
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
        log.info("Dedupe DB removed: %s", DB_PATH)
    else:
        log.info("Dedupe DB did not exist; nothing to reset: %s", DB_PATH)


# ---------------------------------------------------------------------------
# MARKETCHECK QUERY + PARSING
# ---------------------------------------------------------------------------

def build_params(api_key, trim):
    """
    Build the MarketCheck query params for a single trim.

    The parameter names follow MarketCheck's documented active-listings
    pattern. If their schema differs from what we expect, the request building
    stays defensive (we log the raw response on a non-200) so it's easy to
    adjust the names here without touching the rest of the code.
    """
    params = {
        "api_key": api_key,
        "make": MAKE,
        "model": MODEL,
        "trim": trim,
        "year_min": YEAR_MIN,
        "miles_max": MILES_MAX,
        "price_max": PRICE_MAX,
        "zip": ZIP_CODE,
        "radius": RADIUS_MILES,
        "rows": ROWS,
        "start": 0,
    }
    # Color filter is optional so STRICT_COLOR=False can widen the search.
    if STRICT_COLOR:
        params["exterior_color"] = EXTERIOR_COLOR
    return params


def fetch_listings(api_key, trim, session=None):
    """
    Query MarketCheck for one trim and return the raw `listings` list.

    Returns [] on any non-200 or unexpected payload (and logs the detail),
    so a single bad trim never aborts the whole run.
    """
    url = MARKETCHECK_BASE_URL + MARKETCHECK_ENDPOINT
    params = build_params(api_key, trim)
    http = session or requests

    # Log the request without leaking the API key.
    safe_params = {k: v for k, v in params.items() if k != "api_key"}
    log.info("Querying MarketCheck trim=%s params=%s", trim, safe_params)

    resp = http.get(url, params=params, timeout=HTTP_TIMEOUT)

    if resp.status_code != 200:
        # Log the raw response body so a schema/param mismatch is debuggable.
        log.error(
            "MarketCheck returned HTTP %s for trim=%s. Raw response: %s",
            resp.status_code, trim, resp.text[:2000],
        )
        return []

    try:
        data = resp.json()
    except ValueError:
        log.error("MarketCheck response was not valid JSON for trim=%s: %s",
                  trim, resp.text[:2000])
        return []

    listings = data.get("listings")
    if not isinstance(listings, list):
        log.warning("No 'listings' array in response for trim=%s. Keys: %s",
                    trim, list(data.keys()))
        return []

    log.info("trim=%s returned %d raw listing(s)", trim, len(listings))
    return listings


def _extract_text_for_dap(raw):
    """
    Gather every text blob from a raw listing that might mention the option
    package: description, options, and high-value/installed features. APIs are
    inconsistent about where this lives, so we cast a wide net.
    """
    parts = []

    # Free-text description (sometimes nested under media/extra).
    for key in ("description", "extra", "dealer_comments"):
        val = raw.get(key)
        if isinstance(val, str):
            parts.append(val)

    # Options / features can be a list of strings or a list of dicts.
    for key in ("options", "high_value_features", "installed_options",
                "features"):
        val = raw.get(key)
        if isinstance(val, str):
            parts.append(val)
        elif isinstance(val, list):
            for item in val:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    # Common shapes: {"name": ...} or {"description": ...}
                    for sub in ("name", "description", "label", "value"):
                        if isinstance(item.get(sub), str):
                            parts.append(item[sub])

    return " \n ".join(parts)


def detect_dap(raw):
    """Return 'confirmed' if any DAP keyword appears in the text, else 'verify'."""
    text = _extract_text_for_dap(raw).lower()
    for kw in DAP_KEYWORDS:
        if kw.lower() in text:
            return "confirmed"
    return "verify"


def normalize_listing(raw):
    """
    Convert a raw MarketCheck listing into the flat dict the rest of the
    program uses. Returns None if there's no VIN (can't dedupe without one).

    MarketCheck nests vehicle attributes under "build" and dealer/seller info
    under "dealer". We pull defensively with .get() so missing fields become
    sane defaults rather than KeyErrors.
    """
    vin = raw.get("vin")
    if not vin:
        return None

    build = raw.get("build") or {}
    dealer = raw.get("dealer") or {}

    return {
        "vin": vin,
        "year": build.get("year") or raw.get("year"),
        "make": build.get("make") or raw.get("make") or MAKE,
        "model": build.get("model") or raw.get("model") or MODEL,
        "trim": build.get("trim") or raw.get("trim"),
        "exterior_color": raw.get("exterior_color") or build.get("exterior_color"),
        "miles": raw.get("miles"),
        "price": raw.get("price"),
        "dealer_name": dealer.get("name"),
        "dealer_city": dealer.get("city"),
        "dealer_state": dealer.get("state"),
        "url": raw.get("vdp_url") or raw.get("url"),
        "dap_status": detect_dap(raw),
    }


# ---------------------------------------------------------------------------
# EMAIL (SendGrid)
# ---------------------------------------------------------------------------

def _fmt_price(price):
    try:
        return "${:,.0f}".format(float(price))
    except (TypeError, ValueError):
        return "N/A"


def _fmt_miles(miles):
    try:
        return "{:,.0f} mi".format(float(miles))
    except (TypeError, ValueError):
        return "N/A"


def render_email_html(matches):
    """
    Render the HTML body. Confirmed-DAP cars are listed first and visually
    distinguished from the 'verify' cars.
    """
    # Sort: confirmed before verify, then cheapest first within each group.
    order = {"confirmed": 0, "verify": 1}
    matches = sorted(
        matches,
        key=lambda m: (order.get(m["dap_status"], 2),
                       m["price"] if m["price"] is not None else float("inf")),
    )

    def card(m):
        confirmed = m["dap_status"] == "confirmed"
        border = "#1a7f37" if confirmed else "#9a6700"
        badge_bg = "#1a7f37" if confirmed else "#9a6700"
        badge_text = ("✅ DAP CONFIRMED" if confirmed
                      else "⚠️ DAP — VERIFY MANUALLY")

        # html.escape every piece of listing-supplied text.
        def e(v):
            return html.escape(str(v)) if v is not None else "N/A"

        dealer_line = " — ".join(
            p for p in (
                e(m["dealer_name"]) if m["dealer_name"] else None,
                ", ".join(p for p in (m["dealer_city"], m["dealer_state"]) if p)
                if (m["dealer_city"] or m["dealer_state"]) else None,
            ) if p
        ) or "Dealer N/A"

        url = m["url"]
        link = (
            '<a href="{u}" style="color:#0969da;">View listing &raquo;</a>'.format(
                u=html.escape(url))
            if url else "<em>No listing URL</em>"
        )

        return """
        <div style="border-left:6px solid {border};background:#f6f8fa;
                    padding:12px 16px;margin:0 0 14px 0;border-radius:6px;
                    font-family:Arial,Helvetica,sans-serif;">
          <div style="display:inline-block;background:{badge_bg};color:#fff;
                      font-size:12px;font-weight:bold;padding:2px 8px;
                      border-radius:10px;margin-bottom:8px;">{badge}</div>
          <div style="font-size:18px;font-weight:bold;color:#24292f;">
            {year} {make} {model} {trim}
          </div>
          <table style="font-size:14px;color:#24292f;margin-top:6px;
                        border-collapse:collapse;">
            <tr><td style="padding:1px 14px 1px 0;color:#57606a;">Exterior</td>
                <td>{color}</td></tr>
            <tr><td style="padding:1px 14px 1px 0;color:#57606a;">Mileage</td>
                <td>{miles}</td></tr>
            <tr><td style="padding:1px 14px 1px 0;color:#57606a;">Price</td>
                <td><b>{price}</b></td></tr>
            <tr><td style="padding:1px 14px 1px 0;color:#57606a;">Dealer</td>
                <td>{dealer}</td></tr>
            <tr><td style="padding:1px 14px 1px 0;color:#57606a;">VIN</td>
                <td>{vin}</td></tr>
          </table>
          <div style="margin-top:8px;">{link}</div>
        </div>
        """.format(
            border=border, badge_bg=badge_bg, badge=badge_text,
            year=e(m["year"]), make=e(m["make"]), model=e(m["model"]),
            trim=e(m["trim"]), color=e(m["exterior_color"]),
            miles=_fmt_miles(m["miles"]), price=_fmt_price(m["price"]),
            dealer=dealer_line, vin=e(m["vin"]), link=link,
        )

    cards = "".join(card(m) for m in matches)
    return """
    <html><body style="background:#ffffff;padding:8px;">
      <h2 style="font-family:Arial,Helvetica,sans-serif;color:#24292f;">
        {n} new BMW {model} match(es) near {zip}
      </h2>
      <p style="font-family:Arial,Helvetica,sans-serif;color:#57606a;
                font-size:13px;">
        Confirmed option-package matches are listed first.
      </p>
      {cards}
      <p style="font-family:Arial,Helvetica,sans-serif;color:#8b949e;
                font-size:12px;">Sent by car_watch.py</p>
    </body></html>
    """.format(n=len(matches), model=MODEL, zip=ZIP_CODE, cards=cards)


def send_email(api_key, matches):
    """
    Send the alert via SendGrid. Raises on failure so the caller knows NOT to
    mark the listings as seen.
    """
    n = len(matches)
    subject = "🚗 {n} new BMW {model} match(es) near {zip}".format(
        n=n, model=MODEL, zip=ZIP_CODE)
    body_html = render_email_html(matches)

    payload = {
        # One "to" entry per recipient; all addresses get the same email.
        "personalizations": [
            {"to": [{"email": addr} for addr in TO_EMAILS]}
        ],
        "from": {"email": FROM_EMAIL},
        "subject": subject,
        "content": [{"type": "text/html", "value": body_html}],
    }
    headers = {
        "Authorization": "Bearer {}".format(api_key),
        "Content-Type": "application/json",
    }

    resp = requests.post(SENDGRID_API_URL, headers=headers,
                         data=json.dumps(payload), timeout=HTTP_TIMEOUT)
    # SendGrid returns 202 Accepted on success.
    if resp.status_code not in (200, 201, 202):
        raise RuntimeError(
            "SendGrid HTTP {}: {}".format(resp.status_code, resp.text[:1000]))
    log.info("Email sent to %s (subject=%r)", ", ".join(TO_EMAILS), subject)


# ---------------------------------------------------------------------------
# DRY-RUN OUTPUT
# ---------------------------------------------------------------------------

def print_matches(matches):
    """Pretty-print matches to stdout for --dry-run."""
    order = {"confirmed": 0, "verify": 1}
    matches = sorted(
        matches,
        key=lambda m: (order.get(m["dap_status"], 2),
                       m["price"] if m["price"] is not None else float("inf")),
    )
    print("\n=== {} new match(es) ===".format(len(matches)))
    for m in matches:
        flag = "[DAP CONFIRMED]" if m["dap_status"] == "confirmed" else "[VERIFY DAP]"
        print("\n{flag} {year} {make} {model} {trim}".format(
            flag=flag, year=m["year"], make=m["make"], model=m["model"],
            trim=m["trim"]))
        print("  Color : {}".format(m["exterior_color"]))
        print("  Miles : {}".format(_fmt_miles(m["miles"])))
        print("  Price : {}".format(_fmt_price(m["price"])))
        print("  Dealer: {} ({}, {})".format(
            m["dealer_name"], m["dealer_city"], m["dealer_state"]))
        print("  VIN   : {}".format(m["vin"]))
        print("  URL   : {}".format(m["url"]))


# ---------------------------------------------------------------------------
# CORE RUN
# ---------------------------------------------------------------------------

def gather_matches(api_key, session=None):
    """
    Query every trim, normalize, and merge into a single list of matches
    keyed by VIN (so the same car listed under two trims isn't duplicated).
    """
    by_vin = {}
    for trim in TRIMS:
        raw_listings = fetch_listings(api_key, trim, session=session)
        for raw in raw_listings:
            norm = normalize_listing(raw)
            if norm is None:
                continue
            # First occurrence wins; merge is by VIN.
            by_vin.setdefault(norm["vin"], norm)
    return list(by_vin.values())


def run(dry_run=False, session=None):
    """
    Execute a single check. Any unexpected error is caught, logged, and
    swallowed (we return 0) so cron never sees a failure.
    """
    log.info("=== car_watch run start (dry_run=%s, strict_color=%s) ===",
             dry_run, STRICT_COLOR)

    # API keys come from the environment only.
    marketcheck_key = os.environ.get("MARKETCHECK_API_KEY")
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")

    if not marketcheck_key:
        log.error("MARKETCHECK_API_KEY not set; cannot query listings. Exiting.")
        return 0
    if not dry_run and not sendgrid_key:
        log.error("SENDGRID_API_KEY not set; cannot send email. Exiting.")
        return 0

    conn = None
    try:
        # 1 + 2. Query all trims and detect DAP.
        matches = gather_matches(marketcheck_key, session=session)
        log.info("Total unique listings across trims: %d", len(matches))

        # 3. Dedupe against the DB.
        conn = db_connect()
        known = db_known_vins(conn)
        new_matches = [m for m in matches if m["vin"] not in known]
        log.info("New (unseen) matches: %d", len(new_matches))

        if not new_matches:
            log.info("Nothing new to report. Done.")
            return 0

        if dry_run:
            # Don't email and don't write to the DB in dry-run.
            print_matches(new_matches)
            log.info("Dry-run: %d match(es) printed, DB not modified.",
                     len(new_matches))
            return 0

        # 4. Email ONLY the new matches.
        send_email(sendgrid_key, new_matches)

        # 5. Mark as seen ONLY after a successful send.
        db_mark_seen(conn, new_matches)
        log.info("Emailed and recorded %d new match(es).", len(new_matches))
        return 0

    except requests.RequestException as exc:
        log.error("Network/API error during run: %s", exc, exc_info=True)
        return 0
    except sqlite3.Error as exc:
        log.error("Database error during run: %s", exc, exc_info=True)
        return 0
    except Exception as exc:  # noqa: BLE001 - cron must never see a crash
        log.error("Unexpected error during run: %s", exc, exc_info=True)
        return 0
    finally:
        if conn is not None:
            conn.close()
        log.info("=== car_watch run end ===")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Monitor BMW iX listings and email new matches.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Do everything except send email; print matches "
                             "to stdout and do not write to the dedupe DB.")
    parser.add_argument("--reset", action="store_true",
                        help="Clear seen.db and exit.")
    parser.add_argument("--once", action="store_true",
                        help="Run a single check (this is the default; the "
                             "script is cron-driven, not a long-running loop).")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    if args.reset:
        db_reset()
        return 0

    # --once is the default behavior; the flag exists for explicitness.
    return run(dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
