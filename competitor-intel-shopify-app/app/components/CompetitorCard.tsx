import {
  Box,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Button,
} from "@shopify/polaris";

interface CompetitorCardProps {
  competitor: {
    id: string;
    name: string;
    websiteUrl: string;
    active: boolean;
    pages: {
      id: string;
      label: string;
      url: string;
      lastChecked: string | null;
      _count: {
        changes: number;
      };
    }[];
  };
  maxPagesPerCompetitor: number;
  onClick: () => void;
}

export function CompetitorCard({
  competitor,
  maxPagesPerCompetitor,
  onClick,
}: CompetitorCardProps) {
  const pageCount = competitor.pages.length;
  const totalChanges = competitor.pages.reduce(
    (sum, page) => sum + page._count.changes,
    0
  );

  const lastChecked = competitor.pages
    .filter((p) => p.lastChecked)
    .map((p) => new Date(p.lastChecked!))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <Box
      padding="400"
      background="bg-surface-secondary"
      borderRadius="200"
      borderWidth="025"
      borderColor="border"
    >
      <InlineStack align="space-between" blockAlign="center">
        <BlockStack gap="100">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" variant="headingSm">
              {competitor.name}
            </Text>
            {!competitor.active && <Badge tone="warning">Paused</Badge>}
          </InlineStack>
          <Text as="span" tone="subdued" variant="bodySm">
            {competitor.websiteUrl}
          </Text>
          <InlineStack gap="300">
            <Text as="span" tone="subdued" variant="bodySm">
              {pageCount} page{pageCount !== 1 ? "s" : ""}
              {maxPagesPerCompetitor !== Infinity &&
                ` / ${maxPagesPerCompetitor}`}
            </Text>
            <Text as="span" tone="subdued" variant="bodySm">
              {totalChanges} change{totalChanges !== 1 ? "s" : ""}
            </Text>
            {lastChecked && (
              <Text as="span" tone="subdued" variant="bodySm">
                Last checked: {lastChecked.toLocaleDateString()}
              </Text>
            )}
          </InlineStack>
        </BlockStack>
        <Button onClick={onClick}>View Details</Button>
      </InlineStack>
    </Box>
  );
}
