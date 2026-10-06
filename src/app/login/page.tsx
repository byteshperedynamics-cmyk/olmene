"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Inbox, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Logo } from "@/components/logo";
import { LogoLoader } from "@/components/logo-loader";
import { Enter } from "@/components/motion";
import { getSupabase } from "@/lib/supabase";
import { finishGoogleSignIn, googleSignInEnabled, readGoogleReturn, startGoogleSignIn } from "@/lib/auth/google-signin-client";
import { useI18n, usePageMeta } from "@/i18n/provider";

function friendlySendErrorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("rate limit")) {
    return "login.err.rate";
  }
  if (msg.includes("redirect")) {
    return "login.err.redirect";
  }
  return err instanceof Error && err.message ? "" : "login.err.send";
}

function friendlyAuthErrorKey(code: string): string {
  if (code === "google_cancelled") {
    return "login.err.googleCancelled";
  }
  if (code === "google_unavailable") {
    return "login.err.googleUnavailable";
  }
  if (code.startsWith("google")) {
    return "login.err.google";
  }
  if (code.includes("otp_expired")) {
    return "login.err.otpExpired";
  }
  if (code.includes("access_denied")) {
    return "login.err.accessDenied";
  }
  if (code.includes("email_not_confirmed")) {
    return "login.err.emailNotConfirmed";
  }
  return "login.err.generic";
}

