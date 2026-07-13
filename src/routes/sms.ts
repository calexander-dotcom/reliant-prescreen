import { Router, type Request, type Response } from 'express';
import twilio from 'twilio';
import { advance } from '../screening/conversation.js';
import type { SessionStore } from '../screening/store.js';

/**
 * Inbound SMS webhook. Twilio POSTs form-encoded fields (From, Body, ...);
 * we reply with TwiML so the response goes out over the same connection and
 * counts against the same messaging session.
 */
export function smsRouter(store: SessionStore, now: () => number = Date.now): Router {
  const router = Router();

  router.post('/sms', async (req: Request, res: Response) => {
    const from = typeof req.body?.From === 'string' ? req.body.From : '';
    const body = typeof req.body?.Body === 'string' ? req.body.Body : '';

    if (!from) {
      res.status(400).type('text/plain').send('Missing From');
      return;
    }

    const existing = await store.get(from);
    const result = advance(from, existing, body, now());
    await store.save(result.session);

    const twiml = new twilio.twiml.MessagingResponse();
    for (const reply of result.replies) {
      twiml.message(reply);
    }

    res.type('text/xml').send(twiml.toString());
  });

  return router;
}
