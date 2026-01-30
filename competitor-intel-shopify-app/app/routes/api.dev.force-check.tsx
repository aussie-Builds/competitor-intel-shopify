import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * DEV ONLY: Force-run the scheduler for this shop immediately.
 * This resets lastAutoCheckAt to null, making the shop due for check
 * on the next cron tick.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return json(
      { success: false, error: "This endpoint is only available in development" },
      { status: 403 }
    );
  }

  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

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
    message: "Shop marked as due for check. Will run on next cron tick (every 5 minutes).",
    shopId: shop.id,
  });
};
