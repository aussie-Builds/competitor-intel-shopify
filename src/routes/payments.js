import { Router } from 'express';
import express from 'express';
import { StripeService } from '../services/stripe.js';
import { User } from '../models/user.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Check if Stripe is configured
router.get('/status', (req, res) => {
  res.json({ configured: StripeService.isConfigured() });
});

// Create checkout session
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    if (!StripeService.isConfigured()) {
      return res.status(503).json({ error: 'Payment system not configured' });
    }

    const { plan } = req.body;

    if (!['starter', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    let customerId = req.user.stripe_customer_id;

    if (!customerId) {
      const customer = await StripeService.createCustomer(req.user.email, req.user.id);
      customerId = customer.id;
      User.updateStripeInfo(req.user.id, { customerId });
    }

    const session = await StripeService.createCheckoutSession(customerId, plan, req.user.id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Billing portal
router.post('/billing-portal', requireAuth, async (req, res) => {
  try {
    if (!StripeService.isConfigured()) {
      return res.status(503).json({ error: 'Payment system not configured' });
    }

    if (!req.user.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await StripeService.createBillingPortalSession(req.user.stripe_customer_id);

    res.json({ url: session.url });
  } catch (error) {
    console.error('Billing portal error:', error);
    res.status(500).json({ error: 'Failed to create billing session' });
  }
});

// Stripe webhook - must use raw body
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = StripeService.constructWebhookEvent(req.body, sig);

    console.log(`Stripe webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;

        if (userId && session.subscription) {
          const subscription = await StripeService.getSubscription(session.subscription);
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = StripeService.determinePlanFromPriceId(priceId);
          const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          User.updateStripeInfo(parseInt(userId), {
            subscriptionId: subscription.id,
            status: 'active',
            plan,
            periodEnd
          });

          console.log(`User ${userId} subscribed to ${plan} plan`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const user = User.findByStripeCustomer(subscription.customer);

        if (user) {
          const priceId = subscription.items.data[0]?.price?.id;
          const plan = StripeService.determinePlanFromPriceId(priceId);
          const status = subscription.status === 'active' ? 'active' : 'inactive';
          const periodEnd = subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null;

          User.updateStripeInfo(user.id, {
            subscriptionId: subscription.id,
            status,
            plan: status === 'active' ? plan : user.plan,
            periodEnd
          });

          console.log(`User ${user.id} subscription updated: ${status}, plan: ${plan}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = User.findByStripeCustomer(subscription.customer);

        if (user) {
          User.updateStripeInfo(user.id, {
            status: 'inactive',
            periodEnd: new Date().toISOString()
          });

          console.log(`User ${user.id} subscription cancelled`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const user = User.findByStripeCustomer(invoice.customer);

        if (user) {
          User.updateStripeInfo(user.id, { status: 'past_due' });
          console.log(`User ${user.id} payment failed`);
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }
});

export default router;
