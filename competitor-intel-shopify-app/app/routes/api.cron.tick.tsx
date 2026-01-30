import { json, type ActionFunctionArgs } from "@remix-run/node";
import { runScheduledChecks } from "~/services/scheduler.server";

// External cron endpoint for Render Cron Jobs.
//
// FOLLOW-UP OPTION: If in-process node-cron timers are unreliable on Render
// (e.g., free tier spinning down), use this endpoint with a Render Cron Job:
//
// 1. Create a Render Cron Job in the Render dashboard
// 2. Set schedule to every 5 minutes
// 3. Set command to: curl -X POST YOUR_APP_URL/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"
// 4. Add CRON_SECRET env var to both the Cron Job and Web Service
//
// Security: Requires CRON_SECRET env var to match Authorization header.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Verify CRON_SECRET for security
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.log("[CRON] /api/cron/tick called but CRON_SECRET not configured");
    return json({ error: "Cron endpoint not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("Authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (providedSecret !== cronSecret) {
    console.log("[CRON] /api/cron/tick unauthorized request");
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[CRON] /api/cron/tick triggered via external request");

  try {
    await runScheduledChecks();
    return json({ success: true, message: "Scheduled checks completed" });
  } catch (error) {
    console.error("[CRON] Error in /api/cron/tick:", error);
    return json(
      { success: false, error: "Failed to run scheduled checks" },
      { status: 500 }
    );
  }
};

// Disallow GET requests
export const loader = () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};
