import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
  Divider,
  Select,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import {
  getPlanDisplayName,
  getPlanLimits,
  CHECK_INTERVAL_OPTIONS,
  getEffectiveIntervalMinutes,
} from "~/services/billing.server";
import { PlanSelector } from "~/components/PlanSelector";

// Dev store domain for gating dev tools
// Requires DEBUG_TOOLS=true in Render env vars
const DEV_STORE_DOMAIN = "review-tool-demo.myshopify.com";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  const planLimits = getPlanLimits(shop.plan);

  const effectiveInterval = getEffectiveIntervalMinutes(
    shop.checkIntervalMinutes,
    shop.maxFrequencyAllowedMinutes
  );

  // Dev tools visible only if DEBUG_TOOLS=true AND shop is the dev store
  const showDevTools =
    process.env.DEBUG_TOOLS === "true" && shopDomain === DEV_STORE_DOMAIN;

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      plan: shop.plan,
      planDisplayName: getPlanDisplayName(shop.plan),
      alertEmail: shop.alertEmail,
      planActivatedAt: shop.planActivatedAt?.toISOString() || null,
      checkIntervalMinutes: shop.checkIntervalMinutes,
      maxFrequencyAllowedMinutes: shop.maxFrequencyAllowedMinutes,
      effectiveInterval,
      lastAutoCheckAt: shop.lastAutoCheckAt?.toISOString() || null,
    },
    planLimits,
    checkIntervalOptions: CHECK_INTERVAL_OPTIONS,
    showDevTools,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  const alertEmail = formData.get("alertEmail") as string | null;
  const checkIntervalMinutes = formData.get("checkIntervalMinutes") as string | null;

  const updateData: { alertEmail?: string | null; checkIntervalMinutes?: number } = {};

  // Handle alertEmail update
  if (formData.has("alertEmail")) {
    updateData.alertEmail = alertEmail?.trim() || null;
  }

  // Handle checkIntervalMinutes update
  if (checkIntervalMinutes) {
    const interval = parseInt(checkIntervalMinutes, 10);
    if (!isNaN(interval) && interval > 0) {
      updateData.checkIntervalMinutes = interval;
    }
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: updateData,
  });

  return json({ success: true });
};

