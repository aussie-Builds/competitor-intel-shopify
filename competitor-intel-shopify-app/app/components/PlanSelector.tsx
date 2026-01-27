import { useFetcher } from "@remix-run/react";
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Box,
  InlineGrid,
} from "@shopify/polaris";

interface Plan {
  name: string;
  key: string;
  price: number;
  competitors: number;
  pagesPerCompetitor: string;
  checkFrequency: string;
}

const PLANS: Plan[] = [
  {
    name: "Starter",
    key: "starter",
    price: 29,
    competitors: 3,
    pagesPerCompetitor: "5",
    checkFrequency: "Daily",
  },
  {
    name: "Pro",
    key: "pro",
    price: 79,
    competitors: 10,
    pagesPerCompetitor: "25",
    checkFrequency: "Hourly",
  },
  {
    name: "Business",
    key: "business",
    price: 149,
    competitors: 25,
    pagesPerCompetitor: "Unlimited",
    checkFrequency: "Every 15 min",
  },
];

interface PlanSelectorProps {
  currentPlan: string;
}

export function PlanSelector({ currentPlan }: PlanSelectorProps) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const handleSelectPlan = (planKey: string) => {
    const formData = new FormData();
    formData.append("plan", planKey);

    fetcher.submit(formData, {
      method: "POST",
      action: "/api/billing/subscribe",
    });
  };

  return (
    <InlineGrid columns={3} gap="400">
      {PLANS.map((plan) => {
        const isCurrent = plan.key === currentPlan.toLowerCase();
        const isUpgrade =
          PLANS.findIndex((p) => p.key === plan.key) >
          PLANS.findIndex((p) => p.key === currentPlan.toLowerCase());

        return (
          <Card key={plan.key}>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingMd">
                  {plan.name}
                </Text>
                {isCurrent && <Badge tone="success">Current</Badge>}
              </InlineStack>

              <BlockStack gap="100">
                <InlineStack gap="100" blockAlign="end">
                  <Text as="span" variant="headingXl">
                    ${plan.price}
                  </Text>
                  <Text as="span" tone="subdued">
                    /month
                  </Text>
                </InlineStack>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Text as="span" tone="subdued">
                    Competitors:
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {plan.competitors}
                  </Text>
                </InlineStack>

                <InlineStack gap="200">
                  <Text as="span" tone="subdued">
                    Pages/competitor:
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {plan.pagesPerCompetitor}
                  </Text>
                </InlineStack>

                <InlineStack gap="200">
                  <Text as="span" tone="subdued">
                    Check frequency:
                  </Text>
                  <Text as="span" fontWeight="semibold">
                    {plan.checkFrequency}
                  </Text>
                </InlineStack>
              </BlockStack>

              <Box paddingBlockStart="200">
                {isCurrent ? (
                  <Button disabled fullWidth>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant={isUpgrade ? "primary" : "secondary"}
                    onClick={() => handleSelectPlan(plan.key)}
                    loading={isLoading}
                    fullWidth
                  >
                    {isUpgrade ? "Upgrade" : "Downgrade"}
                  </Button>
                )}
              </Box>
            </BlockStack>
          </Card>
        );
      })}
    </InlineGrid>
  );
}
