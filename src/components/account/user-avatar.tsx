"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A person's picture, or their initials on a quiet steel disc when there is
 * none (or it fails to load). Decorative by default: the name is always
 * written next to it.
 */
export function UserAvatar({
  src,
  initials,
  size = 32,
  className,
  label,
}: {
  src: string | null | undefined;
  initials: string;
  size?: number;
  className?: string;
  /** Set when the avatar stands alone and needs a name for screen readers. */
  label?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full bg-secondary text-secondary-foreground ring-1 ring-rim",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {show ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="font-medium leading-none tracking-tight">{initials}</span>
      )}
    </span>
  );
}
