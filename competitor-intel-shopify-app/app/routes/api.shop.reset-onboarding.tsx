import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

// Dev store domain for gating dev tools
const DEV_STORE_DOMAIN = "review-tool-demo.myshopify.com";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Only allow for dev store when DEBUG_TOOLS is enabled
  if (process.env.DEBUG_TOOLS !== "true" || shopDomain !== DEV_STORE_DOMAIN) {
    return json({ success: false, error: "Not authorized" }, { status: 403 });
  }

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      hasSeenOnboarding: false,
      hasCompletedTour: false,
    },
  });

  return json({ success: true });
};
