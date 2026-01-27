import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const pageId = params.id;

  if (!pageId) {
    return json(
      { success: false, error: "Page ID is required" },
      { status: 400 }
    );
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    return json({ success: false, error: "Shop not found" }, { status: 404 });
  }

  // Verify page belongs to shop
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      competitor: {
        shopId: shop.id,
      },
    },
  });

  if (!page) {
    return json({ success: false, error: "Page not found" }, { status: 404 });
  }

  if (request.method === "PUT") {
    const body = await request.json();
    const { label, active } = body;

    const updatedPage = await prisma.page.update({
      where: { id: pageId },
      data: {
        ...(label !== undefined && { label }),
        ...(active !== undefined && { active }),
      },
    });

    return json({ success: true, page: updatedPage });
  }

  if (request.method === "DELETE") {
    // Cascade delete will handle snapshots and changes
    await prisma.page.delete({
      where: { id: pageId },
    });

    return json({ success: true });
  }

  return json({ success: false, error: "Method not allowed" }, { status: 405 });
};
