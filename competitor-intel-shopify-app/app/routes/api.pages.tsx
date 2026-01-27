import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { canAddPage, getPlanLimits } from "~/services/billing.server";

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
    const url = formData.get("url") as string;
    const competitorId = formData.get("competitorId") as string;
    const label = (formData.get("label") as string) || "Page";

    if (!url || !competitorId) {
      return json(
        { success: false, error: "URL and competitor ID are required" },
        { status: 400 }
      );
    }

    // Verify competitor belongs to shop
    const competitor = await prisma.competitor.findFirst({
      where: {
        id: competitorId,
        shopId: shop.id,
      },
      include: {
        _count: {
          select: { pages: true },
        },
      },
    });

    if (!competitor) {
      return json(
        { success: false, error: "Competitor not found" },
        { status: 404 }
      );
    }

    // Check plan limits
    if (!canAddPage(shop.plan, competitor._count.pages)) {
      return json(
        {
          success: false,
          error: `You've reached your plan's page limit (${getPlanLimits(shop.plan).maxPagesPerCompetitor} per competitor). Please upgrade to add more pages.`,
        },
        { status: 403 }
      );
    }

    // Check for duplicate URL
    const existingPage = await prisma.page.findFirst({
      where: {
        competitorId,
        url,
      },
    });

    if (existingPage) {
      return json(
        { success: false, error: "This page URL is already being monitored" },
        { status: 400 }
      );
    }

    // Create page
    const page = await prisma.page.create({
      data: {
        competitorId,
        url,
        label: label || generateLabelFromUrl(url),
      },
    });

    return json({ success: true, page });
  }

  return json({ success: false, error: "Method not allowed" }, { status: 405 });
};

function generateLabelFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.pathname === "/" || parsedUrl.pathname === "") {
      return "Homepage";
    }
    // Convert /pricing to "Pricing", /about-us to "About Us"
    return parsedUrl.pathname
      .replace(/^\//, "")
      .replace(/\/$/, "")
      .split("/")
      .pop()!
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return "Page";
  }
}
