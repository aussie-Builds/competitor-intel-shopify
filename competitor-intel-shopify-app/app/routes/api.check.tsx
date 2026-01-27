import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { checkPage, checkCompetitor } from "~/services/monitor.server";

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

      const result = await checkPage(pageId);

      return json({
        success: true,
        result: {
          isFirstSnapshot: result.isFirstSnapshot,
          hasChange: !!result.change,
          significance: result.change?.significance || null,
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

      return json({
        success: true,
        result: {
          checked: result.checked,
          changes: result.changes,
        },
      });
    }

    return json(
      { success: false, error: "Either competitorId or pageId is required" },
      { status: 400 }
    );
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
