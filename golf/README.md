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

**One game per round.** A group plays banker, or one downs, or a nassau — not
several at once — so the round has a single game picker rather than a list of
bets to add. Choosing a game replaces whatever was set, and the settings and
standings for games nobody is playing never appear.

Hand-entered money is always available regardless, on any hole, including with
no automatic game at all.

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
- The stake is **per player**: $10 a bet means every player on the side that
  is down loses $10 and every player on the side that is up wins $10, so a
  pair that is seven bets up is up $70 *each*. A lone player against two is
  in for double. "Per side" in the bet setup makes it one $10 that the side
  splits instead.
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
decided by match play on net or gross. The stake is per player, as in one
downs.

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
- The token is an HMAC of the share id under a server-side secret, checked in
  constant time. Nothing about it is stored, so reading the store does not let
  anyone publish, and — the reason it is derived rather than random — an
  evicted round can still be republished onto a link already handed out. A
  store on the free tier keeps nothing on disk, so rounds *can* evaporate
  mid-play; a publish writes unconditionally and puts it back, and the viewer
  page keeps polling through a 404 and picks the round back up by itself.
- The secret is `SHARE_TOKEN_SECRET` if set, otherwise the store credential,
  which exists exactly when sharing does. Rotating either invalidates
  outstanding write tokens: shares last a week and a fresh link is one tap.
- The viewer page issues nothing but `GET`.

Updates are debounced a few seconds rather than sent per keystroke, since
entering a hole is several edits in a row.

Followers poll rather than hold a connection, and the reads are the running
cost of sharing, so the polling is deliberately cheap: it starts at ten seconds
after a change, eases out to forty-five while nothing is happening, and stops
entirely while the tab is in the background. A flat ten-second poll would be
over a thousand reads per follower for one round, nearly all of them returning
the same card between holes. The cost of that is a change taking up to
forty-five seconds to appear after a quiet spell, which is nothing against a
twelve-minute hole. The shared copy is deleted a week
after the last update, and each publish pushes that out again, so it lives a
week past the final hole rather than a week past the first.

### Setting it up

Sharing needs a Redis-style store. Create one in Vercel's **Storage** tab,
connect it to the project, and redeploy — the integration injects its own
credentials and nothing else is needed. Vercel's marketplace has two kinds of
Redis and the app reads both:

```
KV_REST_API_URL / KV_REST_API_TOKEN                # Vercel KV        (REST)
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  # Upstash          (REST)
REDIS_URL                                          # Redis Cloud, or any redis:// (wire)
```

The REST pair is plain HTTPS. `REDIS_URL` is the real Redis protocol over
TCP, spoken by node-redis with **one connection per command** rather than a
cached client — a serverless function can be thawed with a dead socket under
it, and Redis Cloud's free tier allows thirty connections in total. REST wins
when an integration injects both. A `REDIS_URL` under a custom prefix
(`FOO_REDIS_URL`) is found too.

With none set, the rest of the app is unaffected and the share button reports
that sharing is not configured — naming any store-looking variables it *did*
find (names only, never values), so a screenshot of the message is enough to
see what an integration actually injected.

The free Redis Cloud tier is **RAM-only with no persistence**, which the
token design above is built for: a restart loses the rounds, and the next
edit on the scoring phone puts one back on the same link.

The wire path has a live test: `TEST_REDIS_URL=redis://:pw@127.0.0.1:6379
npm test` runs it against a real Redis; without the variable it is skipped.

**What leaves the device.** Only a shared round is copied to that store:
player names, handicap indexes, scores and money. Everything else stays in the
browser. Treat the link as the password — anyone holding it can watch.

## Folding sections away

The **Scores** card on the hole screen folds away, and stays folded — across
holes and across sessions, because collapsing the same section eighteen times
is not a feature. Folded, it still shows the hole's scores on one line, so it
is out of the way rather than out of sight.

Worth having because the two halves of the hole screen serve different games.
A group playing banker on money alone never touches the steppers; a group only
keeping score never touches the money grid.

The **Money this hole** card folds the same way, and which way it starts
depends on the game. Banker is typed in hole by hole, so it opens; one downs, a
nassau and skins are worked out from the scores, so under those it starts
folded and the hole screen is scores and standings. Each game remembers its own
choice. Folded, it shows the hole's money on one line — or how far off zero it
still is.

## Money by nine

