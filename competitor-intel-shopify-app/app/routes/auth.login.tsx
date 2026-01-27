import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?shop=${shop}`);
  }

  throw redirect("/");
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = await login(request);

  // If login returns errors, return them to the form
  // If login succeeds, it will throw a redirect (never returns)
  return json({ errors });
};
