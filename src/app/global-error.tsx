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
      <head>
        <title>Something went wrong — Olmene</title>
        {/* Own minimal styles; light or dark follows the system setting. */}
        <style>{`
          body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#FAFAFA;color:#09090B}
          main{max-width:420px;padding:24px;text-align:center}
          h1{font-size:28px;font-weight:500;margin:0 0 12px}
          p{color:#52525B;line-height:1.6;margin:0 0 24px}
          button{background:#09090B;color:#FAFAFA;border:0;border-radius:8px;min-height:44px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer}
          button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
          @media (prefers-color-scheme: dark){body{background:#09090B;color:#FAFAFA}p{color:#A1A1AA}button{background:#FFFFFF;color:#09090B}}
        `}</style>
      </head>
      <body>
        <main>
          <h1>Olmene hit a problem.</h1>
          <p>Olmene logged the error. Trying again usually works.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
