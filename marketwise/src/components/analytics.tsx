"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { GA_MEASUREMENT_ID } from "@/lib/config";
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  ensureGaQueued,
  pushConsentUpdate,
  readConsent,
  type ConsentValue,
} from "@/lib/consent";

/**
 * Runs before anything else (first element in <body>): sets up the gtag
 * dataLayer with Google Consent Mode v2 — analytics storage DENIED by default.
 * If the visitor already accepted on a previous visit, grant immediately (read
 * synchronously from localStorage) so the very first page_view is measured
 * with the granted state — and warm the connection to the tag host (only for
 * consenting visitors; fresh/rejected visitors get zero Google connections).
 * This is a plain string literal in the source, so the server bundler
 * (esbuild keepNames) never rewrites it — same safety pattern as the __name
 * guard in layout.tsx.
 */
const CONSENT_BOOT = `
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied'});
try{if(localStorage.getItem('${CONSENT_STORAGE_KEY}')==='accepted'){gtag('consent','update',{analytics_storage:'granted'});var pc=document.createElement('link');pc.rel='preconnect';pc.href='https://www.googletagmanager.com';document.head.appendChild(pc);}}catch(e){}
`.trim();

/**
 * Load gtag.js after the page is interactive and the main thread has spare
 * capacity — never during the load window, where it competes with LCP/TBT
 * (measured: +172KB and ~300ms of script eval on the critical path).
 */
function loadWhenIdle(arm: () => void) {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof ric === "function") {
    ric(arm, { timeout: 3000 });
  } else {
    setTimeout(arm, 1200);
  }
}

/**
 * Google Analytics 4 gate — the gtag.js library only loads after the visitor
 * accepts cookies in the cookie banner. Rejected or undecided visitors get
 * zero Google requests (no script, no cookies, no pings).
 */
export function Analytics() {
  const [consent, setConsent] = useState<ConsentValue | null>(null);

  useEffect(() => {
    let disposed = false;
    const arm = () => {
      if (disposed) return;
      // Queue js/config BEFORE rendering the <Script> tag, so the library
      // processes them in the granted state.
      pushConsentUpdate("granted");
      ensureGaQueued();
      setConsent("accepted");
    };

    if (readConsent() === "accepted") {
      // Returning visitor who had accepted: defer the library load until the
      // browser is idle so the tag never blocks first paint or hydration.
      loadWhenIdle(arm);
    }

    const onChange = (e: Event) => {
      const value = (e as CustomEvent<ConsentValue>).detail;
      if (value === "accepted") {
        // The visitor just clicked Accept — load promptly; this is a user
        // gesture, not the critical load window.
        arm();
      } else {
        setConsent(value ?? null);
      }
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => {
      disposed = true;
      window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOT }} />
      {consent === "accepted" && (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
