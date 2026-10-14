/**
 * Browser error reporter: uncaught errors, unhandled promise rejections and
 * React error boundaries go to POST /api/ops/client-error (stored in
 * ops_events as source "browser", watched by health-watch). At most 5 reports
 * per page load; the same message only once. No user data is sent: just the
 * message, a stack excerpt and the page URL (the route keeps only the path).
 */

export type ClientErrorKind = "error" | "rejection" | "boundary";

const MAX_PER_LOAD = 5;
let sent = 0;
const seen = new Set<string>();

function describe(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) return { message: `${value.name}: ${value.message}`, stack: value.stack };
  if (typeof value === "string") return { message: value };
  try {
    return { message: JSON.stringify(value).slice(0, 300) };
  } catch {
    return { message: String(value) };
  }
}

export function reportClientError(value: unknown, kind: ClientErrorKind = "error"): void {
  if (typeof window === "undefined" || sent >= MAX_PER_LOAD) return;
  const { message, stack } = describe(value);
  if (!message || seen.has(message)) return;
  seen.add(message);
  sent += 1;
  const body = JSON.stringify({
    message: message.slice(0, 300),
    stack: stack?.slice(0, 1500),
    url: window.location.href,
    kind,
  });
  try {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/ops/client-error", blob)) return;
  } catch {
    /* fall through to fetch */
  }
  fetch("/api/ops/client-error", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

/** Installs the window listeners once; returns the cleanup. */
export function installClientErrorReporter(): () => void {
  const onError = (e: ErrorEvent) => {
    // Cross-origin script errors arrive as "Script error." with nothing useful.
    if (!e.error && (!e.message || e.message === "Script error.")) return;
    reportClientError(e.error ?? e.message, "error");
  };
  const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, "rejection");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
