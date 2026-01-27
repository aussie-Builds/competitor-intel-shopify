import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  console.log(`[GDPR] Customer redact request received for shop: ${shop}`);

  // This app doesn't store customer data, so we just acknowledge
  // the request without taking any action.

  return new Response(null, { status: 200 });
};
