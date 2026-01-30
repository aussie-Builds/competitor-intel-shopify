import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

// Dev store domain for gating dev tools
const DEV_STORE_DOMAIN = "review-tool-demo.myshopify.com";

/**
 * Force-run the scheduler for this shop immediately.
 * This resets lastAutoCheckAt to null, making the shop due for check
 * on the next cron tick.
 *
 * Requires DEBUG_TOOLS=true in Render env vars.
 * Only accessible from the dev store (review-tool-demo.myshopify.com).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Gate: Requires DEBUG_TOOLS=true env var
  if (process.env.DEBUG_TOOLS !== "true") {
    return json(
      { success: false, error: "Dev tools not enabled" },
      { status: 403 }
    );
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Gate: Only allow from dev store
  if (shopDomain !== DEV_STORE_DOMAIN) {
    return json(
      { success: false, error: "Dev tools not available for this store" },
      { status: 403 }
    );
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

  // Reset lastAutoCheckAt to make shop due for check
  await prisma.shop.update({
    where: { id: shop.id },
    data: { lastAutoCheckAt: null },
  });

  console.log(`[DEV] Force-check triggered for shop ${shop.id} - lastAutoCheckAt reset to null`);

  return json({
    success: true,
    message: "Marked due. Cron will run on next 5-min tick.",
    shopId: shop.id,
  });
};
