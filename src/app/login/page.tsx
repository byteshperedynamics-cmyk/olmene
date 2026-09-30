"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Inbox, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Logo } from "@/components/logo";
import { LogoLoader } from "@/components/logo-loader";
import { Enter } from "@/components/motion";
import { getSupabase } from "@/lib/supabase";
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

function LoginForm() {
  const { t } = useI18n();
  usePageMeta("meta.title.login");
  const params = useSearchParams();
  // Only allow in-app redirect targets (never external URLs).
  const rawNext = params.get("next") ?? "/app/";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/app/";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

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
      window.history.replaceState(window.location.state, "", clean);
    }
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error(t("login.toastInvalid"));
      return;
    }
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
      setSent(true);
      toast.success(t("login.toastSentTitle"), {
        description: t("login.toastSentDesc", { email: trimmed }),
      });
    } catch (err) {
      const key = friendlySendErrorKey(err);
      toast.error(key ? t(key) : err instanceof Error ? err.message : t("login.err.send"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Enter className="w-full max-w-md">
      <Card className="w-full shadow-lg">
        {sent ? (
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
              <CardDescription>{t("login.desc")}</CardDescription>
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
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      disabled={loading}
                      required
                      autoFocus
                    />
                  </div>
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