**Running money** on the hole screen and the **Out** and **In** rows on the
card both carry each nine's money, with an **Overall** line for whatever belongs to
the round as a whole — the 18-hole one-down bet, a nassau's Total 18 and its
presses — and then the total. Hand-entered holes and the game are added
together, so under banker it is the ledger and under one downs it is the
stacks. Out, In and Overall always add up to the total, and the viewer page shows
the same split.

## Small things it remembers

- **Tees.** A course opens on the tee you played it from last. A course you have
  not played opens on the tee whose name matches the last one you used
  anywhere, so a new course still comes up on the blues if that is what the
  group plays. Failing both, the first tee listed.
- **You.** Your own name and index, so "Add me" is one tap and survives a
  reload without signing in again.
- **The regulars.** Anyone added to a round, by hand or from GHIN, comes back
  as a one-tap button next time.

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

**Signing in is required.** An earlier version of this app concluded otherwise:
the captured traffic showed no `Authorization` header and no cookies, so the
read endpoints looked open. That capture had been taken with Chrome's
*sanitized* HAR export, which strips exactly those headers. Without a token the
endpoints answer:

```
401  {"error":"Invalid token"}
```

So the flow needs two things: a **session token** from `golfer_login.json` to
authorise the call, and the golfer's own **GHIN number**, which is a path
segment in the endpoints below. The number normally comes out of the login
response; when it does not, the app asks for it and shows the key-only shape of
that response so the right field can be found.

The password is posted to this app's own route handler, exchanged once for a
token, and never stored or logged. The token lives in `sessionStorage` and is
gone when the tab closes.

The endpoints and response shapes below were confirmed against a capture of
ghin.com's own network traffic:

All of these need `Authorization: Bearer <token>`.

| What | Endpoint | Response |
|---|---|---|
| Golfers you follow | `GET /followed_golfers/{golferId}.json` | `{golfers: [{id, first_name, last_name, handicap_index_display, low_hi_display, club_name, …}]}` |
| Your pinned courses | `GET /golfers/{golferId}/my_courses.json` | `{golfer_course_preference: [{course_id, course_name, tee_id, facility_name, …}]}` |
| Recently played | `GET /golfers/{golferId}/golfer_most_recent_courses.json` | `{courses: [{CourseId, CourseName, CourseCity, Ratings: [...]}]}` |
| Your own record | `GET /golfers/{golferId}.json` (fallback, unverified) | a golfer object |
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

- **all 404** → the path is wrong or has moved. Some endpoints here are
  captured from real traffic and some are guesses; the message says which.
- **any 401** → the GHIN session has run out. Retrying cannot help, so the app
  offers to sign in again rather than repeating the call.
- **any 403** → something between the app and GHIN is refusing the connection.
- **a path answered but `parsed 0 records`** → the call worked and the field
  names did not match. Fix the key lists in `normalize.ts`.

Those need completely different fixes, which is why they are told apart rather
than all reported as "something went wrong".

Being keys-only it is safe to paste into a bug report. For the full body,
`GHIN_ALLOW_RAW=1` enables `/api/ghin/raw?path=…`; keep it off in anything
deployed publicly.

### Sign-in

`POST /golfer_login.json`, at `/api/ghin/login`. One quirk: the body needs a
non-empty `token` field of its own, alongside the credentials and separate from
the session token it returns. Omitting it returns
`400 {"errors":{"token":["can't be blank"]}}`. It is a presence check rather
than a value check, so the default satisfies it; `GHIN_CLIENT_TOKEN` overrides
it if that changes.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm test             # 207 unit tests over the betting math, GHIN parsing and sharing
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

### Updates

The worker on its own cannot keep the app current: `sw.js` does not change
between deploys, so checking it for updates finds nothing, and an app installed
on the home screen can stay open for days without asking for the page again —
it has no reload gesture at all. So the server tells each page which build
served it (the deployment's commit on Vercel, Next's own build id otherwise —
read at runtime rather than inlined, so the page and the server can never
carry different values), `/api/version` answers with the live one, and
the page compares the two on load and whenever it comes back to the
foreground. Behind, it reloads itself — not while something is being typed —
with a `?u=<id>` marker that tells the worker to wait for the network on that
one request rather than settle for the cached copy it is trying to replace. If
the reload still comes back old, a bar at the top offers **Update** instead of
the page chasing its tail.

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
