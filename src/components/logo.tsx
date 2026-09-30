import Link from "next/link";
import { APP_NAME } from "@/lib/config";
import { BrandMark } from "@/components/brand-mark";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 text-foreground ${className ?? ""}`}
      aria-label={`${APP_NAME} home`}
    >
      {/* Brand lockup — elm flower mark + lowercase serif wordmark.
          Inline SVG + live text: crisp at any DPR, themes with the site,
          no image request. The pre-rebrand wordmark raster (which read
          "Marketwise") was regenerated; the file now carries this brand
          and remains only as the JSON-LD/OG asset. */}
      <BrandMark size={26} className="text-primary" />
      <span className="font-display text-[1.4rem] font-semibold leading-none tracking-tight">
        olmene
      </span>
    </Link>
  );
}
