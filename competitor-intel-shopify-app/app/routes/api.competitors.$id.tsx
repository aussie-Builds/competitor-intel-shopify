import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const competitorId = params.id;

  if (!competitorId) {
    return json(
      { success: false, error: "Competitor ID is required" },
      { status: 400 }
    );
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  // Verify competitor belongs to shop
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

  if (request.method === "PUT") {
    const body = await request.json();
    const { name, websiteUrl, active } = body;

    const updatedCompetitor = await prisma.competitor.update({
      where: { id: competitorId },
      data: {
        ...(name !== undefined && { name }),
        ...(websiteUrl !== undefined && { websiteUrl }),
        ...(active !== undefined && { active }),
      },
    });

    return json({ success: true, competitor: updatedCompetitor });
  }

  if (request.method === "DELETE") {
    // Cascade delete will handle pages, snapshots, and changes
    await prisma.competitor.delete({
      where: { id: competitorId },
    });

    return json({ success: true });
  }

  return json({ success: false, error: "Method not allowed" }, { status: 405 });
};
