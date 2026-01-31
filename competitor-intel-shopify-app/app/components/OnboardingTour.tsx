import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "@remix-run/react";
import { Card, BlockStack, Text, Button, InlineStack } from "@shopify/polaris";

interface TourStep {
  targetId: string;
  title: string;
  content: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: "btn-add-competitor",
    title: "Add Your First Competitor",
    content:
      "Click here to add a competitor. Enter their name and website URL, and we'll start monitoring their pages for changes.",
  },
  {
    targetId: "card-last-auto-check",
    title: "Automatic Monitoring",
    content:
      "We automatically check your competitors' pages on a schedule. You'll see when the last check ran here. Configure the frequency in Settings.",
  },
];

interface OnboardingTourProps {
  active: boolean;
  onComplete: () => void;
}

interface TooltipPosition {
  top: number;
  left: number;
}

export function OnboardingTour({ active, onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const fetcher = useFetcher();
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Find and track target element
  useEffect(() => {
    if (!active || currentStep >= TOUR_STEPS.length) {
      setTargetElement(null);
      setPosition(null);
      return;
    }

    const step = TOUR_STEPS[currentStep];

    const findAndPositionElement = () => {
      const element = document.getElementById(step.targetId);
      if (element) {
        setTargetElement(element);

        // Calculate position below the element
        const rect = element.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          left: Math.max(8, rect.left),
        });

        // Scroll element into view if needed
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    // Try immediately
    findAndPositionElement();

    // Also retry after a short delay for async-rendered elements
    const timeout = setTimeout(findAndPositionElement, 100);

    // Update position on scroll/resize
    const handlePositionUpdate = () => {
      const element = document.getElementById(step.targetId);
      if (element) {
        const rect = element.getBoundingClientRect();
        setPosition({
          top: rect.bottom + 8,
          left: Math.max(8, rect.left),
        });
      }
    };

    window.addEventListener("scroll", handlePositionUpdate, true);
    window.addEventListener("resize", handlePositionUpdate);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", handlePositionUpdate, true);
      window.removeEventListener("resize", handlePositionUpdate);
    };
  }, [active, currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Tour complete - mark as done on server
      fetcher.submit(null, {
        method: "POST",
        action: "/api/shop/tour",
      });
      onComplete();
    }
  }, [currentStep, fetcher, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    // Mark tour as complete even when skipping
    fetcher.submit(null, {
      method: "POST",
      action: "/api/shop/tour",
    });
    onComplete();
  }, [fetcher, onComplete]);

  if (!active || !targetElement || !position || currentStep >= TOUR_STEPS.length) {
    return null;
  }

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Render tooltip using portal for proper positioning
  return createPortal(
    <>
      {/* Highlight overlay for target element */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          zIndex: 999,
          pointerEvents: "none",
        }}
      />
      {/* Cutout for target element */}
      <div
        style={{
          position: "fixed",
          top: targetElement.getBoundingClientRect().top - 4,
          left: targetElement.getBoundingClientRect().left - 4,
          width: targetElement.getBoundingClientRect().width + 8,
          height: targetElement.getBoundingClientRect().height + 8,
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 0 0 4px rgba(59, 130, 246, 0.5)",
          zIndex: 1000,
          pointerEvents: "none",
        }}
      />
      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          maxWidth: "340px",
          zIndex: 1001,
        }}
      >
        <Card>
          <BlockStack gap="300">
            <Text as="h3" variant="headingMd">
              {step.title}
            </Text>
            <Text as="p">{step.content}</Text>
            <InlineStack align="space-between">
              <Text as="span" tone="subdued" variant="bodySm">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </Text>
              <InlineStack gap="200">
                {!isFirstStep && (
                  <Button onClick={handleBack} variant="plain">
                    Back
                  </Button>
                )}
                <Button onClick={handleSkip} variant="plain">
                  Skip
                </Button>
                <Button onClick={handleNext} variant="primary">
                  {isLastStep ? "Finish" : "Next"}
                </Button>
              </InlineStack>
            </InlineStack>
          </BlockStack>
        </Card>
      </div>
    </>,
    document.body
  );
}
