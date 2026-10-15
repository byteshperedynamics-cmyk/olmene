"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FileText, Gauge, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogoLoader } from "@/components/logo-loader";
import { AccountError, avatarFromGoogle, updateProfile, type Identity } from "@/lib/account-client";
import { cleanDisplayName } from "@/lib/account/progress";
import { AvatarEditor } from "./avatar-editor";

const START = [
  { href: "/#free-diagnosis", icon: ScanSearch, title: "Check a homepage for free", body: "A 30-second scan that shows what's costing you customers." },
  { href: "/app/new/", icon: Gauge, title: "Run a full analysis", body: "Ten research steps, then a prioritised 90-day plan." },
  { href: "/sample-report/", icon: FileText, title: "Read a sample report", body: "See what you get, on a real company's site." },
];

/**
 * First sign-in: say hello, set a name and a picture (Google's are filled
 * in), then pick where to start. Shown once; closing it counts as done, and
 * everything here can be changed later in Account settings.
 */
export function WelcomeDialog({
  identity,
  hasOwnPhoto,
  hasWork,
  onDone,
  onProfileChanged,
}: {
  identity: Identity;
  hasOwnPhoto: boolean;
  /** Already has analyses: skip the "where to start" step. */
  hasWork: boolean;
  onDone: () => void;
  onProfileChanged: () => void;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(identity.name ?? "");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!name && identity.name) setName(identity.name);
    // only fill in once the profile arrives
  }, [identity.name]);

  async function finish(href?: string) {
    setOpen(false);
    await updateProfile({ onboarded: true }).catch(() => {});
    onDone();
    if (href) router.push(href);
    else toast.success(identity.firstName ? `You're all set, ${cleanDisplayName(name)?.split(" ")[0] ?? identity.firstName}.` : "You're all set.");
  }

  async function saveProfile() {
    const clean = cleanDisplayName(name);
    if (name.trim() && !clean) {
      setNameError("Use letters, numbers or spaces (up to 60 characters).");
      return;
    }
    setSaving(true);
    try {
      // Saved even when it's Google's name unchanged: from now on it's theirs.
      if (clean) await updateProfile({ displayName: clean });
      // The Google photo they can see becomes their picture (it's only public on links they share).
      if (!hasOwnPhoto && identity.providerAvatarUrl) await avatarFromGoogle().catch(() => {});
      onProfileChanged();
      if (hasWork) await finish();
      else setStep(2);
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't save. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  const motionProps = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && finish()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[30rem] gap-0 overflow-y-auto rounded-[22px] p-0"
        dir="ltr"
        // The dialog opens by itself, so Radix would focus the first control (the
        // photo button) and show its "change photo" overlay before anyone touched
        // anything. Start on the dialog itself; Tab still reaches every control.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 1 ? (
            <motion.div key="profile" {...motionProps} className="grid gap-6 p-6 sm:p-8">
              <DialogHeader className="items-center text-center sm:text-center">
                <DialogTitle className="o-display text-[26px] leading-tight">
                  {identity.firstName ? `Welcome to Olmene, ${identity.firstName}` : "Welcome to Olmene"}
                </DialogTitle>
                <DialogDescription className="max-w-sm text-[15px]">
                  Put a face to your account. You can change this any time.
                </DialogDescription>
              </DialogHeader>

              <AvatarEditor identity={identity} hasOwnPhoto={hasOwnPhoto} onChanged={onProfileChanged} size={96} compact />
              {!hasOwnPhoto && identity.providerAvatarUrl && (
                <p className="-mt-3 text-center text-[13px] text-muted-foreground">Using the photo from your Google account.</p>
              )}

              <form
                className="grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveProfile();
                }}
              >
                <label htmlFor="welcome-name" className="text-[14px] font-medium">
                  What should we call you?
                </label>
                <input
                  id="welcome-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Your name"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby="welcome-name-help"
                  className="h-11 w-full rounded-[10px] border border-rim bg-background px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-tel-rose"
                />
                <p id="welcome-name-help" className={nameError ? "text-[13px] text-tel-rose" : "text-[13px] text-muted-foreground"}>
                  {nameError ?? "Shown in Olmene, and on progress links if you choose to share them."}
                </p>
                <div className="mt-3 grid gap-2">
                  <Button type="submit" size="xl" disabled={saving} className="w-full">
                    {saving ? (
                      <>
                        <LogoLoader size={16} /> Saving…
                      </>
                    ) : (
                      <>
                        Continue <ArrowRight className="size-4" aria-hidden />
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => finish()} disabled={saving} className="text-muted-foreground">
                    Skip for now
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div key="start" {...motionProps} className="grid gap-6 p-6 sm:p-8">
              <DialogHeader className="items-center text-center sm:text-center">
                <DialogTitle className="o-display text-[26px] leading-tight">Where would you like to start?</DialogTitle>
                <DialogDescription className="text-[15px]">Pick one. The rest is a click away in your dashboard.</DialogDescription>
              </DialogHeader>
              <ul className="grid gap-2.5">
                {START.map(({ href, icon: Icon, title, body }) => (
                  <li key={href}>
                    <button
                      type="button"
                      onClick={() => finish(href)}
                      className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-edge p-4 text-start transition-colors hover:border-rim hover:bg-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-rim bg-secondary">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-[15px] font-medium">{title}</span>
                        <span className="text-[13px] leading-snug text-muted-foreground">{body}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" onClick={() => finish()} className="text-muted-foreground">
                I&apos;ll look around first
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
