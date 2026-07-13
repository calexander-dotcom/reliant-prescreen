# reliant-prescreen

A Twilio SMS pre-screening service for candidate intake. It runs candidates
through a short, configurable set of screening questions over text, collects
their answers, and handles carrier-compliance keywords (STOP / START / HELP).

> **Note on scope:** This was scaffolded from an empty repository as a sensible
> starting point for "Resume Twilio." The screening questions, storage backend,
> and downstream handoff (what happens with a completed screening) are meant to
> be adapted to Reliant's actual process — see [Extending](#extending).

## How it works

1. A candidate is texted the first screening question — either because they
   text the Twilio number first, or because you initiate via `POST /screenings`.
2. Each inbound SMS is answered by the state machine in
   [`src/screening/conversation.ts`](src/screening/conversation.ts), which
   parses/validates the reply, stores it, and returns the next question as TwiML.
3. When the last question is answered the session is marked `completed`.

The conversation engine is a **pure function** (no Twilio/IO), so the whole flow
is unit-tested without network access.

## Endpoints

| Method | Path           | Purpose                                                        |
| ------ | -------------- | -------------------------------------------------------------- |
| `POST` | `/sms`         | Twilio inbound-message webhook. Returns TwiML. Signature-checked. |
| `POST` | `/screenings`  | Start an outbound screening: `{ "phone": "+15555550123" }`.    |
| `GET`  | `/healthz`     | Liveness check.                                                |

## Setup

```bash
npm install
cp .env.example .env   # fill in your Twilio credentials
npm run dev            # or: npm run build && npm start
```

Point your Twilio number's **"A message comes in"** webhook at
`https://<your-host>/sms` (HTTP POST). Set `PUBLIC_BASE_URL` to that same host so
inbound-signature validation passes.

### Environment

See [`.env.example`](.env.example). Required: `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`. Set
`VALIDATE_TWILIO_SIGNATURE=false` only for local testing.

## Testing local inbound without Twilio

With `VALIDATE_TWILIO_SIGNATURE=false`:

```bash
curl -X POST localhost:3000/sms \
  --data-urlencode 'From=+15551230000' \
  --data-urlencode 'Body=hi'
```

## Scripts

- `npm run dev` — watch-mode dev server (`tsx`)
- `npm run build` — compile TypeScript to `dist/`
- `npm start` — run the compiled server
- `npm test` — run the unit tests (`vitest`)
- `npm run typecheck` — type-check without emitting

## Extending

- **Questions** — edit [`src/screening/questions.ts`](src/screening/questions.ts).
  The array is data-driven; the engine and webhook don't change.
- **Storage** — [`InMemorySessionStore`](src/screening/store.ts) is per-instance
  and non-durable. Implement `SessionStore` against Redis/Postgres for
  multi-instance or persistent deployments.
- **Completed-screening handoff** — hook into the `completed` transition in
  `conversation.ts` (or after `store.save` in the webhook) to push results to
  your ATS / notify a recruiter.
