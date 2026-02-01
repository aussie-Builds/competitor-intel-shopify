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
  const fromEmail = process.env.ALERT_EMAIL_FROM || "Competitor Intel <onboarding@resend.dev>";

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

function trimAiAnalysis(text: string): string {
  // Check if text has bullet points (lines starting with - or •)
  const lines = text.split("\n").filter((line) => line.trim());
  const bulletLines = lines.filter((line) => /^\s*[-•*]\s/.test(line));

  if (bulletLines.length >= 3) {
    // Take first 3 bullet points
    const firstThree = bulletLines.slice(0, 3).join("\n");
    if (bulletLines.length > 3) {
      return firstThree + "\n...";
    }
    return firstThree;
  }

  // Otherwise trim to 400 chars
  if (text.length <= 400) return text;
  return text.slice(0, 400).trim() + "...";
}

function generateEmailHtml(changes: ChangeNotification[]): string {
  const appUrl = process.env.SHOPIFY_APP_URL || "https://admin.shopify.com";

  const changeItems = changes
    .map((change) => {
      const significanceColor: Record<string, string> = {
        high: "#dc2626",
        medium: "#f59e0b",
        low: "#10b981",
      };
      const color = significanceColor[change.significance] || "#6b7280";
      const aiSummary = change.aiAnalysis ? trimAiAnalysis(change.aiAnalysis) : null;

      return `
      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <table style="width: 100%; margin-bottom: 8px;">
          <tr>
            <td style="vertical-align: top;">
              <h3 style="margin: 0; color: #111827; font-size: 16px;">${escapeHtml(change.competitorName)}</h3>
              <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;">${escapeHtml(change.pageLabel)}</p>
            </td>
            <td style="text-align: right; vertical-align: top;">
              <span style="background: ${color}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; text-transform: uppercase; font-weight: 600;">
                ${change.significance}
              </span>
            </td>
          </tr>
        </table>
        ${change.changeSummary ? `<p style="margin: 0 0 8px 0; color: #111827; font-size: 14px;">${escapeHtml(change.changeSummary)}</p>` : ""}
        ${aiSummary ? `<p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; white-space: pre-wrap;">${escapeHtml(aiSummary)}</p>` : ""}
        <p style="margin: 8px 0 0 0; font-size: 12px;">
          <a href="${escapeHtml(change.pageUrl)}" style="color: #2563eb;">View page</a>
          <span style="color: #d1d5db; margin: 0 8px;">|</span>
          <span style="color: #9ca3af;">${change.detectedAt.toLocaleString()}</span>
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
        <h1 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">
          Competitor Intel Alert
        </h1>
        <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 14px;">
          ${changes.length} change(s) detected across your monitored competitors.
        </p>
        ${changeItems}
        <div style="text-align: center; margin-top: 20px;">
          <a href="${appUrl}/app" style="display: inline-block; background: #111827; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
            View in Competitor Intel
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0; text-align: center;">
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
