import db from './database.js';

const PLAN_LIMITS = {
  starter: { maxCompetitors: 3, maxPagesPerCompetitor: 5, checkFrequency: 'daily' },
  pro: { maxCompetitors: 10, maxPagesPerCompetitor: Infinity, checkFrequency: 'hourly' }
};

export const User = {
  create(email, passwordHash, name = null) {
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, name)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(email.toLowerCase(), passwordHash, name);
    return this.findById(result.lastInsertRowid);
  },

  findById(id) {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  },

  findByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email.toLowerCase());
  },

  findByStripeCustomer(customerId) {
    const stmt = db.prepare('SELECT * FROM users WHERE stripe_customer_id = ?');
    return stmt.get(customerId);
  },

  update(id, updates) {
    const allowedFields = ['name', 'email', 'password_hash'];
    const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
    if (fields.length === 0) return this.findById(id);

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => f === 'email' ? updates[f].toLowerCase() : updates[f]);

    const stmt = db.prepare(`
      UPDATE users SET ${setClause}, updated_at = datetime('now') WHERE id = ?
    `);
    stmt.run(...values, id);
    return this.findById(id);
  },

  updateStripeInfo(id, { customerId, subscriptionId, status, plan, periodEnd }) {
    const updates = [];
    const values = [];

    if (customerId !== undefined) {
      updates.push('stripe_customer_id = ?');
      values.push(customerId);
    }
    if (subscriptionId !== undefined) {
      updates.push('stripe_subscription_id = ?');
      values.push(subscriptionId);
    }
    if (status !== undefined) {
      updates.push('subscription_status = ?');
      values.push(status);
    }
    if (plan !== undefined) {
      updates.push('plan = ?');
      values.push(plan);
    }
    if (periodEnd !== undefined) {
      updates.push('plan_period_end = ?');
      values.push(periodEnd);
    }

    if (updates.length === 0) return this.findById(id);

    updates.push("updated_at = datetime('now')");
    const stmt = db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values, id);
    return this.findById(id);
  },

  getSubscriptionLimits(userId) {
    const user = this.findById(userId);
    if (!user) return PLAN_LIMITS.starter;

    // Only active subscriptions get their plan limits
    if (user.subscription_status !== 'active') {
      return { ...PLAN_LIMITS.starter, maxCompetitors: 0, maxPagesPerCompetitor: 0 };
    }

    return PLAN_LIMITS[user.plan] || PLAN_LIMITS.starter;
  },

  hasActiveSubscription(userId) {
    const user = this.findById(userId);
    return user && user.subscription_status === 'active';
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  }
};

export { PLAN_LIMITS };
