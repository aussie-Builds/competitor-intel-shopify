import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Modal,
  FormLayout,
  TextField,
  Banner,
  BlockStack,
} from "@shopify/polaris";

interface AddPageModalProps {
  open: boolean;
  onClose: () => void;
  competitorId: string;
  competitorName: string;
  onSuccess?: () => void;
}

export function AddPageModal({
  open,
  onClose,
  competitorId,
  competitorName,
  onSuccess,
}: AddPageModalProps) {
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<{ url?: string }>({});

  const isLoading = fetcher.state !== "idle";

  const handleClose = useCallback(() => {
    setUrl("");
    setLabel("");
    setErrors({});
    onClose();
  }, [onClose]);

  const validateUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(() => {
    const newErrors: { url?: string } = {};

    if (!url.trim()) {
      newErrors.url = "URL is required";
    } else if (!validateUrl(url)) {
      newErrors.url = "Please enter a valid URL";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const formData = new FormData();
    formData.append("url", url.trim());
    formData.append("competitorId", competitorId);
    if (label.trim()) {
      formData.append("label", label.trim());
    }

    fetcher.submit(formData, {
      method: "POST",
      action: "/api/pages",
    });
  }, [url, label, competitorId, fetcher]);

  // Handle successful submission
  useEffect(() => {
    if (fetcher.data?.success && fetcher.state === "idle") {
      onSuccess?.();
      handleClose();
    }
  }, [fetcher.data?.success, fetcher.state, handleClose, onSuccess]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Add Page to ${competitorName}`}
      primaryAction={{
        content: "Add Page",
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
              label="Page URL"
              value={url}
              onChange={(value) => {
                setUrl(value);
                setErrors((prev) => ({ ...prev, url: undefined }));
              }}
              placeholder="https://example.com/pricing"
              autoComplete="off"
              error={errors.url}
              helpText="The specific page URL you want to monitor"
            />

            <TextField
              label="Label (Optional)"
              value={label}
              onChange={setLabel}
              placeholder="e.g., Pricing Page"
              autoComplete="off"
              helpText="A friendly name to identify this page"
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
