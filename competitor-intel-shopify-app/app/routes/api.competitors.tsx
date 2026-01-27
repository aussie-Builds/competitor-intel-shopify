import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { canAddCompetitor, getPlanLimits } from "~/services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const name = formData.get("name") as string;
    const websiteUrl = formData.get("websiteUrl") as string;
    const initialPageUrl = formData.get("initialPageUrl") as string | null;

    if (!name || !websiteUrl) {
      return json(
        { success: false, error: "Name and website URL are required" },
        { status: 400 }
      );
    }

    // Check plan limits
    const competitorCount = await prisma.competitor.count({
      where: { shopId: shop.id },
    });

    if (!canAddCompetitor(shop.plan, competitorCount)) {
      return json(
        {
          success: false,
          error: `You've reached your plan's competitor limit (${getPlanLimits(shop.plan).maxCompetitors}). Please upgrade to add more competitors.`,
        },
        { status: 403 }
      );
    }

    // Create competitor
    const competitor = await prisma.competitor.create({
      data: {
        shopId: shop.id,
        name,
        websiteUrl,
      },
    });

    // Add initial page if provided
    if (initialPageUrl) {
      try {
        const url = new URL(initialPageUrl);
        const label = url.pathname === "/" ? "Homepage" : url.pathname;

        await prisma.page.create({
          data: {
            competitorId: competitor.id,
            url: initialPageUrl,
            label,
          },
        });
      } catch {
        // Invalid URL, skip adding the page
      }
    }

    return json({ success: true, competitor });
  }

  return json({ success: false, error: "Method not allowed" }, { status: 405 });
};