export default function Settings() {
  const { shop, planLimits, checkIntervalOptions, showDevTools } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [alertEmail, setAlertEmail] = useState(shop.alertEmail || "");
  const [checkInterval, setCheckInterval] = useState(
    String(shop.checkIntervalMinutes)
  );
  const [saved, setSaved] = useState(false);
  const [forceCheckStatus, setForceCheckStatus] = useState<{
    loading: boolean;
    message?: string;
    success?: boolean;
  }>({ loading: false });
  const [resetOnboardingStatus, setResetOnboardingStatus] = useState<{
    loading: boolean;
    message?: string;
    success?: boolean;
  }>({ loading: false });

  const isLoading = fetcher.state !== "idle";

  const handleForceCheck = useCallback(async () => {
    setForceCheckStatus({ loading: true });
    try {
      const response = await fetch("/api/dev/force-check", { method: "POST" });
      const data = await response.json();
      setForceCheckStatus({
        loading: false,
        message: data.message || data.error,
        success: data.success,
      });
      // Revalidate loader data on success so Last Auto Check updates
      if (data.success) {
        revalidator.revalidate();
      }
    } catch {
      setForceCheckStatus({
        loading: false,
        message: "Failed to trigger force check. Please try again.",
        success: false,
      });
    }
  }, [revalidator]);

  const handleResetOnboarding = useCallback(async () => {
    setResetOnboardingStatus({ loading: true });
    try {
      const response = await fetch("/api/shop/reset-onboarding", { method: "POST" });
      const data = await response.json();
      setResetOnboardingStatus({
        loading: false,
        message: data.success
          ? "Onboarding reset! Refresh the dashboard to see the welcome modal."
          : data.error || "Failed to reset onboarding",
        success: data.success,
      });
    } catch {
      setResetOnboardingStatus({
        loading: false,
        message: "Failed to reset onboarding. Please try again.",
        success: false,
      });
    }
  }, []);

  const formatTimeAgo = (dateString: string | null): string => {
    if (!dateString) return "Not run yet";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins === 1) return "1 minute ago";
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  };

  const handleSaveEmail = useCallback(() => {
    const formData = new FormData();
    formData.append("alertEmail", alertEmail);

    fetcher.submit(formData, { method: "POST" });
  }, [alertEmail, fetcher]);

  const handleSaveInterval = useCallback(() => {
    const formData = new FormData();
    formData.append("checkIntervalMinutes", checkInterval);

    fetcher.submit(formData, { method: "POST" });
  }, [checkInterval, fetcher]);

  // Check if selected interval is below plan minimum
  const selectedIntervalNum = parseInt(checkInterval, 10);
  const isIntervalLimited = selectedIntervalNum < shop.maxFrequencyAllowedMinutes;

  const formatInterval = (minutes: number): string => {
    if (minutes >= 1440) return "Daily";
    if (minutes >= 60) return `Every ${minutes / 60} hour${minutes > 60 ? "s" : ""}`;
    return `Every ${minutes} minutes`;
  };

  useEffect(() => {
    if (fetcher.data?.success) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data]);

  return (
    <Page
      title="Settings"
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="500">
        {saved && (
          <Banner tone="success" onDismiss={() => setSaved(false)}>
            Settings saved successfully!
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Your Plan
                </Text>
                <PlanSelector currentPlan={shop.plan} />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Alert Notifications
                </Text>
                <Text as="p" tone="subdued">
                  Configure where you want to receive email alerts when we
                  detect changes on your competitors' pages.
                </Text>

                <Divider />

                <TextField
                  label="Alert Email Address"
                  type="email"
                  value={alertEmail}
                  onChange={setAlertEmail}
                  placeholder="alerts@yourstore.com"
                  autoComplete="email"
                  helpText="We'll send change notifications to this email address"
                />

                <Button
                  onClick={handleSaveEmail}
                  loading={isLoading}
                  variant="primary"
                >
                  Save Email Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Monitoring Frequency
                </Text>
                <Text as="p" tone="subdued">
                  Choose how often we check your competitors' pages for changes.
                </Text>

                <Divider />

                <Select
                  label="Check Interval"
                  options={checkIntervalOptions}
                  value={checkInterval}
                  onChange={setCheckInterval}
                  helpText={
                    isIntervalLimited
                      ? `Your ${shop.planDisplayName} plan allows a minimum of ${formatInterval(shop.maxFrequencyAllowedMinutes)}. Effective interval: ${formatInterval(shop.effectiveInterval)}`
                      : `Pages will be checked ${formatInterval(selectedIntervalNum).toLowerCase()}`
                  }
                />

                {isIntervalLimited && (
                  <Banner tone="info">
                    Upgrade your plan to unlock more frequent monitoring.
                  </Banner>
                )}

                <Button
                  onClick={handleSaveInterval}
                  loading={isLoading}
                  variant="primary"
                >
                  Save Monitoring Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Plan Details
                </Text>

                <BlockStack gap="200">
                  <Text as="p">
                    <Text as="span" fontWeight="semibold">
                      Current Plan:
                    </Text>{" "}
                    {shop.planDisplayName}
                  </Text>

                  <Text as="p">
                    <Text as="span" fontWeight="semibold">
                      Max Competitors:
                    </Text>{" "}
                    {planLimits.maxCompetitors}
                  </Text>

                  <Text as="p">
                    <Text as="span" fontWeight="semibold">
                      Max Pages per Competitor:
                    </Text>{" "}
                    {planLimits.maxPagesPerCompetitor === Infinity
                      ? "Unlimited"
                      : planLimits.maxPagesPerCompetitor}
                  </Text>

                  <Text as="p">
                    <Text as="span" fontWeight="semibold">
                      Minimum Check Frequency:
                    </Text>{" "}
                    {formatInterval(planLimits.maxFrequencyAllowedMinutes)}
                  </Text>

                  {shop.planActivatedAt && (
                    <Text as="p">
                      <Text as="span" fontWeight="semibold">
                        Plan Activated:
                      </Text>{" "}
                      {new Date(shop.planActivatedAt).toLocaleDateString()}
                    </Text>
                  )}

                  <Text as="p">
                    <Text as="span" fontWeight="semibold">
                      Last Automatic Check:
                    </Text>{" "}
                    {formatTimeAgo(shop.lastAutoCheckAt)}
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Dev Tools: Only visible when DEBUG_TOOLS=true AND shop is dev store */}
          {showDevTools && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Banner tone="warning">
                    <Text as="span" fontWeight="bold">Dev Tools</Text> - Only visible for dev store
                  </Banner>

                  <Text as="h2" variant="headingMd">
                    Dev Tools
                  </Text>

                  <Divider />

                  <BlockStack gap="300">
                    <Button
                      onClick={handleForceCheck}
                      loading={forceCheckStatus.loading}
                    >
                      Force Scheduler Run
                    </Button>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Dev-only: forces next scheduled run for this shop.
                    </Text>
                    {forceCheckStatus.message && (
                      <Banner tone={forceCheckStatus.success ? "success" : "critical"}>
                        {forceCheckStatus.message}
                      </Banner>
                    )}
                  </BlockStack>

                  <Divider />

                  <BlockStack gap="300">
                    <Button
                      onClick={handleResetOnboarding}
                      loading={resetOnboardingStatus.loading}
                    >
                      Reset Onboarding
                    </Button>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Dev-only: resets hasSeenOnboarding and hasCompletedTour flags.
                    </Text>
                    {resetOnboardingStatus.message && (
                      <Banner tone={resetOnboardingStatus.success ? "success" : "critical"}>
                        {resetOnboardingStatus.message}
                      </Banner>
                    )}
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </BlockStack>
    </Page>
  );
}
