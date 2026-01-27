import { Box, BlockStack, InlineStack, Text, Badge } from "@shopify/polaris";

interface Change {
  id: string;
  significance: string;
  changeSummary: string | null;
  aiAnalysis: string | null;
  detectedAt: string;
  page: {
    label: string;
    url: string;
    competitor: {
      name: string;
    };
  };
}

interface ChangeListProps {
  changes: Change[];
  showCompetitorName?: boolean;
}

export function ChangeList({
  changes,
  showCompetitorName = true,
}: ChangeListProps) {
  const getSignificanceTone = (significance: string) => {
    switch (significance) {
      case "high":
        return "critical";
      case "medium":
        return "warning";
      case "low":
        return "success";
      default:
        return "info";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) {
      return "Just now";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <BlockStack gap="300">
      {changes.map((change) => (
        <Box
          key={change.id}
          padding="300"
          background="bg-surface-secondary"
          borderRadius="200"
        >
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="start">
              <BlockStack gap="100">
                {showCompetitorName && (
                  <Text as="span" variant="headingSm">
                    {change.page.competitor.name}
                  </Text>
                )}
                <Text as="span" tone="subdued" variant="bodySm">
                  {change.page.label}
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Badge tone={getSignificanceTone(change.significance)}>
                  {change.significance}
                </Badge>
                <Text as="span" tone="subdued" variant="bodySm">
                  {formatDate(change.detectedAt)}
                </Text>
              </InlineStack>
            </InlineStack>
            {change.changeSummary && (
              <Text as="p" variant="bodySm">
                {change.changeSummary}
              </Text>
            )}
          </BlockStack>
        </Box>
      ))}
    </BlockStack>
  );
}
