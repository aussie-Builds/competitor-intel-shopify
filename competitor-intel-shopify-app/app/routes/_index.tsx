import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { login, LoginErrorType } from "~/shopify.server";

import styles from "~/styles/login.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If this is a Shopify embedded app request (has shop or host param), redirect to /app
  // The /app route will handle authentication
  if (url.searchParams.get("shop") || url.searchParams.get("host")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // No shop param - show login form for direct access
  const errors = await login(request);

  // Convert server-only enum to plain string for client
  let errorMessage: string | null = null;
  if (errors?.shop === LoginErrorType.MissingShop) {
    errorMessage = "Please enter your shop domain";
  } else if (errors?.shop === LoginErrorType.InvalidShop) {
    errorMessage = "Please enter a valid shop domain";
  }

  return json({ errorMessage });
};

export default function App() {
  const { errorMessage } = useLoaderData<typeof loader>();

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>Competitor Intel</h1>
        <p className={styles.subtitle}>
          Monitor your competitors and get AI-powered insights on their changes.
        </p>
        <Form method="post" action="/auth/login">
          <label className={styles.label}>
            <span>Shop domain</span>
            <input
              className={styles.input}
              type="text"
              name="shop"
              placeholder="my-shop.myshopify.com"
            />
          </label>
          {errorMessage && <p className={styles.error}>{errorMessage}</p>}
          <button className={styles.button} type="submit">
            Log in
          </button>
        </Form>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <h1>Error {error.status}</h1>
        <p>{error.statusText}</p>
        <p>{error.data}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>Error</h1>
      <p>{error instanceof Error ? error.message : "An unexpected error occurred"}</p>
    </div>
  );
}
