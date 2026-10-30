"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, CircleCheck, ExternalLink, Inbox, Mail, RotateCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { LogoLoader } from "@/components/logo-loader";
import { Enter } from "@/components/motion";
import { UserAvatar } from "@/components/account/user-avatar";
import { getSupabase } from "@/lib/supabase";
import { identityOf, useProfile } from "@/lib/account-client";
import { useSession } from "@/lib/session";
import { finishGoogleSignIn, googleSignInEnabled, readGoogleReturn, startGoogleSignIn } from "@/lib/auth/google-signin-client";
import { safeNextPath } from "@/lib/safe-next";
import { SUPPORT_EMAIL } from "@/lib/config";
import { useI18n, usePageMeta } from "@/i18n/provider";
import { cn } from "@/lib/utils";

function friendlySendErrorKey(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("rate limit") || msg.includes("after") || msg.includes("seconds")) {
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

// The method used last time on this browser, so a returning visitor sees it first.
const LAST_KEY = "olmene-last-signin";
type LastSignIn = { method: "google" | "email"; email?: string };
function readLast(): LastSignIn | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? "null") as LastSignIn | null;
    return v && (v.method === "google" || v.method === "email") ? v : null;
  } catch {
    return null;
  }
}
function writeLast(v: LastSignIn) {
  try {
    window.localStorage.setItem(LAST_KEY, JSON.stringify(v));
  } catch {
    /* private mode: fine */
  }
}

/** A shortcut to the inbox for the big webmail providers (searching recent mail in every folder where we can). */
function mailApp(email: string): { name: string; url: string } | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (["gmail.com", "googlemail.com"].includes(domain)) return { name: "Gmail", url: "https://mail.google.com/mail/u/0/#search/in%3Aanywhere+newer_than%3A1h" };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.fr", "hotmail.co.uk", "hotmail.fr", "live.co.uk"].includes(domain))
    return { name: "Outlook", url: "https://outlook.live.com/mail/0/" };
  if (["yahoo.com", "ymail.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de"].includes(domain)) return { name: "Yahoo Mail", url: "https://mail.yahoo.com/" };
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) return { name: "iCloud Mail", url: "https://www.icloud.com/mail" };
  if (["proton.me", "protonmail.com", "pm.me"].includes(domain)) return { name: "Proton Mail", url: "https://mail.proton.me/" };
  return null;
}

const RESEND_AFTER = 60; // seconds; the auth server refuses a second link sooner

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border p-4 text-[14px] leading-relaxed text-foreground",
        tone === "error" ? "border-tel-rose/30 bg-tel-rose/[0.06]" : "border-tel-emerald/30 bg-tel-emerald/[0.06]",
      )}
    >
      {tone === "error" ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-tel-rose" aria-hidden />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-tel-emerald" aria-hidden />
      )}
      <p>{children}</p>
    </div>
  );
}

