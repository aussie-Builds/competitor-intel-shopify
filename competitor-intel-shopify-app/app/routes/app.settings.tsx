import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getPlanDisplayName, getPlanLimits } from "~/services/billing.server";
import { PlanSelector } from "~/components/PlanSelector";

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

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      plan: shop.plan,
      planDisplayName: getPlanDisplayName(shop.plan),
      alertEmail: shop.alertEmail,
      planActivatedAt: shop.planActivatedAt?.toISOString() || null,
    },
    planLimits,
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

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      alertEmail: alertEmail?.trim() || null,
    },
  });

  return json({ success: true });
};

export default function Settings() {
  const { shop, planLimits } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [alertEmail, setAlertEmail] = useState(shop.alertEmail || "");
  const [saved, setSaved] = useState(false);

  const isLoading = fetcher.state !== "idle";

  const handleSaveEmail = useCallback(() => {
    const formData = new FormData();
    formData.append("alertEmail", alertEmail);

    fetcher.submit(formData, { method: "POST" });
  }, [alertEmail, fetcher]);

  useEffect(() => {
    if (fetcher.data?.success) {
      setSaved(true);
      const timer = setTimeout(() => setSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data]);

  return (
    <Page title="Settings">
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
                      Check Frequency:
                    </Text>{" "}
                    {planLimits.checkIntervalMinutes === 1440
                      ? "Daily"
                      : planLimits.checkIntervalMinutes === 60
                        ? "Hourly"
                        : `Every ${planLimits.checkIntervalMinutes} minutes`}
                  </Text>

                  {shop.planActivatedAt && (
                    <Text as="p">
                      <Text as="span" fontWeight="semibold">
                        Plan Activated:
                      </Text>{" "}
                      {new Date(shop.planActivatedAt).toLocaleDateString()}
                    </Text>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
