"use client";

import { useEffect } from "react";
import { installClientErrorReporter } from "@/lib/client-errors";

/** Mounted once in the root layout: sends uncaught browser errors to /api/ops/client-error. */
export function ErrorReporter() {
  useEffect(() => installClientErrorReporter(), []);
  return null;
}
