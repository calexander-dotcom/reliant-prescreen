import express, { type Express } from 'express';
import type { AppConfig } from './config.js';
import { healthRouter } from './routes/health.js';
import { smsRouter } from './routes/sms.js';
import { screeningsRouter } from './routes/screenings.js';
import type { SessionStore } from './screening/store.js';
import { twilioSignature } from './twilio/validateSignature.js';
import type { Notifier } from './twilio/client.js';

export interface AppDeps {
  config: AppConfig;
  store: SessionStore;
  notifier: Notifier;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export function createApp({ config, store, notifier, now = Date.now }: AppDeps): Express {
  const app = express();

  // Twilio posts application/x-www-form-urlencoded webhooks.
  app.use(express.urlencoded({ extended: false }));
  // JSON for our own outbound API.
  app.use(express.json());

  app.use(healthRouter());

  // Signature validation guards only the Twilio-facing webhook path.
  app.use('/sms', twilioSignature(config));
  app.use(smsRouter(store, now));

  app.use(screeningsRouter(store, notifier, now));

  return app;
}
