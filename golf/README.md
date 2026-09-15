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

### One downs (the house game)

A new bet opens whenever somebody falls behind in the newest bet, so live bets
stack up as the round goes on. The standing is written as one margin per open
bet, oldest first, signed from side A:

```
after 1   1-0              A won the 1st; a new bet opened for the 2nd
after 2   2-1-0
after 3   2-1-0-0          the 3rd halved, so B pressed by hand
after 4   3-2-1-1-0        five bets live
after 5   2-1-0-0-(-1)-0   B won the 5th; B leads the bet that opened on it
```

The rules, precisely:

- After each hole, look at the **newest** bet. If either side is down in it, a
  fresh bet opens covering the next hole to the end of that nine.
- A hole that leaves the newest bet all square opens nothing. That is the
  moment somebody **presses by hand** instead — and several presses can be
  called on one hole, each opening its own bet over the same holes.
- Each bet pays its stake to **whoever leads it right now**. Ahead by one pays
  the same as ahead by five; a square bet pays nothing. So
  `2-1-0-0-(-1)-0` at $10 a bet is two bets to A and one to B: **A up $10**.
- The stack **ends at the turn** and a new one starts on the 10th.
- Alongside the two nines runs a single bet over **all 18 at 2×** the stake,
  which never presses.

A parenthesised number means the other side leads that bet — `(-1)` is side B
one up — both because that is the convention and because `0--1` is unreadable.

### Banker

One player holds the deal and plays a **separate bet against every other
player**, so a good hole collects from everybody and a bad one pays everybody.

The deal then passes to **whoever won the most money on the hole**. Since the
banker is in every bet, a banker who is winning tends to keep it. A hole where
nobody won anything leaves the deal where it is, and it can always be handed
over by hand for one hole.

Money comes from one of two places:

- **What you type** (default) — you enter what each player won or lost and this
  game only tracks who holds the deal. No scores needed at all. A banker hole
  usually carries side action that no stroke comparison can know about, and
  it is one number per player instead of four scores.
- **The scores** — the app compares the banker's score against each opponent's
  and pays the stake each way. Any opponent can double their own bet for the
  hole, and the banker can double back against that one player, so somebody can
  be on for 4x while the rest are flat.

In the money-typed mode this bet reports no money of its own, because the hole
ledger already counts it — otherwise everybody would be paid twice.

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

## Letting others follow along

A round can be published to a **view-only link**. Anyone you send it to sees the
scorecard, the bets and the settlement, updating a few seconds behind you. None
of them can change anything.

That is enforced by how it is built, not by hiding buttons:

- The link carries only a random 128-bit share id.
- Publishing an update requires a **write token** that never leaves the scoring
  device. `publishableRound` strips it from the payload before anything is sent,
  which is asserted in a test — publishing the round as-is would hand that
  token to everybody who opened the link.
- Only a SHA-256 of the token is stored, compared in constant time, so reading
  the store does not let anyone publish either.
- The viewer page issues nothing but `GET`.

Updates are debounced a few seconds rather than sent per keystroke, since
entering a hole is several edits in a row. The shared copy is deleted a week
after the last update, and each publish pushes that out again, so it lives a
week past the final hole rather than a week past the first.

### Setting it up

Sharing needs a Redis-style store. Create one in Vercel's **Storage** tab and
redeploy — the integration injects its own credentials and nothing else is
needed. Either naming works:

```
KV_REST_API_URL / KV_REST_API_TOKEN            # Vercel KV
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   # Upstash directly
```

With neither set, the rest of the app is unaffected and the share button
reports that sharing is not configured. The store is spoken to over the Upstash
REST protocol directly, so there is no client library to install.

**What leaves the device.** Only a shared round is copied to that store:
player names, handicap indexes, scores and money. Everything else stays in the
browser. Treat the link as the password — anyone holding it can watch.

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

> **GHIN has no public API.** This talks to the same endpoints ghin.com itself
> calls. They can change without warning. Everything in the app works without
> them — add players and a course by hand and you lose nothing but typing.