function LoginForm() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  usePageMeta(mode === "signup" ? "meta.title.signup" : "meta.title.login");
  // Only allow in-app redirect targets (never external URLs; lib/safe-next.ts).
  const nextPath = safeNextPath(params.get("next"));
  // Where sign-in leads, said on the card so the scan or checkout context isn't lost.
  const nextContext = /[?&]scan=/.test(nextPath) ? "login.ctx.scan" : nextPath.startsWith("/app/billing") ? "login.ctx.checkout" : nextPath !== "/app/" ? "login.ctx.other" : null;
  const { session, loading: sessionLoading, signOut } = useSession();
  const profile = useProfile(session);
  const identity = identityOf(session, profile.data);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resent, setResent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<"signed_out" | "signed_out_all" | "deleted" | null>(null);
  // Inline (not toast-only) so the reason stays next to the field on phones.
  const [sendError, setSendError] = useState<string | null>(null);
  // Shown by default; hidden only if Supabase reports the provider is off.
  const [googleOn, setGoogleOn] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);
  // Back from Google: exchanging the ID token for a session.
  const [finishing, setFinishing] = useState(false);
  const [last, setLast] = useState<LastSignIn | null>(null);

  useEffect(() => {
    void googleSignInEnabled().then(setGoogleOn);
    const l = readLast();
    setLast(l);
    if (l?.email) setEmail(l.email);
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
        writeLast({ method: "google" });
        router.replace(ret.next);
      }
    });
  }, [router]);

  // Resend countdown: ticks only while the "check your inbox" card shows.
  useEffect(() => {
    if (!sent) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sent]);

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
  // hash by GoTrue) and sign-out confirmations, then clean the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let code: string | null = params.get("auth_error");
    if (!code) {
      const hashMatch = window.location.hash.match(/error_code=([a-z_]+)/i);
      if (hashMatch) code = hashMatch[1];
    }
    if (code) setAuthError(code);
    const so = params.get("signed_out");
    if (so) setNotice(so === "all" ? "signed_out_all" : "signed_out");
    if (params.get("deleted")) setNotice("deleted");
    if (code || so || params.get("deleted")) {
      const keep = new URLSearchParams();
      if (params.get("next")) keep.set("next", params.get("next")!);
      if (params.get("mode")) keep.set("mode", params.get("mode")!);
      const q = keep.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (q ? `?${q}` : ""));
    }
  }, [params]);

  const switchMode = useCallback(
    (m: "signin" | "signup") => {
      setMode(m);
      setSendError(null);
      const q = new URLSearchParams(window.location.search);
      if (m === "signup") q.set("mode", "signup");
      else q.delete("mode");
      const s = q.toString();
      window.history.replaceState(window.history.state, "", window.location.pathname + (s ? `?${s}` : ""));
    },
    [],
  );

  async function send(target: string): Promise<boolean> {
    const supabase = getSupabase();
    const { error } = await supabase!.auth.signInWithOtp({
      email: target,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}${nextPath}` : undefined,
      },
    });
    if (error) throw error;
    writeLast({ method: "email", email: target });
    setSentAt(Date.now());
    setNow(Date.now());
    return true;
  }

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
      await send(trimmed);
      setSent(true); // the "Check your inbox" card says it all; no duplicate toast
      setResent(false);
      setAuthError(null); // a fresh link supersedes the "expired link" notice
      setNotice(null);
    } catch (err) {
      const key = friendlySendErrorKey(err);
      setSendError(key ? t(key) : err instanceof Error ? err.message : t("login.err.send"));
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (loading) return;
    setLoading(true);
    setSendError(null);
    try {
      await send(email.trim());
      setResent(true);
    } catch (err) {
      const key = friendlySendErrorKey(err);
      setSendError(key ? t(key) : t("login.err.send"));
    } finally {
      setLoading(false);
    }
  }

  const wait = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000));
  const app = mailApp(email.trim());
  const signup = mode === "signup";

  // Already signed in (and not in the middle of a Google return): offer the way in, or a switch.
  if (!sessionLoading && session && identity && !finishing) {
    return (
      <Enter className="w-full max-w-[26rem]">
        <div className="rounded-2xl border bg-card p-6 text-center sm:p-8">
          <UserAvatar src={identity.avatarUrl} initials={identity.initials} size={64} className="mx-auto" />
          <h1 className="o-display mt-5 text-[26px] leading-tight">{t("login.already.title")}</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {t("login.already.desc.pre")}{" "}
            <span className="font-medium text-foreground" dir="ltr">
              {identity.email}
            </span>
          </p>
          <div className="mt-7 grid gap-2">
            <Button size="xl" className="w-full" onClick={() => router.replace(nextPath)}>
              {t("login.already.continue")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => signOut()}>
              {t("login.already.switch")}
            </Button>
          </div>
        </div>
      </Enter>
    );
  }

  return (
    <Enter className="w-full max-w-[26rem]">
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        {finishing ? (
          <div className="grid justify-items-center gap-4 py-12 text-center" aria-live="polite">
            <LogoLoader size={44} glow />
            <p className="o-display text-[22px]">{t("login.googleFinishing")}</p>
          </div>
        ) : sent ? (
          <div className="grid gap-6">
            <div className="grid justify-items-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-xl border border-rim bg-secondary">
                <Inbox className="size-6" aria-hidden />
              </span>
              <h1 className="o-display text-[28px] leading-tight">{t("login.sentTitle")}</h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {t("login.sent.pre")}{" "}
                <span className="font-medium text-foreground" dir="ltr">
                  {email.trim()}
                </span>
                {t("login.sent.post")}
              </p>
            </div>
            {authError && <Notice tone="error">{t(friendlyAuthErrorKey(authError))}</Notice>}
            {resent && !sendError && <Notice tone="ok">{t("login.resent")}</Notice>}
            {sendError && <Notice tone="error">{sendError}</Notice>}

            {app && (
              <Button asChild size="xl" className="w-full">
                <a href={app.url} target="_blank" rel="noopener noreferrer">
                  {t("login.openMail", { app: app.name })} <ExternalLink className="size-4" aria-hidden />
                </a>
              </Button>
            )}

            <div className="flex items-start gap-3 rounded-xl border border-edge bg-secondary/40 p-4 text-[14px] leading-relaxed">
              <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <p>
                {t("login.click.pre")} <span className="font-medium">&ldquo;{t("login.click.btn")}&rdquo;</span> {t("login.click.post")}
              </p>
            </div>
            <ul className="grid gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t("login.tip1")}</span>
              </li>
              <li className="flex items-start gap-2">
                <Inbox className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>{t("login.tipSpam")}</span>
              </li>
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge pt-5">
              <Button variant="ghost" size="sm" onClick={() => setSent(false)} className="text-muted-foreground">
                {t("login.differentEmail")}
              </Button>
              <Button variant="hairline" size="sm" onClick={resend} disabled={wait > 0 || loading} aria-live="polite">
                {loading ? <LogoLoader size={14} /> : <RotateCw className="size-3.5" aria-hidden />}
                {wait > 0 ? t("login.resendIn", { n: wait }) : t("login.resend")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid justify-items-center gap-2 text-center">
              <h1 className="o-display text-[26px] leading-tight sm:text-[28px]">{t(signup ? "login.titleSignup" : "login.title")}</h1>
              <p className="text-[15px] leading-relaxed text-muted-foreground">
                {t(signup ? "login.descSignup" : googleOn ? "login.desc" : "login.descEmail")}
              </p>
              {nextContext && <p className="rounded-md border bg-background px-3 py-1.5 text-[13px] text-muted-foreground">{t(nextContext)}</p>}
            </div>

            {signup && (
              <ul className="mt-6 grid gap-2.5 rounded-xl border border-edge p-4 text-[14px]">
                {["login.perk1", "login.perk2", "login.perk3"].map((k) => (
                  <li key={k} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-tel-emerald" strokeWidth={2.5} aria-hidden />
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6">
              {notice && <Notice tone="ok">{t(`login.notice.${notice}`)}</Notice>}
              {authError && <Notice tone="error">{t(friendlyAuthErrorKey(authError))}</Notice>}

              {googleOn && (
                <>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={google}
                      disabled={googleBusy || loading}
                      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[#747775] bg-white px-4 text-[15px] font-medium text-[#1F1F1F] transition-colors hover:bg-[#F8F9FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 dark:border-[#8E918F] dark:bg-[#131314] dark:text-[#E3E3E3] dark:hover:bg-[#1F1F20]"
                    >
                      {googleBusy ? <LogoLoader size={18} /> : <GoogleG />}
                      {t(googleBusy ? "login.googleOpening" : "login.google")}
                    </button>
                    {last?.method === "google" && <LastUsed label={t("login.lastUsed")} />}
                  </div>
                  <div className="my-5 flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
                    <span className="h-px flex-1 bg-edge" />
                    {t("login.or")}
                    <span className="h-px flex-1 bg-edge" />
                  </div>
                </>
              )}
              <form onSubmit={submit} className="grid gap-4" noValidate>
                <div className="grid gap-2">
                  <label htmlFor="email" className="flex items-center justify-between text-[14px] font-medium leading-none">
                    {t("login.email")}
                    {last?.method === "email" && <span className="text-[12px] font-normal text-muted-foreground">{t("login.lastUsed")}</span>}
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="email"
                      type="email"
                      inputMode="email"
                      placeholder={t("login.emailPlaceholder")}
                      className="h-12 rounded-xl ps-9 text-[15px]"
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
                      autoFocus={!last || last.method === "email"}
                      dir="ltr"
                    />
                  </div>
                  {sendError && (
                    <p id="login-send-error" role="alert" className="flex items-start gap-2 pt-1 text-[13px] leading-relaxed text-tel-rose">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {sendError}
                    </p>
                  )}
                </div>
                <Button type="submit" size="xl" className="h-12 w-full rounded-xl" disabled={loading}>
                  {loading ? (
                    <>
                      <LogoLoader size={16} /> {t("login.sending")}
                    </>
                  ) : (
                    <>
                      {t(signup ? "login.continueSignup" : "login.continue")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-[14px] text-muted-foreground">
                {t(signup ? "login.switch.toSignin" : "login.switch.toSignup")}{" "}
                <button
                  type="button"
                  onClick={() => switchMode(signup ? "signin" : "signup")}
                  className="cursor-pointer font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t(signup ? "login.switch.signin" : "login.switch.signup")}
                </button>
              </p>
            </div>
          </>
        )}
      </div>
      <p className="mx-auto mt-5 max-w-sm text-center text-[12.5px] leading-relaxed text-muted-foreground">
        {t("login.legal.pre")}{" "}
        <Link href="/legal/terms/" className="underline underline-offset-4 hover:text-foreground">
          {t("footer.terms")}
        </Link>{" "}
        {t("login.legal.mid")}{" "}
        <Link href="/legal/privacy/" className="underline underline-offset-4 hover:text-foreground">
          {t("footer.privacy")}
        </Link>
        {t("login.legal.post")}
      </p>
    </Enter>
  );
}

function LastUsed({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute -top-2.5 end-3 rounded-full border border-rim bg-background px-2 py-0.5 text-[11.5px] leading-none text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * A compact shell for signing in (refinement 2026-10-30): the logo home, the
 * card, and the help and legal links. No marketing navigation competing with
 * the one thing this page is for.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <LoginHelp />
      </header>
      <main id="main-content" className="flex flex-1 items-start justify-center px-4 pb-12 pt-6 sm:items-center sm:py-12">
        <Suspense fallback={<div className="h-[30rem] w-full max-w-[26rem] animate-pulse rounded-2xl border bg-card" />}>
          <LoginForm />
        </Suspense>
      </main>
      <LoginFooter />
    </div>
  );
}

function LoginHelp() {
  const { t } = useI18n();
  if (!SUPPORT_EMAIL) return null;
  return (
    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Signing in to Olmene")}`} className="o-hit relative text-[14px] text-muted-foreground hover:text-foreground">
      {t("login.help")}
    </a>
  );
}

function LoginFooter() {
  const { t } = useI18n();
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-wrap justify-center gap-x-6 gap-y-2 px-4 pb-8 text-[13px] text-muted-foreground sm:px-6">
      <Link href="/legal/terms/" className="o-hit relative hover:text-foreground">
        {t("footer.terms")}
      </Link>
      <Link href="/legal/privacy/" className="o-hit relative hover:text-foreground">
        {t("footer.privacy")}
      </Link>
      <Link href="/security/" className="o-hit relative hover:text-foreground">
        {t("footer.security")}
      </Link>
    </footer>
  );
}
