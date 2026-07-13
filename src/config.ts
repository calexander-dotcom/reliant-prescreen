export interface AppConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  publicBaseUrl: string;
  validateSignature: boolean;
  port: number;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    accountSid: required(env, 'TWILIO_ACCOUNT_SID'),
    authToken: required(env, 'TWILIO_AUTH_TOKEN'),
    fromNumber: required(env, 'TWILIO_FROM_NUMBER'),
    publicBaseUrl: env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    // Default to validating; only the literal "false" turns it off.
    validateSignature: (env.VALIDATE_TWILIO_SIGNATURE ?? 'true') !== 'false',
    port: Number(env.PORT ?? 3000),
  };
}