**No password required.** These endpoints are served from a GHIN number alone,
with no `Authorization` header and no cookie. That is GHIN's design, not a
choice made here, and it has two consequences worth knowing: this app never
asks for or handles a GHIN password, and anyone who knows your GHIN number can
read the same data.

The endpoints and response shapes below were confirmed against a capture of
ghin.com's own network traffic:

| What | Endpoint | Response |
|---|---|---|
| Golfers you follow | `GET /followed_golfers/{golferId}.json` | `{golfers: [{id, first_name, last_name, handicap_index_display, low_hi_display, club_name, …}]}` |
| Your pinned courses | `GET /golfers/{golferId}/my_courses.json` | `{golfer_course_preference: [{course_id, course_name, tee_id, facility_name, …}]}` |
| Recently played | `GET /golfers/{golferId}/golfer_most_recent_courses.json` | `{courses: [{CourseId, CourseName, CourseCity, Ratings: [...]}]}` |
| Course detail | `GET /crsCourseMethods.asmx/GetCourseDetails.json?courseId=…` | `{CourseName, CourseCity, TeeSets: [{TeeSetRatingName, Gender, TotalPar, TotalYardage, Ratings: [{RatingType, CourseRating, SlopeRating}], Holes: [{Number, Par, Length, Allocation}]}]}` |

All take `source=GHINcom`. `Allocation` on a hole is its stroke index, and the
18-hole course/slope ratings are the `Ratings` entry whose `RatingType` is
`"Total"` — not the first entry in the array.

Two gotchas that cost real debugging:

- The handicap index lives in **`handicap_index_display`**, not
  `handicap_index`. And `+1.4` means numerically **−1.4** — a plus handicap
  gives strokes back, so reading the sign literally flips strokes for the best
  player in the group.
- The feature is called **following** in the GHIN app, not "favorites", and the
  endpoints use that vocabulary.

Parsing in `src/lib/ghin/normalize.ts` stays tolerant of key and casing
variants anyway, so a renamed field degrades one value instead of breaking the
import.

### When a lookup returns nothing

Every lookup records what each endpoint returned — status, and the **key
names** of the body, never the values — and the UI shows that log behind a
"What GHIN returned" button with a copy action. It distinguishes the three
causes that otherwise look identical:

- every path 404'd → the endpoint moved
- the call was refused → network or permissions, not an empty list
- a path answered but `parsed 0 records` → field names changed, fix the key
  lists in `normalize.ts`

Being keys-only it is safe to paste into a bug report. For the full body,
`GHIN_ALLOW_RAW=1` enables `/api/ghin/raw?path=…`; keep it off in anything
deployed publicly.

### Sign-in

`POST /golfer_login.json` works and is still wired up at `/api/ghin/login` (it
needs a non-empty `token` field in the body alongside the credentials), but
nothing in the app calls it, because nothing needs it. It is there for the day
GHIN starts requiring auth on the read endpoints.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm test             # 202 unit tests over the betting math, GHIN parsing and sharing
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
    onedown.ts      the stacking one-down game
    banker.ts       banker, and who holds the deal
    skins.ts        carryover, validation
    settle.ts       net positions -> fewest payments
    index.ts        ties it all together (computeRound)
  ghin/
    client.ts       server-side GHIN calls
    normalize.ts    tolerant response mapping
  share/
    store.ts        shared-round storage and write tokens
    payload.ts      what a follower is allowed to see
src/components/     UI
src/app/            pages + /api/ghin routes
```

All money is stored as **integer cents**. Betting math negates and sums
constantly, and `0.1 + 0.2 !== 0.3` would let a "balanced" hole drift by a
fraction of a cent.

---

## Not built

- No cloud sync. Rounds are per-device — they do not follow you to another
  phone, and a private window starts empty. Sharing publishes a read-only copy;
  it does not let a second device score.
- No live scoring between players' phones. One person keeps the card.
- Wolf, bingo-bango-bongo and other rotation games are not modelled as
  automatic bets; the manual ledger covers them.
- No posting scores back to GHIN.
