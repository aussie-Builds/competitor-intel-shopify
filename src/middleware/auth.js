import { Session } from '../models/session.js';
import { User } from '../models/user.js';

export function requireAuth(req, res, next) {
  const sessionId = req.cookies?.session;

  if (!sessionId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = Session.findValidById(sessionId);
  if (!session) {
    res.clearCookie('session');
    return res.status(401).json({ error: 'Session expired' });
  }

  const user = User.findById(session.user_id);
  if (!user) {
    Session.delete(sessionId);
    res.clearCookie('session');
    return res.status(401).json({ error: 'User not found' });
  }

  req.user = user;
  req.session = session;
  next();
}

export function requireActiveSubscription(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.subscription_status !== 'active') {
    return res.status(403).json({
      error: 'Active subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      redirect: '/pricing'
    });
  }

  next();
}
