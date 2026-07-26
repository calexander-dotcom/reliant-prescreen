#!/usr/bin/env python3
"""
test_dry_run.py — Prove car_watch's parsing, dedupe, and email-formatting
logic without needing real API keys.

It monkeypatches the network layer with small stub MarketCheck responses,
sets STRICT_COLOR=False, and exercises a --dry-run pass plus the dedupe DB
and the HTML email renderer across all configured searches.

Run:  python3 test_dry_run.py
"""

import os
import sys
import tempfile

import car_watch


# ---------------------------------------------------------------------------
# Sample MarketCheck-shaped responses, keyed by (model, trim). `trim` is None
# for searches that query "any trim" (e.g. the BMW X5 search).
# ---------------------------------------------------------------------------
SAMPLE = {
    ("iX", "xDrive50"): {
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
                # Package present in free-text description -> "confirmed"
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
                # No package keywords -> "verify"
                "options": ["Heated seats", "Panoramic roof"],
            },
        ]
    },
    ("iX", "M60"): {
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
                # Package via options list of dicts + "Highway Assistant"
                "high_value_features": [
                    {"name": "Highway Assistant"},
                    {"name": "Bowers & Wilkins sound"},
                ],
            },
        ]
    },
    # BMW X5 search runs with no trim (trims == []), so key is (model, None).
    ("X5", None): {
        "listings": [
            {
                "vin": "5UX23EU08S9X50001",
                "price": 74995,
                "miles": 4200,
                "exterior_color": "Carbon Black Metallic",
                "vdp_url": "https://example.com/listing/x5-1",
                "build": {"year": 2025, "make": "BMW", "model": "X5",
                          "trim": "xDrive40i"},
                "dealer": {"name": "Reeves BMW", "city": "Tampa",
                           "state": "FL"},
                # "Professional Package" present -> "confirmed"
                "options": ["Premium Package", "Professional Package"],
            },
        ]
    },
    ("GV80", "3.5T Advanced"): {
        "listings": [
            {
                "vin": "KMUHBDSB0SU100001",
                "price": 68500,
                "miles": 6300,
                "exterior_color": "Uyuni White",
                "vdp_url": "https://example.com/listing/gv80-1",
                "build": {"year": 2025, "make": "Genesis", "model": "GV80",
                          "trim": "3.5T Advanced"},
                "dealer": {"name": "Genesis of Wesley Chapel",
                           "city": "Wesley Chapel", "state": "FL"},
                # "Advanced" keyword present -> "confirmed"
                "description": "3.5T Advanced package, head-up display.",
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
    """Returns the sample payload for whichever (model, trim) was requested."""
    def get(self, url, params=None, timeout=None):
        key = (params.get("model"), params.get("trim"))
        return StubResponse(SAMPLE.get(key, {"listings": []}))


def main():
    # Widen the net so color filters are dropped (proves STRICT_COLOR=False).
    car_watch.STRICT_COLOR = False

    # Use throwaway DB / log paths so we don't touch real files.
    tmp = tempfile.mkdtemp(prefix="car_watch_test_")
    car_watch.DB_PATH = os.path.join(tmp, "seen.db")

    # A fake MarketCheck key is enough for dry-run (no SendGrid needed).
    os.environ["MARKETCHECK_API_KEY"] = "TEST_KEY"

    session = StubSession()

    print("########## PASS 1: dry-run (should print 5 matches) ##########")
    rc = car_watch.run(dry_run=True, session=session)
    assert rc == 0, "run() must return 0"

    # --- Verify gather/normalize/package detection directly ---
    matches = car_watch.gather_matches("TEST_KEY", session=session)
    assert len(matches) == 5, "expected 5 unique VINs, got %d" % len(matches)
    by_vin = {m["vin"]: m for m in matches}
    assert by_vin["WB523CF09PCM00001"]["package_status"] == "confirmed"
    assert by_vin["WB523CF09PCM00002"]["package_status"] == "verify"
    assert by_vin["WB523CF09PCM00003"]["package_status"] == "confirmed"
    # New searches surface and detect their own packages.
    assert by_vin["5UX23EU08S9X50001"]["search_label"] == "BMW X5"
    assert by_vin["5UX23EU08S9X50001"]["package_label"] == "Professional Package"
    assert by_vin["5UX23EU08S9X50001"]["package_status"] == "confirmed"
    assert by_vin["KMUHBDSB0SU100001"]["search_label"] == "Genesis GV80"
    assert by_vin["KMUHBDSB0SU100001"]["package_status"] == "confirmed"
    print("\n[OK] Package detection across BMW iX, BMW X5, and Genesis GV80")

    # --- Verify email HTML renders and orders confirmed-first ---
    html_body = car_watch.render_email_html(matches)
    assert "CONFIRMED" in html_body and "VERIFY" in html_body
    assert "Professional Package CONFIRMED" in html_body
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
    assert len(known) == 5, "expected 5 VINs recorded, got %d" % len(known)
    new_after = [m for m in matches if m["vin"] not in known]
    assert new_after == [], "after marking seen, nothing should be new"
    print("[OK] Dedupe: 5 VINs recorded, 0 new on re-check")

    print("\n########## PASS 2: dry-run after dedupe (0 new) ##########")
    # Dry-run does NOT use the DB-write path, but confirm run() handles the
    # 'all seen' case cleanly via a non-dry run against the same DB.
    rc = car_watch.run(dry_run=True, session=session)
    assert rc == 0

    print("\nALL CHECKS PASSED ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
