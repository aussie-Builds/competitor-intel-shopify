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
  Box,
  Banner,
  DataTable,
  EmptyState,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getPlanLimits } from "~/services/billing.server";
import { ChangeList } from "~/components/ChangeList";
import { AddPageModal } from "~/components/AddPageModal";
import { formatTimeAgo } from "~/utils/time";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    throw new Response("Shop not found", { status: 404 });
  }

  const competitor = await prisma.competitor.findFirst({
    where: {
      id: params.id,
      shopId: shop.id,
    },
    include: {
      pages: {
        include: {
          _count: {
            select: { changes: true, snapshots: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!competitor) {
    throw new Response("Competitor not found", { status: 404 });
  }

  // Get recent changes for this competitor
  const recentChanges = await prisma.change.findMany({
    where: {
      page: {
        competitorId: competitor.id,
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
    take: 20,
  });

  const planLimits = getPlanLimits(shop.plan);

  return json({
    shop,
    competitor,
    recentChanges,
    planLimits,
  });
};

export default function CompetitorDetail() {
  const { shop, competitor, recentChanges, planLimits } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [showAddPageModal, setShowAddPageModal] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const canAddPage = competitor.pages.length < planLimits.maxPagesPerCompetitor;

  const handleCheckNow = useCallback(async () => {
    setIsChecking(true);
    setCheckStatus(null);

    try {
      const response = await fetch(`/api/check?competitorId=${competitor.id}`, {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        setCheckStatus({
          type: "success",
          message: `Checked ${data.result?.pagesChecked || 0} page(s). ${data.result?.changesFound || 0} change(s) detected.`,
        });
        // Refresh the page data
        revalidator.revalidate();
      } else {
        setCheckStatus({
          type: "error",
          message: data.error || "Failed to check competitor",
        });
      }
    } catch (error) {
      setCheckStatus({
        type: "error",
        message: "Failed to check competitor. Please try again.",
      });
    } finally {
      setIsChecking(false);
    }
  }, [competitor.id, revalidator]);

  const pageRows = competitor.pages.map((page) => [
    page.label,
    page.url,
    formatTimeAgo(page.lastChecked),
    page._count.changes.toString(),
    page.active ? (
      <Badge tone="success">Active</Badge>
    ) : (
      <Badge>Paused</Badge>
    ),
  ]);

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title={competitor.name}
      subtitle={competitor.websiteUrl}
      titleMetadata={
        competitor.active ? (
          <Badge tone="success">Active</Badge>
        ) : (
          <Badge tone="warning">Paused</Badge>
        )
      }
      primaryAction={{
        content: "Add Page",
        onAction: () => setShowAddPageModal(true),
        disabled: !canAddPage,
      }}
      secondaryActions={[
        {
          content: isChecking ? "Checking..." : "Check Now",
          onAction: handleCheckNow,
          loading: isChecking,
          disabled: isChecking,
        },
        {
          content: competitor.active ? "Pause" : "Resume",
          onAction: () => {
            fetch(`/api/competitors/${competitor.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: !competitor.active }),
            }).then(() => navigate(0));
          },
        },
        {
          content: "Delete",
          destructive: true,
          onAction: () => {
            if (
              confirm(
                `Are you sure you want to delete ${competitor.name}? This cannot be undone.`
              )
            ) {
              fetch(`/api/competitors/${competitor.id}`, {
                method: "DELETE",
              }).then(() => navigate("/app"));
            }
          },
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

        {!canAddPage && (
          <Banner tone="warning">
            You've reached the page limit for your plan. Upgrade to add more
            pages.
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Monitored Pages
                  </Text>
                  <Text as="span" tone="subdued">
                    {competitor.pages.length}
                    {planLimits.maxPagesPerCompetitor !== Infinity &&
                      ` / ${planLimits.maxPagesPerCompetitor}`}
                  </Text>
                </InlineStack>

                {competitor.pages.length === 0 ? (
                  <EmptyState
                    heading="No pages monitored"
                    action={{
                      content: "Add Page",
                      onAction: () => setShowAddPageModal(true),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Add pages to start monitoring for changes.</p>
                  </EmptyState>
                ) : (
                  <DataTable
                    columnContentTypes={[
                      "text",
                      "text",
                      "text",
                      "numeric",
                      "text",
                    ]}
                    headings={[
                      "Label",
                      "URL",
                      "Last Checked",
                      "Changes",
                      "Status",
                    ]}
                    rows={pageRows}
                  />
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
                      No changes detected yet.
                    </Text>
                  </Box>
                ) : (
                  <ChangeList changes={recentChanges} showCompetitorName={false} />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      <AddPageModal
        open={showAddPageModal}
        onClose={() => setShowAddPageModal(false)}
        competitorId={competitor.id}
        competitorName={competitor.name}
      />
    </Page>
  );
}
