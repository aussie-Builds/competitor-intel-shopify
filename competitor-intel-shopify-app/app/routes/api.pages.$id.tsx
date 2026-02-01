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
    const { label, active, url } = body;

    // If URL is being updated, validate it
    if (url !== undefined) {
      const trimmedUrl = url.trim();

      // Validate URL is a valid absolute URL
      try {
        const parsedUrl = new URL(trimmedUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          return json(
            { success: false, error: "URL must use http or https protocol" },
            { status: 400 }
          );
        }
      } catch {
        return json(
          { success: false, error: "Please enter a valid URL" },
          { status: 400 }
        );
      }

      // Check for duplicate URL under the same competitor (excluding current page)
      if (trimmedUrl !== page.url) {
        const existingPage = await prisma.page.findFirst({
          where: {
            competitorId: page.competitorId,
            url: trimmedUrl,
            id: { not: pageId },
          },
        });

        if (existingPage) {
          return json(
            { success: false, error: "This URL is already being monitored for this competitor" },
            { status: 400 }
          );
        }
      }
    }

    const updatedPage = await prisma.page.update({
      where: { id: pageId },
      data: {
        ...(label !== undefined && { label }),
        ...(active !== undefined && { active }),
        ...(url !== undefined && { url: url.trim() }),
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
