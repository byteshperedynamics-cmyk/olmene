"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/**
 * Last-resort boundary (the root layout itself failed). It replaces the whole
 * document, so it carries its own minimal styles: no globals.css, no fonts.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    reportClientError(error.digest ? `${error.message} (digest ${error.digest})` : error, "boundary");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#09090B", color: "#FAFAFA", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong — Olmene</title>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, fontWeight: 500, margin: "0 0 12px" }}>Olmene hit a problem.</h1>
          <p style={{ color: "#A1A1AA", lineHeight: 1.6, margin: "0 0 24px" }}>It has been reported to us. Trying again usually works.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: "#FFFFFF", color: "#09090B", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
