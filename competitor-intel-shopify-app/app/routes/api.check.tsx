import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { checkPage, checkCompetitor, isDevMode } from "~/services/monitor.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  if (request.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  const url = new URL(request.url);
  const competitorId = url.searchParams.get("competitorId");
  const pageId = url.searchParams.get("pageId");
  const simulatedPriceParam = url.searchParams.get("simulatedPrice");

  // Parse simulated price (DEV_MODE only)
  let simulatedPrice: number | null | undefined = undefined;
  if (isDevMode() && simulatedPriceParam !== null) {
    simulatedPrice = simulatedPriceParam === "null" ? null : parseFloat(simulatedPriceParam);
    if (simulatedPrice !== null && isNaN(simulatedPrice)) {
      simulatedPrice = undefined;
    }
  }

  try {
    if (pageId) {
      // Check specific page
      const page = await prisma.page.findFirst({
        where: {
          id: pageId,
          competitor: {
            shopId: shop.id,
          },
        },
      });

      if (!page) {
        return json(
          { success: false, error: "Page not found" },
          { status: 404 }
        );
      }

      const result = await checkPage(pageId, { simulatedPrice });

      // Update shop's last checked timestamp for consistent display
      await prisma.shop.update({
        where: { id: shop.id },
        data: { lastAutoCheckAt: new Date() },
      });

      return json({
        success: true,
        result: {
          isFirstSnapshot: result.isFirstSnapshot,
          hasChange: !!result.change,
          hasPriceChange: !!result.priceChange,
          significance: result.change?.significance || null,
          changeType: result.change?.changeType || null,
          priceData: result.priceChange
            ? {
                oldPrice: result.priceChange.priceDelta.oldPrice,
                newPrice: result.priceChange.priceDelta.newPrice,
                deltaAmount: result.priceChange.priceDelta.deltaAmount,
                deltaPercent: result.priceChange.priceDelta.deltaPercent,
              }
            : null,
        },
      });
    }

    if (competitorId) {
      // Check all pages for competitor
      const competitor = await prisma.competitor.findFirst({
        where: {
          id: competitorId,
          shopId: shop.id,
        },
      });

      if (!competitor) {
        return json(
          { success: false, error: "Competitor not found" },
          { status: 404 }
        );
      }

      const result = await checkCompetitor(competitorId);

      // Update shop's last checked timestamp for consistent display
      await prisma.shop.update({
        where: { id: shop.id },
        data: { lastAutoCheckAt: new Date() },
      });

      return json({
        success: true,
        result: {
          checked: result.checked,
          changes: result.changes,
        },
      });
    }

    // Check all competitors for shop (no competitorId or pageId)
    const allCompetitors = await prisma.competitor.findMany({
      where: {
        shopId: shop.id,
        active: true,
      },
      select: { id: true },
    });

    if (allCompetitors.length === 0) {
      return json({
        success: true,
        result: {
          competitors: 0,
          checked: 0,
          changes: 0,
        },
      });
    }

    let totalChecked = 0;
    let totalChanges = 0;

    for (const competitor of allCompetitors) {
      const result = await checkCompetitor(competitor.id);
      totalChecked += result.checked;
      totalChanges += result.changes;
    }

    // Update shop's last checked timestamp for consistent display
    await prisma.shop.update({
      where: { id: shop.id },
      data: { lastAutoCheckAt: new Date() },
    });

    return json({
      success: true,
      result: {
        competitors: allCompetitors.length,
        checked: totalChecked,
        changes: totalChanges,
      },
    });
  } catch (error) {
    console.error("Check error:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Check failed",
      },
      { status: 500 }
    );
  }
};
