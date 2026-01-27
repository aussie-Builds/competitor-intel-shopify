import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  console.log(`[GDPR] Customer data request received for shop: ${shop}`);

  // This app doesn't store customer data, so we return an empty response.
  // If you stored customer data, you would return it here.

  return new Response(null, { status: 200 });
};
