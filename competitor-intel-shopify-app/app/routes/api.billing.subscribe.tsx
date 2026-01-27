import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate, BILLING_PLANS } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shopDomain = session.shop;

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const formData = await request.formData();
  const plan = formData.get("plan") as string;

  if (!plan || !["starter", "pro", "business"].includes(plan.toLowerCase())) {
    return new Response("Invalid plan", { status: 400 });
  }

  const planKey = plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase() as keyof typeof BILLING_PLANS;

  // Create billing subscription through Shopify
  const billingConfig = BILLING_PLANS[planKey as keyof typeof BILLING_PLANS];

  if (!billingConfig) {
    return new Response("Plan configuration not found", { status: 400 });
  }

  // Request subscription from Shopify
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { hasActivePayment } = await billing.check({
    plans: [planKey] as any,
    isTest: true, // Set to false in production
  });

  if (!hasActivePayment) {
    // Redirect to Shopify billing page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await billing.request({
      plan: planKey as any,
      isTest: true, // Set to false in production
    });

    // This will redirect the user to Shopify's billing approval page
    return response;
  }

  // If they already have an active payment, update the shop record
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (shop) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        plan: plan.toLowerCase(),
        planActivatedAt: new Date(),
      },
    });
  }

  return redirect("/app/settings");
};
