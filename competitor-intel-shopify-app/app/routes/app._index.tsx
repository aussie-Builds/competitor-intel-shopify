import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
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
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getPlanLimits, getPlanDisplayName } from "~/services/billing.server";
import { DashboardStats } from "~/components/DashboardStats";
import { CompetitorCard } from "~/components/CompetitorCard";
import { ChangeList } from "~/components/ChangeList";
import { AddCompetitorModal } from "~/components/AddCompetitorModal";
import { useState } from "react";

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
  const [showAddModal, setShowAddModal] = useState(false);

  const canAddCompetitor = stats.totalCompetitors < stats.maxCompetitors;

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
          content: "Settings",
          onAction: () => navigate("/app/settings"),
        },
      ]}
    >
      <BlockStack gap="500">
        <DashboardStats
          totalCompetitors={stats.totalCompetitors}
          maxCompetitors={stats.maxCompetitors}
          totalPages={stats.totalPages}
          totalChanges={stats.totalChanges}
          plan={shop.plan}
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
      />
    </Page>
  );
}
