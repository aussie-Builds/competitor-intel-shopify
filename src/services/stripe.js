import Stripe from 'stripe';
import { config } from '../utils/config.js';

const stripe = config.stripeSecretKey ? new Stripe(config.stripeSecretKey) : null;

export const StripeService = {
  isConfigured() {
    return !!(stripe && config.stripePriceIdStarter && config.stripePriceIdPro);
  },

  async createCustomer(email, userId) {
    if (!stripe) throw new Error('Stripe is not configured');

    return stripe.customers.create({
      email,
      metadata: { userId: String(userId) }
    });
  },

  async createCheckoutSession(customerId, plan, userId) {
    if (!stripe) throw new Error('Stripe is not configured');

    const priceId = plan === 'pro' ? config.stripePriceIdPro : config.stripePriceIdStarter;

    return stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appUrl}/pricing`,
      metadata: { userId: String(userId), plan }
    });
  },

  async createBillingPortalSession(customerId) {
    if (!stripe) throw new Error('Stripe is not configured');

    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${config.appUrl}/`
    });
  },

  constructWebhookEvent(payload, signature) {
    if (!stripe) throw new Error('Stripe is not configured');

    return stripe.webhooks.constructEvent(
      payload,
      signature,
      config.stripeWebhookSecret
    );
  },

  async getSubscription(subscriptionId) {
    if (!stripe) throw new Error('Stripe is not configured');

    return stripe.subscriptions.retrieve(subscriptionId);
  },

  determinePlanFromPriceId(priceId) {
    if (priceId === config.stripePriceIdPro) return 'pro';
    if (priceId === config.stripePriceIdStarter) return 'starter';
    return 'starter';
  }
};
