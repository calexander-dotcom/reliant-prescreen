import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import type { AppConfig } from '../config.js';

/**
 * Express middleware that verifies the X-Twilio-Signature header so only genuine
 * Twilio webhooks are processed. The signature is computed over the full public
 * URL plus the POST body, so PUBLIC_BASE_URL must match the URL configured on
 * the Twilio number exactly (scheme + host + path).
 *
 * Requires the raw form-encoded body to already be parsed into req.body
 * (express.urlencoded).
 */
export function twilioSignature(config: AppConfig) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!config.validateSignature) {
      next();
      return;
    }

    const signature = req.header('X-Twilio-Signature') ?? '';
    const url = new URL(req.originalUrl, config.publicBaseUrl).toString();

    const valid = twilio.validateRequest(
      config.authToken,
      signature,
      url,
      (req.body ?? {}) as Record<string, unknown>,
    );

    if (!valid) {
      res.status(403).type('text/plain').send('Invalid Twilio signature');
      return;
    }
    next();
  };
}
