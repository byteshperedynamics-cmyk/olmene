import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 ${className ?? ""}`}
      aria-label={`${APP_NAME} home`}
    >
      {/* Full brand lockup — flower mark + Olmene wordmark.
          Black on light; inverted to warm cream in dark mode.
          480x96 WebP (9KB) serves the h-8 display up to 3x DPR — the old
          1280x257 PNG was 68KB for the same 159x32 box. */}
      <img
        src="/img/logo-full-480.webp"
        alt={APP_NAME}
        width={480}
        height={96}
        className="h-8 w-auto dark:invert"
      />
    </Link>
  );
}