/** Google's standard four-colour "G" (brand guidelines: unmodified, on a white or dark tile). */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px] shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function LoginForm() {
  const { t, lang } = useI18n();
  usePageMeta("meta.title.login");
  const router = useRouter();
  const params = useSearchParams();
  // Only allow in-app redirect targets (never external URLs).
  const rawNext = params.get("next") ?? "/app/";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app/";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  // Inline (not toast-only) so the reason stays next to the field on phones.
  const [sendError, setSendError] = useState<string | null>(null);
  // Shown by default; hidden only if Supabase reports the provider is off.
  const [googleOn, setGoogleOn] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  // Back from Google: exchanging the ID token for a session.
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    void googleSignInEnabled().then(setGoogleOn);
    // Back/forward from Google's page restores this one from the bfcache, button still "Opening…".
    const reset = (e: PageTransitionEvent) => e.persisted && setGoogleBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  useEffect(() => {
    const ret = readGoogleReturn();
    if (!ret) return;
    // Drop the token from the address bar and history right away.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setFinishing(true);
    void finishGoogleSignIn(ret.token).then((code) => {
      if (code) {
        setAuthError(code);
        setFinishing(false);
      } else {
        router.replace(ret.next);
      }
    });
  }, [router]);

  async function google() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setAuthError(null);
    try {
      await startGoogleSignIn(nextPath, lang);
    } catch {
      setGoogleBusy(false);
      setAuthError("google_failed");
    }
  }

  // Surface magic-link failures (forwarded from /app/ or present in the URL
  // hash by GoTrue) instead of failing silently.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let code: string | null = null;
    const fromParams = params.get("auth_error");
    if (fromParams) {
      code = fromParams;
    } else {
      const hashMatch = window.location.hash.match(/error_code=([a-z_]+)/i);
      if (hashMatch) code = hashMatch[1];
    }
    if (code) {
      setAuthError(code);
      // Clean the URL so the message doesn't reappear on refresh.
      const clean = window.location.pathname;
      window.history.replaceState(window.history.state, "", clean);
    }
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setSendError(t("login.toastInvalid"));
      return;
    }
    setSendError(null);
    setLoading(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase!.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}${nextPath}`
              : undefined,
        },
      });
      if (error) throw error;
      setSent(true); // the "Check your inbox" card says it all; no duplicate toast
      setAuthError(null); // a fresh link supersedes the "expired link" notice
    } catch (err) {
      const key = friendlySendErrorKey(err);
      setSendError(key ? t(key) : err instanceof Error ? err.message : t("login.err.send"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Enter className="w-full max-w-md">
      <Card className="w-full shadow-lg">
        {finishing ? (
          <CardHeader className="items-center py-16 text-center" aria-live="polite">
            <LogoLoader size={44} glow />
            <CardTitle className="mt-4 font-display text-xl font-bold">{t("login.googleFinishing")}</CardTitle>
          </CardHeader>
        ) : sent ? (
          <>
            <CardHeader className="items-center text-center">
              <Logo className="mb-2 justify-center" />
              <CardTitle className="font-display text-2xl font-bold">{t("login.sentTitle")}</CardTitle>
              <CardDescription>
                {t("login.sent.pre")}{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>
                {t("login.sent.post")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {authError && (
                <div
                  className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed text-foreground"
                  role="alert"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  <p>{t(friendlyAuthErrorKey(authError))}</p>
                </div>
              )}
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border bg-secondary/40 p-4 text-sm leading-relaxed">
                  <Inbox className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <p>
                    {t("login.click.pre")}{" "}
                    <span className="font-medium">&ldquo;{t("login.click.btn")}&rdquo;</span>{" "}
                    {t("login.click.post")}
                  </p>
                </div>
                <ul className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>{t("login.tip1")}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                    <span>
                      {t("login.tip2.pre")}{" "}
                      <button
                        type="button"
                        className="cursor-pointer font-medium text-foreground underline underline-offset-4 hover:text-primary"
                        onClick={() => setSent(false)}
                      >
                        {t("login.tip2.btn")}
                      </button>
                      {t("login.tip2.post")}
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="items-center text-center">
              <Logo className="mb-2 justify-center" />
              <CardTitle className="font-display text-2xl font-bold">{t("login.title")}</CardTitle>
              <CardDescription>{t(googleOn ? "login.desc" : "login.descEmail")}</CardDescription>
            </CardHeader>
            <CardContent>
              {authError && (
                <div
                  className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed text-foreground"
                  role="alert"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  <p>{t(friendlyAuthErrorKey(authError))}</p>
                </div>
              )}
              {googleOn && (
                <>
                  <button
                    type="button"
                    onClick={google}
                    disabled={googleBusy || loading}
                    className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-md border border-[#747775] bg-white px-4 text-sm font-medium text-[#1F1F1F] transition-colors hover:bg-[#F8F9FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait disabled:opacity-70 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1F1F20]"
                  >
                    {googleBusy ? <LogoLoader size={18} /> : <GoogleG />}
                    {t(googleBusy ? "login.googleOpening" : "login.google")}
                  </button>
                  <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
                    <span className="h-px flex-1 bg-border" />
                    {t("login.or")}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium leading-none">
                    {t("login.email")}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="email"
                      type="email"
                      placeholder={t("login.emailPlaceholder")}
                      className="h-11 ps-9"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (sendError) setSendError(null);
                      }}
                      aria-invalid={sendError ? true : undefined}
                      aria-describedby={sendError ? "login-send-error" : undefined}
                      autoComplete="email"
                      disabled={loading}
                      required
                      autoFocus
                    />
                  </div>
                  {sendError && (
                    <p id="login-send-error" role="alert" className="flex items-start gap-2 pt-1 text-[13px] leading-relaxed text-destructive">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {sendError}
                    </p>
                  )}
                </div>
                <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <LogoLoader size={16} /> {t("login.sending")}
                    </>
                  ) : (
                    <>
                      {t("login.continue")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                    </>
                  )}
                </Button>
              </form>
              <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                {t("login.newHere.pre")}{" "}
                <Link href="/pricing/" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                  {t("common.seePricing")}
                </Link>{" "}
                {t("login.newHere.mid")}{" "}
                <Link href="/sample-report/" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                  {t("login.readSample")}
                </Link>
                {t("login.newHere.post")}
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </Enter>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-16">
        <Suspense fallback={<div className="size-80 animate-pulse rounded-xl border bg-card" />}>
          <LoginForm />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
