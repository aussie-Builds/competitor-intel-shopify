import {
  Card,
  InlineStack,
  BlockStack,
  Text,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import {
  PersonIcon,
  PageIcon,
  AlertCircleIcon,
  ClockIcon,
} from "@shopify/polaris-icons";

interface DashboardStatsProps {
  totalCompetitors: number;
  maxCompetitors: number;
  totalPages: number;
  totalChanges: number;
  plan: string;
  lastAutoCheckAt?: string | null;
}

function formatTimeAgo(dateString: string | null | undefined): string {
  if (!dateString) return "Not run yet";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export function DashboardStats({
  totalCompetitors,
  maxCompetitors,
  totalPages,
  totalChanges,
  plan,
  lastAutoCheckAt,
}: DashboardStatsProps) {
  const competitorUsage = (totalCompetitors / maxCompetitors) * 100;

  return (
    <InlineStack gap="400" wrap={false}>
      <Card>
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">
              Competitors
            </Text>
            <Icon source={PersonIcon} tone="subdued" />
          </InlineStack>
          <Text as="p" variant="headingLg">
            {totalCompetitors} / {maxCompetitors}
          </Text>
          <ProgressBar
            progress={competitorUsage}
            tone={competitorUsage >= 90 ? "critical" : "primary"}
            size="small"
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">
              Pages Monitored
            </Text>
            <Icon source={PageIcon} tone="subdued" />
          </InlineStack>
          <Text as="p" variant="headingLg">
            {totalPages}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Across all competitors
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">
              Changes Detected
            </Text>
            <Icon source={AlertCircleIcon} tone="subdued" />
          </InlineStack>
          <Text as="p" variant="headingLg">
            {totalChanges}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Total all time
          </Text>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <InlineStack align="space-between">
            <Text as="span" tone="subdued">
              Last Auto Check
            </Text>
            <Icon source={ClockIcon} tone="subdued" />
          </InlineStack>
          <Text as="p" variant="headingLg">
            {formatTimeAgo(lastAutoCheckAt)}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            Scheduled monitoring
          </Text>
        </BlockStack>
      </Card>
    </InlineStack>
  );
}
