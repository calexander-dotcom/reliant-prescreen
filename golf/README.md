# Golf Bets

A phone-first web app for tracking a round **and the money**: hole-by-hole
gambling that has to net to zero, nassau with automatic presses, and skins.
Players and courses can be imported from GHIN.

Everything lives in the browser. No account, no server-side database.

---

## The money model

The rule the whole app is built around: **every hole is a closed system.**
Whatever one player wins came out of the other players' pockets, so the signed
amounts for a hole must add to zero.

```
Chris  +20.00
Dale   +30.00
Pat    -40.00
Sam    -10.00
        ─────
          0.00   ✓ settled
```

Type those four numbers and the hole is settled. Type `-20.00` for Sam instead
and the app says **"Off by $10.00"** and keeps the hole out of the totals until
it balances — so nothing ever gets paid out that nobody put in. One tap on a
player's name dumps the remainder onto them.

### Banker holes

Name a banker for the hole and you only enter everyone *else's* result. The
banker is on the other side of every bet, so their number is re-derived on each
keystroke and the hole can never go out of balance:

| | enter | banker becomes |
|---|---|---|
| Dale loses 5 | `-5` | `+5` |
| Pat loses 5 | `-5` | `+10` |
| Sam wins 3 | `+3` | `+7` |

The sign lives on the **+ / −** button next to each amount, not in the number
you type. The iOS decimal keypad has no minus key, and half of every entry here
is money lost.

### Settling up

The Settle tab turns everyone's net position into the fewest payments that
clear it (at most one less than the number of players), and gives you a plain
text summary to paste into the group chat.

---

## Automatic bets

### Nassau, with presses

Front nine, back nine and total eighteen, each playing for the same stake,
decided by match play on net or gross.

**Presses** are the "1 down" part. Fall one hole behind and a brand new bet
opens automatically over the remaining holes of that segment, while the
original bet keeps running. A press can itself be pressed.

> **Heads up on the term.** "One down" is read two ways in different groups.
> This implements the common one — *automatic press when a side goes one hole
> down* — and makes the trigger configurable (off / 1 down / 2 down) plus a cap
> on how many presses a segment can spawn. One-down presses multiply fast: nine
> straight losses with no cap is nine live bets. Default cap is 4. If your group
> plays "one down" to mean something else, the manual hole ledger handles it
> with no rules at all.

A match closes out as soon as the lead is bigger than the holes left to play,
and a tied segment is a push — nobody pays.

### Skins

Low score on the hole takes it. Ties carry the value to the next hole, so a
skin can be worth several holes at once. Optional "validated" mode requires a
birdie or better to claim.

A hole only settles once **every** player in the game has posted a score, so a
round in progress never charges anyone for a hole they have not played. If a
player picks up, enter their max score rather than leaving the cell blank.

---

## Handicaps

Course Handicap uses the WHS formula:

```
Index × (Slope ÷ 113) + (Course Rating − Par)
```

Three modes for how that becomes strokes on the card:

- **Strokes off the low** (default) — the low course handicap plays scratch and
  everyone else gets the difference. How nearly every casual money game is
  actually played.
- **Full handicap** — everyone plays their own.
- **Gross only** — no strokes.

Strokes land on the hardest holes first by stroke index, doubling up past 18. A
plus handicap gives strokes back on the easiest holes. Plus handicaps read
correctly from GHIN, where `+1.2` means numerically **−1.2**.

---

## GHIN import

> **GHIN has no public API.** This talks to the same private endpoints the GHIN
> mobile app uses. It can break without warning, and **it has not been verified
> against a live account** — the sandbox this was built in blocks
> `api2.ghin.com`. Everything in the app works without it: add players and a
> course by hand and you lose nothing but typing.

What it imports:

- **Favorite golfers** → names, GHIN numbers and handicap indexes, straight
  into the round.
- **Courses** → favorites and name search, then tees, course/slope ratings and
  hole-by-hole par and stroke index.

How it is wired:

- Your password goes to **this app's own route handler**, which calls GHIN
  server-side. GHIN sends no CORS headers for browser origins, and a password
  should not be posted to a third party from the page.
- The password is used once, for a token, and is never stored or logged. The
  token lives in `sessionStorage` and is gone when the tab closes.
- The login body carries a `token` field separate from the session token GHIN
  returns. It is a presence check, not a value check, so the default
  (`"nonblank"`) satisfies it; set `GHIN_CLIENT_TOKEN` if that ever changes.
  Omitting it returns `400 {"errors":{"token":["can't be blank"]}}`.
- Response parsing in `src/lib/ghin/normalize.ts` is deliberately tolerant:
  every field is looked up through a list of plausible names and both
  `snake_case` and `PascalCase` shapes are handled, so one renamed key degrades
  a single field instead of breaking the import.

### When an import comes back empty

Set `GHIN_ALLOW_RAW=1` and hit the passthrough to see what GHIN actually
returned:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/ghin/raw?path=golfers/favorites.json'
```

Then fix the key lists in `src/lib/ghin/normalize.ts`. The tests in
`normalize.test.ts` show the shapes already covered. Keep the raw route off in
anything you deploy publicly — it is an open proxy into GHIN otherwise.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm test             # 102 unit tests over the betting math and GHIN parsing
npm run typecheck
npm run build && npm start
```

Deploying anywhere that runs Next.js (Vercel, Fly, a box with Node) gets you a
URL you can add to your phone's home screen.

### Offline

It is a PWA with a service worker, because phone signal at a golf course is
unreliable. The round is written to `localStorage` on every change, so once the
app has loaded, scoring and money work with no signal at all. GHIN is the only
part that needs connectivity, and only up front.

---

## Where things are

```
src/lib/
  money.ts          integer-cent parsing, formatting, splitting
  handicap.ts       course handicap + per-hole stroke allocation
  types.ts          domain model (all JSON-serializable)
  mutations.ts      pure round updates, incl. the banker rule
  storage.ts        localStorage / sessionStorage
  api.ts            browser -> this app's routes
  bets/
    ledger.ts       the zero-sum hole ledger
    nassau.ts       segments, presses, match status, payouts
    skins.ts        carryover, validation
    settle.ts       net positions -> fewest payments
    index.ts        ties it all together (computeRound)
  ghin/
    client.ts       server-side GHIN calls
    normalize.ts    tolerant response mapping
src/components/     UI
src/app/            pages + /api/ghin routes
```

All money is stored as **integer cents**. Betting math negates and sums
constantly, and `0.1 + 0.2 !== 0.3` would let a "balanced" hole drift by a
fraction of a cent.

---

## Not built

- No cloud sync or sharing. Rounds are per-device — they do not follow you to
  another phone, and a private window starts empty.
- No live scoring between players' phones. One person keeps the card.
- Wolf, bingo-bango-bongo and other rotation games are not modelled as
  automatic bets; the manual ledger covers them.
- No posting scores back to GHIN.
