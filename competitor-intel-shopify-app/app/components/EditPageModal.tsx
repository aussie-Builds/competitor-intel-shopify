import { useState, useCallback, useEffect } from "react";
import {
  Modal,
  FormLayout,
  TextField,
  Banner,
  BlockStack,
} from "@shopify/polaris";

interface EditPageModalProps {
  open: boolean;
  onClose: () => void;
  page: {
    id: string;
    url: string;
    label: string;
  } | null;
  onSuccess?: () => void;
}

export function EditPageModal({
  open,
  onClose,
  page,
  onSuccess,
}: EditPageModalProps) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<{ url?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Initialize form values when page changes or modal opens
  useEffect(() => {
    if (page && open) {
      setUrl(page.url);
      setLabel(page.label);
      setErrors({});
      setApiError(null);
    }
  }, [page, open]);

  const handleClose = useCallback(() => {
    setUrl("");
    setLabel("");
    setErrors({});
    setApiError(null);
    onClose();
  }, [onClose]);

  const validateUrl = (urlString: string): boolean => {
    try {
      const parsed = new URL(urlString);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!page) return;

    const newErrors: { url?: string } = {};

    if (!url.trim()) {
      newErrors.url = "URL is required";
    } else if (!validateUrl(url)) {
      newErrors.url = "Please enter a valid URL (http or https)";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          label: label.trim() || "Homepage",
        }),
      });

      const data = await response.json();

      if (data.success) {
        onSuccess?.();
        handleClose();
      } else {
        setApiError(data.error || "Failed to update page");
      }
    } catch (error) {
      setApiError("Failed to update page. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page, url, label, onSuccess, handleClose]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Edit Monitored Page"
      primaryAction={{
        content: "Save",
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
          {apiError && <Banner tone="critical">{apiError}</Banner>}

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
              label="Label"
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
