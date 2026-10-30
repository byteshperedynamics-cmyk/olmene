"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Linkedin, Mail, MessageCircle, Share, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { LogoLoader } from "@/components/logo-loader";
import { AccountError, createShare, deleteShare, setShareName, shareUrl, type Identity, type ShareLink } from "@/lib/account-client";
import { scoreDelta, type SiteProgress } from "@/lib/account/progress";
import { ProgressCard } from "./progress-card";

/** X's mark (Simple Icons, CC0). */
function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden fill="currentColor">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

/** The sentence that goes out with the link. */
export function shareMessage(site: SiteProgress): string {
  const d = scoreDelta(site);
  if (d != null && d > 0 && site.history.length > 1) return `I took ${site.host} from ${site.scoreFirst} to ${site.scoreNow} on Olmene.`;
  if (site.scoreNow != null) return `${site.host} scores ${site.scoreNow}/100 on Olmene. Here's how it's going.`;
  return `I'm improving ${site.host} with Olmene.`;
}

/**
 * Share one site's progress. Before the link exists: a preview of exactly
 * what friends will see and the name-and-photo switch. After: the link,
 * copy, the system share sheet, a few direct shortcuts, and turning it off.
 */
export function ShareDialog({
  site,
  share,
  identity,
  open,
  onOpenChange,
  onChanged,
}: {
  site: SiteProgress;
  share: ShareLink | null;
  identity: Identity;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: (next: ShareLink | null) => void;
}) {
  const [showName, setShowName] = useState(share?.showName ?? true);
  const [busy, setBusy] = useState<"create" | "name" | "off" | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => setShowName(share?.showName ?? true), [share?.showName, open]);
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  const url = share ? shareUrl(share.slug) : null;
  const message = shareMessage(site);
  const owner = showName ? { name: identity.name, avatarUrl: identity.avatarUrl } : { name: null, avatarUrl: null };

  async function create() {
    setBusy("create");
    try {
      const link = await createShare(site.siteId, showName);
      onChanged(link);
      toast.success("Your link is ready");
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't create the link. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleName(next: boolean) {
    setShowName(next);
    if (!share) return;
    setBusy("name");
    try {
      onChanged(await setShareName(site.siteId, next));
    } catch (e) {
      setShowName(!next);
      toast.error(e instanceof AccountError ? e.message : "Couldn't update the link.");
    } finally {
      setBusy(null);
    }
  }

  async function turnOff() {
    setBusy("off");
    try {
      await deleteShare(site.siteId);
      onChanged(null);
      toast.success("Link turned off. It no longer opens.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't turn the link off. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  async function nativeShare() {
    if (!url) return;
    try {
      await navigator.share({ title: `${site.host} on Olmene`, text: message, url });
    } catch {
      /* closed the sheet */
    }
  }

  const enc = encodeURIComponent;
  const intents = url
    ? [
        { label: "X", icon: <XMark />, href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(url)}` },
        { label: "LinkedIn", icon: <Linkedin className="size-3.5" aria-hidden />, href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
        { label: "WhatsApp", icon: <MessageCircle className="size-3.5" aria-hidden />, href: `https://wa.me/?text=${enc(`${message} ${url}`)}` },
        { label: "Email", icon: <Mail className="size-3.5" aria-hidden />, href: `mailto:?subject=${enc(`${site.host} on Olmene`)}&body=${enc(`${message}\n\n${url}`)}` },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[34rem] gap-5 overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{share ? "Share your progress" : `Share ${site.host}'s progress`}</DialogTitle>
          <DialogDescription>
            {share
              ? "Anyone with this link sees the card below. It updates every week as your score moves."
              : "Friends see this card: the site, its score history and milestones. Your reports, findings and everything else stay private."}
          </DialogDescription>
        </DialogHeader>

        <ProgressCard site={site} owner={owner} compact />

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-edge px-4 py-3">
          <span className="grid gap-0.5">
            <span className="text-[14px] font-medium">Show my name and photo</span>
            <span className="text-[13px] text-muted-foreground">
              {identity.name ? `Shown as ${identity.name}.` : "Add your name in Account settings to show it."}
            </span>
          </span>
          <Switch checked={showName} onCheckedChange={toggleName} disabled={busy === "name"} aria-label="Show my name and photo" />
        </label>

        {!share ? (
          <Button size="xl" onClick={create} disabled={busy === "create"} className="w-full">
            {busy === "create" ? (
              <>
                <LogoLoader size={16} /> Creating link…
              </>
            ) : (
              "Create link"
            )}
          </Button>
        ) : (
          <div className="grid gap-4">
            <div className="flex gap-2">
              <input
                readOnly
                value={url ?? ""}
                aria-label="Progress link"
                onFocus={(e) => e.currentTarget.select()}
                dir="ltr"
                className="h-11 min-w-0 flex-1 rounded-md border border-rim bg-background px-3 font-mono text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="xl" onClick={copy} className="shrink-0" aria-live="polite">
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {canNativeShare && (
                <Button variant="hairline" size="sm" onClick={nativeShare}>
                  <Share className="size-3.5" aria-hidden /> Share…
                </Button>
              )}
              {intents.map((i) => (
                <Button key={i.label} asChild variant="hairline" size="sm">
                  <a href={i.href} target="_blank" rel="noopener noreferrer">
                    {i.icon} {i.label}
                  </a>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-4 text-[13px] text-muted-foreground">
              <span>
                {share.views === 0 ? "Not opened yet" : `Opened ${share.views} ${share.views === 1 ? "time" : "times"}`}
                {url && (
                  <>
                    {" "}
                    <a href={url} target="_blank" rel="noopener noreferrer" className="ms-2 inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline">
                      View page <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </>
                )}
              </span>
              <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy === "off"} className="text-muted-foreground hover:text-tel-rose">
                {busy === "off" ? <LogoLoader size={14} /> : <Link2Off className="size-3.5" aria-hidden />} Turn off link
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
