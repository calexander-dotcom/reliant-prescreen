import { Router, type Request, type Response } from 'express';
import { SCREENING_QUESTIONS } from '../screening/questions.js';
import { newSession, type SessionStore } from '../screening/store.js';
import type { Notifier } from '../twilio/client.js';

/**
 * Outbound initiation: POST { "phone": "+1..." } to text a candidate the first
 * screening question and open a session. Their replies then drive the flow via
 * the inbound /sms webhook.
 */
export function screeningsRouter(
  store: SessionStore,
  notifier: Notifier,
  now: () => number = Date.now,
): Router {
  const router = Router();

  router.post('/screenings', async (req: Request, res: Response) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
      res.status(400).json({ error: 'phone must be in E.164 format, e.g. +15555550123' });
      return;
    }

    const existing = await store.get(phone);
    if (existing && existing.status === 'active') {
      res.status(409).json({ error: 'A screening is already in progress for this number.' });
      return;
    }

    const session = newSession(phone, now());
    await store.save(session);

    try {
      await notifier.sendSms(phone, SCREENING_QUESTIONS[0].prompt);
    } catch (err) {
      res.status(502).json({ error: 'Failed to send SMS via Twilio', detail: String(err) });
      return;
    }

    res.status(201).json({ phone, status: session.status });
  });

  return router;
}
