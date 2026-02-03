export interface PlanLimits {
  maxCompetitors: number;
  maxPagesPerCompetitor: number;
  checkIntervalMinutes: number;
  maxFrequencyAllowedMinutes: number; // Lower = more frequent checks allowed
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  beta: {
    maxCompetitors: 5,
    maxPagesPerCompetitor: 10,
    checkIntervalMinutes: 360, // Every 6 hours (default display)
    maxFrequencyAllowedMinutes: 360, // 6 hours minimum
  },
  starter: {
    maxCompetitors: 3,
    maxPagesPerCompetitor: 5,
    checkIntervalMinutes: 1440, // Daily (default display)
    maxFrequencyAllowedMinutes: 1440, // Daily minimum
  },
  pro: {
    maxCompetitors: 10,
    maxPagesPerCompetitor: 25,
    checkIntervalMinutes: 60, // Hourly (default display)
    maxFrequencyAllowedMinutes: 360, // 6 hours minimum
  },
  business: {
    maxCompetitors: 25,
    maxPagesPerCompetitor: Infinity,
    checkIntervalMinutes: 15, // Every 15 minutes (default display)
    maxFrequencyAllowedMinutes: 60, // Hourly minimum
  },
};

// Available check interval options for user selection
export const CHECK_INTERVAL_OPTIONS = [
  { value: "360", label: "Every 6 hours (recommended)" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
];

// Get effective interval (respects plan limits)
export function getEffectiveIntervalMinutes(
  userInterval: number,
  maxFrequencyAllowed: number
): number {
  return Math.max(userInterval, maxFrequencyAllowed);
}

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan.toLowerCase()] || PLAN_LIMITS.beta;
}

export function canAddCompetitor(
  plan: string,
  currentCompetitorCount: number
): boolean {
  const limits = getPlanLimits(plan);
  return currentCompetitorCount < limits.maxCompetitors;
}

export function canAddPage(
  plan: string,
  currentPageCount: number
): boolean {
  const limits = getPlanLimits(plan);
  return currentPageCount < limits.maxPagesPerCompetitor;
}

export function getPlanDisplayName(plan: string): string {
  const names: Record<string, string> = {
    beta: "Beta Access",
    starter: "Starter",
    pro: "Pro",
    business: "Business",
  };
  return names[plan.toLowerCase()] || "Beta Access";
}

export function getPlanPrice(plan: string): number {
  const prices: Record<string, number> = {
    beta: 0,
    starter: 29,
    pro: 79,
    business: 149,
  };
  return prices[plan.toLowerCase()] || 0;
}
