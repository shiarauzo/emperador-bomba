"use client";

import { Portal } from "@portalsdk/core";
import { PortalProvider } from "@portalsdk/react";
import type { ReactNode } from "react";

// Anonymous mode: the publishable key is all we need. The SDK mints and manages
// its own anonymous credential and keeps one stable identity across refreshes.
// To log real users in later, pass `token` to PortalProvider (or portal.setToken).
const portal = new Portal({
  apiKey: process.env.NEXT_PUBLIC_PORTAL_KEY as string,
});

export function Providers({ children }: { children: ReactNode }) {
  return <PortalProvider client={portal}>{children}</PortalProvider>;
}
