import twilio from 'twilio';
import type { AppConfig } from '../config.js';

export interface Notifier {
  sendSms(to: string, body: string): Promise<void>;
}

/**
 * Thin wrapper over the Twilio REST client for outbound SMS (e.g. to kick off a
 * screening conversation with a candidate). Inbound replies are handled via
 * TwiML in the webhook and do not go through here.
 */
export class TwilioNotifier implements Notifier {
  private readonly client: twilio.Twilio;

  constructor(private readonly config: AppConfig) {
    this.client = twilio(config.accountSid, config.authToken);
  }

  async sendSms(to: string, body: string): Promise<void> {
    await this.client.messages.create({
      to,
      from: this.config.fromNumber,
      body,
    });
  }
}
