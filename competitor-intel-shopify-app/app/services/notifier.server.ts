import { Resend } from "resend";

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!resend && process.env.RESEND_API_KEY) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface ChangeNotification {
  id: string;
  competitorName: string;
  pageLabel: string;
  pageUrl: string;
  significance: string;
  aiAnalysis?: string;
  changeSummary?: string;
  detectedAt: Date;
}

export interface NotifyResult {
  sent: boolean;
  id?: string;
  reason?: string;
}

export async function sendChangeAlert(
  changes: ChangeNotification[],
  recipientEmail: string
): Promise<NotifyResult> {
  console.log(
    `[Notifier] sendChangeAlert called with ${changes.length} change(s)`
  );

  const client = getClient();

  if (!client) {
    console.log(
      "[Notifier] Email notifications disabled - Resend API key not configured"
    );
    return { sent: false, reason: "not_configured" };
  }

  if (!recipientEmail) {
    console.log(
      "[Notifier] Email notifications disabled - recipient not configured"
    );
    return { sent: false, reason: "no_recipient" };
  }

  const highPriority = changes.filter((c) => c.significance === "high");
  const subject =
    highPriority.length > 0
      ? `[URGENT] ${highPriority.length} high-priority competitor changes detected`
      : `${changes.length} competitor change(s) detected`;

  console.log(`[Notifier] Sending email to ${recipientEmail}`);
  console.log(`[Notifier] Subject: ${subject}`);

  const html = generateEmailHtml(changes);
  const fromEmail = process.env.ALERT_EMAIL_FROM || "alerts@competitor-intel.com";

  try {
    const result = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject,
      html,
    });

    console.log(`[Notifier] Email sent successfully! ID: ${result.data?.id}`);
    return { sent: true, id: result.data?.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Notifier] Email send error:", message);
    return { sent: false, reason: message };
  }
}

function generateEmailHtml(changes: ChangeNotification[]): string {
  const changeItems = changes
    .map((change) => {
      const significanceColor: Record<string, string> = {
        high: "#dc2626",
        medium: "#f59e0b",
        low: "#10b981",
      };
      const color = significanceColor[change.significance] || "#6b7280";

      return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #111827;">${change.competitorName} - ${change.pageLabel}</h3>
          <span style="background: ${color}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; text-transform: uppercase;">
            ${change.significance}
          </span>
        </div>
        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
          <a href="${change.pageUrl}" style="color: #2563eb;">${change.pageUrl}</a>
        </p>
        <div style="background: #f9fafb; padding: 12px; border-radius: 4px; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">
${escapeHtml(change.aiAnalysis || change.changeSummary || "No details available")}
        </div>
        <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 12px;">
          Detected: ${change.detectedAt.toLocaleString()}
        </p>
      </div>
    `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f3f4f6;">
      <div style="background: white; border-radius: 12px; padding: 24px;">
        <h1 style="color: #111827; margin: 0 0 24px 0; font-size: 24px;">
          Competitor Intel Alert
        </h1>
        <p style="color: #6b7280; margin: 0 0 24px 0;">
          ${changes.length} change(s) detected across your monitored competitors.
        </p>
        ${changeItems}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
          Competitor Intel - AI-Powered Competitive Monitoring for Shopify
        </p>
      </div>
    </body>
    </html>
  `;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
