import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  if (!admin) {
    // The admin context isn't returned if the webhook fired after a shop uninstalled
    throw new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      // Clean up shop data when app is uninstalled
      if (session) {
        console.log(`[Webhook] APP_UNINSTALLED for ${shop}`);

        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
        });

        if (shopRecord) {
          // Delete shop and all related data (cascade will handle competitors, pages, etc.)
          await prisma.shop.delete({
            where: { id: shopRecord.id },
          });
          console.log(`[Webhook] Cleaned up data for shop: ${shop}`);
        }

        // Also delete the session
        await prisma.session.deleteMany({
          where: { shop },
        });
      }
      break;

    case "CUSTOMERS_DATA_REQUEST":
      // GDPR: Customer data request
      // This app doesn't store customer data, so we just acknowledge the request
      console.log(`[Webhook] CUSTOMERS_DATA_REQUEST for ${shop}`);
      break;

    case "CUSTOMERS_REDACT":
      // GDPR: Customer data deletion request
      // This app doesn't store customer data, so we just acknowledge the request
      console.log(`[Webhook] CUSTOMERS_REDACT for ${shop}`);
      break;

    case "SHOP_REDACT":
      // GDPR: Shop data deletion request
      console.log(`[Webhook] SHOP_REDACT for ${shop}`);

      const shopToRedact = await prisma.shop.findUnique({
        where: { shopDomain: shop },
      });

      if (shopToRedact) {
        await prisma.shop.delete({
          where: { id: shopToRedact.id },
        });
        console.log(`[Webhook] Redacted all data for shop: ${shop}`);
      }
      break;

    default:
      console.log(`[Webhook] Unhandled topic: ${topic}`);
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};
