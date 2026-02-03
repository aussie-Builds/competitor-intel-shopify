import { useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { Modal, Text, BlockStack, List } from "@shopify/polaris";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
  onShowMeAround: () => void;
}

export function WelcomeModal({
  open,
  onClose,
  onShowMeAround,
}: WelcomeModalProps) {
  const fetcher = useFetcher();

  const markOnboardingSeen = useCallback(() => {
    fetcher.submit(null, {
      method: "POST",
      action: "/api/shop/onboarding",
    });
  }, [fetcher]);

  const handleSkip = useCallback(() => {
    markOnboardingSeen();
    onClose();
  }, [markOnboardingSeen, onClose]);

  const handleShowMeAround = useCallback(() => {
    markOnboardingSeen();
    onShowMeAround();
  }, [markOnboardingSeen, onShowMeAround]);

  return (
    <Modal
      open={open}
      onClose={handleSkip}
      title="Welcome to Competitor Intel"
      primaryAction={{
        content: "Show me around",
        onAction: handleShowMeAround,
      }}
      secondaryActions={[
        {
          content: "Skip for now",
          onAction: handleSkip,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p">
            Competitor Intel helps you stay ahead by automatically monitoring
            your competitors' websites for changes. Get notified when they
            update pricing, launch new products, or change their messaging.
          </Text>
          <Text as="p">
            To get started, add your first competitor and select the pages you
            want to track. We'll handle the rest and alert you to important
            updates.
          </Text>
          <Text as="p" fontWeight="semibold">
            Here's what you can do:
          </Text>
          <List>
            <List.Item>Track competitor pricing and product pages</List.Item>
            <List.Item>Get AI-powered change summaries</List.Item>
            <List.Item>Receive email alerts for significant updates</List.Item>
          </List>
          <Text as="p" tone="subdued" variant="bodySm">
            This beta focuses on reliable change detection and timely alerts.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
