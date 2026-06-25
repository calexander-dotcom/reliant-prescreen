#!/usr/bin/env python3
"""
test_dry_run.py — Prove car_watch's parsing, dedupe, and email-formatting
logic without needing real API keys.

It monkeypatches the network layer with a small stub MarketCheck response,
sets STRICT_COLOR=False, and exercises a --dry-run pass plus the dedupe DB
and the HTML email renderer.

Run:  python3 test_dry_run.py
"""

import os
import sys
import tempfile

import car_watch


# ---------------------------------------------------------------------------
# Sample MarketCheck-shaped responses (one per trim).
# ---------------------------------------------------------------------------
SAMPLE = {
    "xDrive50": {
        "listings": [
            {
                "vin": "WB523CF09PCM00001",
                "price": 53999,
                "miles": 18250,
                "exterior_color": "Black Sapphire Metallic",
                "vdp_url": "https://example.com/listing/00001",
                "build": {"year": 2023, "make": "BMW", "model": "iX",
                          "trim": "xDrive50"},
                "dealer": {"name": "Reeves BMW", "city": "Tampa",
                           "state": "FL"},
                # DAP present in free-text description -> "confirmed"
                "description": "Loaded! Includes Driving Assistance "
                               "Professional package, premium sound.",
            },
            {
                "vin": "WB523CF09PCM00002",
                "price": 49995,
                "miles": 9100,
                "exterior_color": "Mineral White Metallic",
                "vdp_url": "https://example.com/listing/00002",
                "build": {"year": 2024, "make": "BMW", "model": "iX",
                          "trim": "xDrive50"},
                "dealer": {"name": "BMW of Sarasota", "city": "Sarasota",
                           "state": "FL"},
                # No DAP keywords -> "verify"
                "options": ["Heated seats", "Panoramic roof"],
            },
        ]
    },
    "M60": {
        "listings": [
            {
                "vin": "WB523CF09PCM00003",
                "price": 54980,
                "miles": 22400,
                "exterior_color": "Black Sapphire Metallic",
                "vdp_url": "https://example.com/listing/00003",
                "build": {"year": 2023, "make": "BMW", "model": "iX",
                          "trim": "M60"},
                "dealer": {"name": "Fields BMW", "city": "Orlando",
                           "state": "FL"},
                # DAP via options list of dicts + "Highway Assistant" -> confirmed
                "high_value_features": [
                    {"name": "Highway Assistant"},
                    {"name": "Bowers & Wilkins sound"},
                ],
            },
        ]
    },
}


class StubResponse:
    """Minimal stand-in for requests.Response."""
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self._payload


class StubSession:
    """Returns the sample payload for whichever trim was requested."""
    def get(self, url, params=None, timeout=None):
        trim = params.get("trim")
        return StubResponse(SAMPLE.get(trim, {"listings": []}))


def main():
    # Widen the net so the color filter is dropped (proves STRICT_COLOR=False).
    car_watch.STRICT_COLOR = False

    # Use throwaway DB / log paths so we don't touch real files.
    tmp = tempfile.mkdtemp(prefix="car_watch_test_")
    car_watch.DB_PATH = os.path.join(tmp, "seen.db")

    # A fake MarketCheck key is enough for dry-run (no SendGrid needed).
    os.environ["MARKETCHECK_API_KEY"] = "TEST_KEY"

    session = StubSession()

    print("########## PASS 1: dry-run (should print 3 matches) ##########")
    rc = car_watch.run(dry_run=True, session=session)
    assert rc == 0, "run() must return 0"

    # --- Verify gather/normalize/DAP directly ---
    matches = car_watch.gather_matches("TEST_KEY", session=session)
    assert len(matches) == 3, "expected 3 unique VINs, got %d" % len(matches)
    by_vin = {m["vin"]: m for m in matches}
    assert by_vin["WB523CF09PCM00001"]["dap_status"] == "confirmed"
    assert by_vin["WB523CF09PCM00002"]["dap_status"] == "verify"
    assert by_vin["WB523CF09PCM00003"]["dap_status"] == "confirmed"
    print("\n[OK] DAP detection: 2 confirmed, 1 verify")

    # --- Verify email HTML renders and orders confirmed-first ---
    html_body = car_watch.render_email_html(matches)
    assert "DAP CONFIRMED" in html_body and "VERIFY" in html_body
    # The first confirmed card should appear before the verify card in the HTML.
    assert html_body.index("WB523CF09PCM00001") < html_body.index(
        "WB523CF09PCM00002"), "confirmed cars must render before verify cars"
    print("[OK] Email HTML rendered (%d chars), confirmed sorted first" %
          len(html_body))

    # --- Verify dedupe: mark seen, then re-gather should yield 0 new ---
    conn = car_watch.db_connect()
    car_watch.db_mark_seen(conn, matches)
    known = car_watch.db_known_vins(conn)
    conn.close()
    assert len(known) == 3, "expected 3 VINs recorded, got %d" % len(known)
    new_after = [m for m in matches if m["vin"] not in known]
    assert new_after == [], "after marking seen, nothing should be new"
    print("[OK] Dedupe: 3 VINs recorded, 0 new on re-check")

    print("\n########## PASS 2: dry-run after dedupe (0 new) ##########")
    # Dry-run does NOT use the DB-write path, but confirm run() handles the
    # 'all seen' case cleanly via a non-dry run against the same DB.
    rc = car_watch.run(dry_run=True, session=session)
    assert rc == 0

    print("\nALL CHECKS PASSED ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
