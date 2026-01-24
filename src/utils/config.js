import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');
        if (key && value !== undefined) {
          process.env[key.trim()] = value.trim();
        }
      }
    }
  }
}

loadEnv();

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  resendApiKey: process.env.RESEND_API_KEY,
  alertEmailFrom: process.env.ALERT_EMAIL_FROM || 'alerts@competitor-intel.com',
  alertEmailTo: process.env.ALERT_EMAIL_TO,
  port: parseInt(process.env.PORT || '3000', 10),

  // Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePriceIdStarter: process.env.STRIPE_PRICE_ID_STARTER,
  stripePriceIdPro: process.env.STRIPE_PRICE_ID_PRO,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
};
