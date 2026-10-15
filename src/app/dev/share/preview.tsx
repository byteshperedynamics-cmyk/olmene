"use client";

import { PublicProgress, type PublicShareView } from "@/components/account/public-progress";
import { SITE_GROWING, SITE_NEW } from "../account/fixtures";
import { BRAND } from "../clients/fixtures";

/** ?state=new: a site checked once; anon: name hidden; gone: the link was turned off; agency / agency-wl: shared from an agency workspace. */
export function SharePreview({ state: s }: { state: string | null }) {
  const share: PublicShareView | null =
    s === "gone"
      ? null
      : s === "agency" || s === "agency-wl"
        ? { owner: { name: "Cleo Park", avatarUrl: null }, site: SITE_GROWING, brand: { ...BRAND, whiteLabel: s === "agency-wl" } }
        : s === "new"
          ? { owner: { name: "Ada Lovelace", avatarUrl: null }, site: SITE_NEW }
          : s === "anon"
            ? { owner: { name: null, avatarUrl: null }, site: SITE_GROWING }
            : { owner: { name: "Ada Lovelace", avatarUrl: null }, site: SITE_GROWING };
  return <PublicProgress share={share} />;
}
