"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/client-errors";
import { Flower } from "@/components/v2/flower";

/**
 * Error boundary for every page under the root layout. Reports the error
 * (kind "boundary") and offers a retry. English only: the i18n provider may be
 * the thing that failed.
 */
export default function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error.digest ? `${error.message} (digest ${error.digest})` : error, "boundary");
  }, [error]);

  return (
    <main id="main-content" className="grid min-h-[70vh] place-items-center px-4 py-24">
      <div className="grid max-w-md justify-items-center gap-5 text-center">
        <Flower size={40} variant="static" />
        <p className="o-readout text-faint">error</p>
        <h1 className="o-display text-[32px] leading-[1.1] sm:text-[40px]">This page hit a problem.</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Olmene logged the error. Trying again usually works; if it doesn&apos;t, the rest of the site still does.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => retry()}>
            <RotateCw className="size-4" aria-hidden /> Try again
          </Button>
          <Button asChild size="lg" variant="hairline">
            <Link href="/">Go to the homepage</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
