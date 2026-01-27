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
} from "@shopify/polaris-icons";

interface DashboardStatsProps {
  totalCompetitors: number;
  maxCompetitors: number;
  totalPages: number;
  totalChanges: number;
  plan: string;
}

export function DashboardStats({
  totalCompetitors,
  maxCompetitors,
  totalPages,
  totalChanges,
  plan,
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
    </InlineStack>
  );
}
