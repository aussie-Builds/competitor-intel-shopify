import { useState } from "react";
import { Box, BlockStack, InlineStack, Text, Badge, Button, Modal, Scrollable } from "@shopify/polaris";
import { Link } from "@remix-run/react";

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
      id: string;
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
  const [selectedChange, setSelectedChange] = useState<Change | null>(null);

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

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + "...";
  };

  const handleViewAnalysis = (change: Change) => {
    setSelectedChange(change);
  };

  return (
    <>
      <BlockStack gap="300">
        {changes.map((change) => (
          <Link
            key={change.id}
            to={`/app/competitors/${change.page.competitor.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
            aria-label={`View details for ${change.page.competitor.name} - ${change.page.label}`}
          >
            <Box
              padding="300"
              background="bg-surface-secondary"
              borderRadius="200"
            >
              <div style={{ cursor: "pointer" }}>
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
                  {change.aiAnalysis && (
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {truncateText(change.aiAnalysis, 240)}
                      </Text>
                      {change.aiAnalysis.length > 240 && (
                        <div
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleViewAnalysis(change);
                          }}
                        >
                          <Button variant="plain" size="slim">
                            View full analysis
                          </Button>
                        </div>
                      )}
                    </BlockStack>
                  )}
                </BlockStack>
              </div>
            </Box>
          </Link>
        ))}
      </BlockStack>

      <Modal
        open={selectedChange !== null}
        onClose={() => setSelectedChange(null)}
        title={
          selectedChange
            ? `${selectedChange.page.competitor.name} — ${selectedChange.page.label}`
            : ""
        }
        secondaryActions={[
          {
            content: "Close",
            onAction: () => setSelectedChange(null),
          },
        ]}
      >
        <Modal.Section>
          <Scrollable style={{ maxHeight: "400px" }}>
            <Text as="p" variant="bodyMd">
              <span style={{ whiteSpace: "pre-wrap" }}>
                {selectedChange?.aiAnalysis}
              </span>
            </Text>
          </Scrollable>
        </Modal.Section>
      </Modal>
    </>
  );
}
