import { useState, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Modal,
  FormLayout,
  TextField,
  Banner,
  BlockStack,
} from "@shopify/polaris";

interface AddCompetitorModalProps {
  open: boolean;
  onClose: () => void;
  shopId: string;
}

export function AddCompetitorModal({
  open,
  onClose,
  shopId,
}: AddCompetitorModalProps) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [initialPageUrl, setInitialPageUrl] = useState("");
  const [errors, setErrors] = useState<{ name?: string; websiteUrl?: string }>(
    {}
  );

  const isLoading = fetcher.state !== "idle";

  const handleClose = useCallback(() => {
    setName("");
    setWebsiteUrl("");
    setInitialPageUrl("");
    setErrors({});
    onClose();
  }, [onClose]);

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(() => {
    const newErrors: { name?: string; websiteUrl?: string } = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!websiteUrl.trim()) {
      newErrors.websiteUrl = "Website URL is required";
    } else if (!validateUrl(websiteUrl)) {
      newErrors.websiteUrl = "Please enter a valid URL";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("websiteUrl", websiteUrl.trim());
    formData.append("shopId", shopId);
    if (initialPageUrl.trim()) {
      formData.append("initialPageUrl", initialPageUrl.trim());
    }

    fetcher.submit(formData, {
      method: "POST",
      action: "/api/competitors",
    });
  }, [name, websiteUrl, initialPageUrl, shopId, fetcher]);

  // Handle successful submission
  if (fetcher.data?.success && fetcher.state === "idle") {
    handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add Competitor"
      primaryAction={{
        content: "Add Competitor",
        onAction: handleSubmit,
        loading: isLoading,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: handleClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {fetcher.data?.error && (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          )}

          <FormLayout>
            <TextField
              label="Competitor Name"
              value={name}
              onChange={(value) => {
                setName(value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              placeholder="e.g., Acme Corp"
              autoComplete="off"
              error={errors.name}
            />

            <TextField
              label="Website URL"
              value={websiteUrl}
              onChange={(value) => {
                setWebsiteUrl(value);
                setErrors((prev) => ({ ...prev, websiteUrl: undefined }));
              }}
              placeholder="https://example.com"
              autoComplete="off"
              error={errors.websiteUrl}
              helpText="The main website URL for this competitor"
            />

            <TextField
              label="Initial Page to Monitor (Optional)"
              value={initialPageUrl}
              onChange={setInitialPageUrl}
              placeholder="https://example.com/pricing"
              autoComplete="off"
              helpText="Add a specific page to start monitoring. You can add more pages later."
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
