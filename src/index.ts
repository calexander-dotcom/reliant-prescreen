import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { InMemorySessionStore } from './screening/store.js';
import { TwilioNotifier } from './twilio/client.js';

function main(): void {
  const config = loadConfig();
  const store = new InMemorySessionStore();
  const notifier = new TwilioNotifier(config);

  const app = createApp({ config, store, notifier });

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`reliant-prescreen listening on port ${config.port}`);
  });
}

main();
