import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useRevalidator } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Badge,
  EmptyState,
  Box,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getPlanLimits, getPlanDisplayName } from "~/services/billing.server";
import { DashboardStats } from "~/components/DashboardStats";
import { CompetitorCard } from "~/components/CompetitorCard";
import { ChangeList } from "~/components/ChangeList";
import { AddCompetitorModal } from "~/components/AddCompetitorModal";
import { WelcomeModal } from "~/components/WelcomeModal";
import { useState, useCallback } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Get or create shop record
  let shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    shop = await prisma.shop.create({
      data: { shopDomain },
    });
  }

  // Get competitors with pages
  const competitors = await prisma.competitor.findMany({
    where: { shopId: shop.id },
    include: {
      pages: {
        include: {
          _count: {
            select: { changes: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get recent changes
  const recentChanges = await prisma.change.findMany({
    where: {
      page: {
        competitor: {
          shopId: shop.id,
        },
      },
    },
    include: {
      page: {
        include: {
          competitor: true,
        },
      },
    },
    orderBy: { detectedAt: "desc" },
    take: 10,
  });

  // Get stats
  const totalCompetitors = competitors.length;
  const totalPages = competitors.reduce((sum, c) => sum + c.pages.length, 0);
  const totalChanges = await prisma.change.count({
    where: {
      page: {
        competitor: {
          shopId: shop.id,
        },
      },
    },
  });

  const planLimits = getPlanLimits(shop.plan);

  return json({
    shop: {
      id: shop.id,
      shopDomain: shop.shopDomain,
      plan: shop.plan,
      planDisplayName: getPlanDisplayName(shop.plan),
      alertEmail: shop.alertEmail,
      lastAutoCheckAt: shop.lastAutoCheckAt?.toISOString() || null,
      hasSeenOnboarding: shop.hasSeenOnboarding,
    },
    competitors,
    recentChanges,
    stats: {
      totalCompetitors,
      totalPages,
      totalChanges,
      maxCompetitors: planLimits.maxCompetitors,
      maxPagesPerCompetitor: planLimits.maxPagesPerCompetitor,
    },
  });
};

export default function Dashboard() {
  const { shop, competitors, recentChanges, stats } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(
    !shop.hasSeenOnboarding
  );
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkStatus, setCheckStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const canAddCompetitor = stats.totalCompetitors < stats.maxCompetitors;

  const handleShowMeAround = useCallback(() => {
    setShowWelcomeModal(false);
    setShowAddModal(true);
  }, []);

  const handleCheckAll = useCallback(async () => {
    setIsCheckingAll(true);
    setCheckStatus(null);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        setCheckStatus({
          type: "success",
          message: `Checked ${data.result?.competitors || 0} competitor(s), ${data.result?.checked || 0} page(s). ${data.result?.changes || 0} change(s) detected.`,
        });
        revalidator.revalidate();
      } else {
        setCheckStatus({
          type: "error",
          message: data.error || "Failed to check competitors",
        });
      }
    } catch (error) {
      setCheckStatus({
        type: "error",
        message: "Failed to check competitors. Please try again.",
      });
    } finally {
      setIsCheckingAll(false);
    }
  }, [revalidator]);

  return (
    <Page
      title="Competitor Intel"
      subtitle={`${shop.planDisplayName} Plan`}
      primaryAction={{
        content: "Add Competitor",
        onAction: () => setShowAddModal(true),
        disabled: !canAddCompetitor,
      }}
      secondaryActions={[
        {
          content: isCheckingAll ? "Checking..." : "Check All",
          onAction: handleCheckAll,
          loading: isCheckingAll,
          disabled: isCheckingAll || competitors.length === 0,
        },
        {
          content: "Settings",
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <BlockStack gap="500">
        {checkStatus && (
          <Banner
            tone={checkStatus.type === "success" ? "success" : "critical"}
            onDismiss={() => setCheckStatus(null)}
          >
            {checkStatus.message}
          </Banner>
        )}

        <DashboardStats
          totalCompetitors={stats.totalCompetitors}
          maxCompetitors={stats.maxCompetitors}
          totalPages={stats.totalPages}
          totalChanges={stats.totalChanges}
          plan={shop.plan}
          lastAutoCheckAt={shop.lastAutoCheckAt}
        />

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Competitors
                  </Text>
                  {!canAddCompetitor && (
                    <Badge tone="warning">Limit reached</Badge>
                  )}
                </InlineStack>

                {competitors.length === 0 ? (
                  <EmptyState
                    heading="Add your first competitor"
                    action={{
                      content: "Add Competitor",
                      onAction: () => setShowAddModal(true),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Start monitoring your competitors by adding their website
                      URLs. We'll track changes and alert you to important
                      updates.
                    </p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="300">
                    {competitors.map((competitor) => (
                      <CompetitorCard
                        key={competitor.id}
                        competitor={competitor}
                        maxPagesPerCompetitor={stats.maxPagesPerCompetitor}
                        onClick={() =>
                          navigate(`/app/competitors/${competitor.id}`)
                        }
                      />
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Recent Changes
                </Text>
                {recentChanges.length === 0 ? (
                  <Box padding="400">
                    <Text as="p" tone="subdued">
                      No changes detected yet. Changes will appear here once we
                      detect updates on your competitors' pages.
                    </Text>
                  </Box>
                ) : (
                  <ChangeList changes={recentChanges} />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <AddCompetitorModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        shopId={shop.id}
        onSuccess={() => revalidator.revalidate()}
      />

      <WelcomeModal
        open={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onShowMeAround={handleShowMeAround}
      />
    </Page>
  );
}
