export interface PlanLimits {
  maxCompetitors: number;
  maxPagesPerCompetitor: number;
  checkIntervalMinutes: number;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter: {
    maxCompetitors: 3,
    maxPagesPerCompetitor: 5,
    checkIntervalMinutes: 1440, // Daily
  },
  pro: {
    maxCompetitors: 10,
    maxPagesPerCompetitor: 25,
    checkIntervalMinutes: 60, // Hourly
  },
  business: {
    maxCompetitors: 25,
    maxPagesPerCompetitor: Infinity,
    checkIntervalMinutes: 15, // Every 15 minutes
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan.toLowerCase()] || PLAN_LIMITS.starter;
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
    starter: "Starter",
    pro: "Pro",
    business: "Business",
  };
  return names[plan.toLowerCase()] || "Starter";
}

export function getPlanPrice(plan: string): number {
  const prices: Record<string, number> = {
    starter: 29,
    pro: 79,
    business: 149,
  };
  return prices[plan.toLowerCase()] || 29;
}
