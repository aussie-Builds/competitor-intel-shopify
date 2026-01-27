import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  console.log(`[GDPR] Shop redact request received for shop: ${shop}`);

  // Delete all shop data as required by GDPR
  const shopRecord = await prisma.shop.findUnique({
    where: { shopDomain: shop },
  });

  if (shopRecord) {
    // Cascade delete will remove all related data
    await prisma.shop.delete({
      where: { id: shopRecord.id },
    });
    console.log(`[GDPR] All data redacted for shop: ${shop}`);
  }

  // Also clean up any orphaned sessions
  await prisma.session.deleteMany({
    where: { shop },
  });

  return new Response(null, { status: 200 });
};
