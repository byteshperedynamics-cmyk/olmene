"use client";

import { useEffect, useState } from "react";
import { ClientPortal } from "@/components/agency/client-portal";
import type { PortalView } from "@/lib/agency/types";
import { SITE_GROWING, SITE_NEW } from "../account/fixtures";
import { BRAND, NO_BRAND } from "../clients/fixtures";

const SITES = [
  { ...SITE_GROWING, siteId: "s1", host: "bakerybrothers.example", url: "https://bakerybrothers.example/" },
  { ...SITE_NEW, siteId: "s2", host: "shop.bakerybrothers.example", url: "https://shop.bakerybrothers.example/" },
];

/** ?state=wl: white label; plain: the agency hasn't set up branding; name: name only, no logo; empty: no sites yet; gone: link turned off. */
export function PortalPreview() {
  const [view, setView] = useState<PortalView | null | undefined>(undefined);
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("state");
    const client = { name: "Bakery Brothers" };
    setView(
      s === "gone"
        ? null
        : s === "plain"
          ? { client, brand: NO_BRAND, sites: SITES }
          : s === "name"
            ? { client, brand: { ...BRAND, logoUrl: null }, sites: SITES }
            : s === "empty"
              ? { client, brand: BRAND, sites: [] }
              : { client, brand: { ...BRAND, whiteLabel: s === "wl" }, sites: SITES },
    );
  }, []);
  if (view === undefined) return null;
  return <ClientPortal view={view} />;
}
