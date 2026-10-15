"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { inputClass } from "@/components/workspace/field-styles";
import { cn } from "@/lib/utils";
import { atLeast } from "@/lib/workspace/roles";
import { TeamApiError } from "@/lib/workspace/client";
import { removeLogo, saveBrand, uploadLogo } from "@/lib/agency/client";
import { LOGO_MAX_BYTES, LOGO_TYPES, normalizeWebsite } from "@/lib/agency/rules";
import type { Brand, ClientsView } from "@/lib/agency/types";
import { useI18n } from "@/i18n/provider";
import { BrandBar } from "./client-portal";

const message = (e: unknown, fallback: string) => (e instanceof TeamApiError || e instanceof Error ? e.message : fallback);
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_SWATCH = "#1f6feb";

/** A small client page with this branding: the bar, the heading, two cards and the footer. */
export function BrandPreview({ brand, clientName }: { brand: Brand; clientName: string }) {
  const { t } = useI18n();
  const empty = !brand.name && !brand.logoUrl;
  return (
    <figure className="grid gap-2">
      <div inert className="overflow-hidden rounded-xl border border-edge bg-background shadow-sm select-none">
        <div className="flex items-center gap-1.5 border-b border-edge bg-secondary/60 px-3 py-2" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="ms-2 truncate rounded-md bg-background px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground" dir="ltr">
            olmene.com/c/…
          </span>
        </div>
        {empty ? <div className="h-1 w-full" style={{ background: brand.color ?? "var(--foreground)" }} /> : <BrandBar brand={brand} compact />}
        <div className="grid gap-3 px-4 pb-4 pt-3">
          <div className="grid gap-1">
            {brand.name && <p className="o-eyebrow text-[10px]">{t("portal.preparedBy", { agency: brand.name })}</p>}
            <p className="o-display text-[18px] leading-tight">{t("portal.title", { client: clientName })}</p>
          </div>
          <div className="grid grid-cols-2 gap-2" aria-hidden>
            {[82, 64].map((n) => (
              <div key={n} className="grid gap-2 rounded-lg border border-edge p-2.5">
                <span className="h-1.5 w-16 rounded-full bg-foreground/15" />
                <span className="o-readout-strong text-[18px] leading-none">{n}</span>
                <span className="h-1 w-full rounded-full bg-foreground/10">
                  <span className="block h-full rounded-full bg-tel-emerald" style={{ width: `${n}%` }} />
                </span>
              </div>
            ))}
          </div>
          {!brand.whiteLabel && <p className="text-center text-[10px] text-muted-foreground">{t("portal.powered")}</p>}
        </div>
      </div>
      <figcaption className="text-[12px] text-muted-foreground">
        {empty ? "Add a name or a logo and it appears across the top." : "What your clients see at the top of their page."}
      </figcaption>
    </figure>
  );
}

function LogoControl({ view, onView, admin }: { view: ClientsView; onView: (v: ClientsView) => void; admin: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"up" | "rm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logo = view.brand.logoUrl;

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return setError("Use a PNG, JPEG or WebP file. SVG isn't accepted.");
    if (file.size > LOGO_MAX_BYTES) return setError("That file is over 512 KB. Export a smaller PNG or WebP.");
    setBusy("up");
    try {
      onView(await uploadLogo(file));
      toast.success("Logo saved");
    } catch (e) {
      setError(message(e, "Couldn't save the logo."));
    } finally {
      setBusy(null);
      if (ref.current) ref.current.value = "";
    }
  }
  async function remove() {
    setBusy("rm");
    try {
      onView(await removeLogo());
      toast("Logo removed");
    } catch (e) {
      setError(message(e, "Couldn't remove the logo."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-[13px] text-muted-foreground" id="logo-label">
        Logo
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-16 w-44 place-items-center rounded-xl border border-dashed border-line-strong bg-background p-2 dark:bg-white" aria-labelledby="logo-label">
          {logo ? (
            <img src={logo} alt="Your logo" className="max-h-12 max-w-full object-contain" />
          ) : (
            <span className="text-[12px] text-muted-foreground dark:text-neutral-500">No logo yet</span>
          )}
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="hairline" size="sm" onClick={() => ref.current?.click()} disabled={busy !== null}>
              <ImageUp className="size-3.5" aria-hidden /> {busy === "up" ? "Uploading…" : logo ? "Replace" : "Upload logo"}
            </Button>
            {logo && (
              <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy !== null}>
                {busy === "rm" ? "Removing…" : "Remove"}
              </Button>
            )}
            <input
              ref={ref}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </div>
        )}
      </div>
      {(admin || error) && (
        <p className={cn("text-[12.5px]", error ? "text-tel-rose" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? "PNG, JPEG or WebP, up to 512 KB. A wide logo on a transparent background works best."}
        </p>
      )}
    </div>
  );
}

function BrandForm({ view, onView, admin, onDraft }: { view: ClientsView; onView: (v: ClientsView) => void; admin: boolean; onDraft: (b: Brand) => void }) {
  const b = view.brand;
  const [name, setName] = useState(b.name ?? "");
  const [color, setColor] = useState(b.color ?? "");
  const [url, setUrl] = useState(b.url ? b.url.replace(/\/$/, "") : "");
  const [whiteLabel, setWhiteLabel] = useState(b.whiteLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "name" | "color" | "url" | null; text: string } | null>(null);

  const colorOk = !color.trim() || HEX.test(color.trim());
  const urlOk = !url.trim() || !!normalizeWebsite(url, { httpsOnly: true });
  const dirty =
    name.trim() !== (b.name ?? "") ||
    color.trim().toLowerCase() !== (b.color ?? "") ||
    (url.trim() ? normalizeWebsite(url, { httpsOnly: true }) : null) !== b.url ||
    whiteLabel !== b.whiteLabel;

  const draft = (patch: Partial<{ name: string; color: string; url: string; whiteLabel: boolean }>) => {
    const n = patch.name ?? name;
    const c = patch.color ?? color;
    const u = patch.url ?? url;
    onDraft({
      name: n.trim() || null,
      color: HEX.test(c.trim()) ? c.trim().toLowerCase() : null,
      url: normalizeWebsite(u, { httpsOnly: true }),
      logoUrl: b.logoUrl,
      whiteLabel: patch.whiteLabel ?? whiteLabel,
    });
    setError(null);
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onView(await saveBrand({ name: name.trim(), color: color.trim().toLowerCase(), url: url.trim(), whiteLabel }));
      toast.success("Branding saved");
    } catch (e) {
      const code = e instanceof TeamApiError ? e.code : "";
      setError({ field: code === "bad_name" ? "name" : code === "bad_color" ? "color" : code === "bad_url" ? "url" : null, text: message(e, "Couldn't save the branding.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && colorOk && urlOk) void save();
      }}
    >
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Agency name</span>
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          placeholder="Your agency's name"
          autoComplete="organization"
          disabled={!admin}
          aria-invalid={error?.field === "name" ? true : undefined}
          onChange={(e) => {
            setName(e.target.value);
            draft({ name: e.target.value });
          }}
        />
        <span className="text-[12.5px] text-muted-foreground">Clients see &ldquo;Prepared by&rdquo; and this name.</span>
      </label>

      <div className="grid gap-1.5 text-[13px]">
        <label htmlFor="brand-color" className="text-muted-foreground">
          Accent colour
        </label>
        <div className="flex gap-2">
          <span className="relative h-11 w-14 shrink-0">
            {/* No colour yet: a struck-through swatch (a colour input can't show "none"); clicking still opens the picker. */}
            {!HEX.test(color.trim()) && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[10px] border border-line-strong bg-background bg-[linear-gradient(to_top_right,transparent_calc(50%-1px),var(--muted-foreground)_calc(50%-1px),var(--muted-foreground)_calc(50%+1px),transparent_calc(50%+1px))]"
              />
            )}
            <input
              type="color"
              aria-label="Pick the accent colour"
              className={cn(
                "h-11 w-14 cursor-pointer rounded-[10px] border border-line-strong bg-background p-1 disabled:cursor-default disabled:opacity-60",
                !HEX.test(color.trim()) && "opacity-0",
              )}
              value={HEX.test(color.trim()) ? color.trim().toLowerCase() : DEFAULT_SWATCH}
              disabled={!admin}
              onChange={(e) => {
                setColor(e.target.value);
                draft({ color: e.target.value });
              }}
            />
          </span>
          <input
            id="brand-color"
            className={cn(inputClass, "font-mono")}
            value={color}
            placeholder="None"
            maxLength={7}
            spellCheck={false}
            dir="ltr"
            disabled={!admin}
            aria-invalid={!colorOk || error?.field === "color" ? true : undefined}
            aria-describedby="brand-color-help"
            onChange={(e) => {
              setColor(e.target.value);
              draft({ color: e.target.value });
            }}
          />
        </div>
        <span id="brand-color-help" className={cn("text-[12.5px]", colorOk ? "text-muted-foreground" : "text-tel-rose")}>
          {colorOk ? "A thin bar in this colour runs across the top. Leave it empty for none." : "Use a colour like #1f6feb."}
        </span>
      </div>

      <label className="grid gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Your website</span>
        <input
          className={inputClass}
          value={url}
          placeholder="https://youragency.com"
          inputMode="url"
          autoComplete="url"
          dir="ltr"
          disabled={!admin}
          aria-invalid={!urlOk || error?.field === "url" ? true : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            draft({ url: e.target.value });
          }}
        />
        <span className={cn("text-[12.5px]", urlOk ? "text-muted-foreground" : "text-tel-rose")}>
          {urlOk ? "Clients get a link back to you." : "Use your website's https address."}
        </span>
      </label>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-edge px-4 py-3">
        <span className="grid gap-0.5">
          <span id="wl-label" className="text-[14px] font-medium">
            Hide &ldquo;Measured with Olmene&rdquo;
          </span>
          <span className="text-[13px] text-muted-foreground">
            {view.whiteLabelAvailable ? (
              "Client pages won't mention Olmene."
            ) : (
              <>
                Comes with the Team plan.{" "}
                {view.role === "owner" && (
                  <>
                    <Link href="/app/billing/" className="underline underline-offset-4 hover:text-foreground">
                      See plans
                    </Link>{" "}
                    or{" "}
                    <Link href="/business/#trial" className="underline underline-offset-4 hover:text-foreground">
                      try it free for 14 days
                    </Link>
                    .
                  </>
                )}
              </>
            )}
          </span>
        </span>
        <Switch
          checked={whiteLabel}
          disabled={!admin || (!view.whiteLabelAvailable && !whiteLabel)}
          aria-labelledby="wl-label"
          onCheckedChange={(v) => {
            setWhiteLabel(v);
            draft({ whiteLabel: v });
          }}
        />
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-tel-rose">
          {error.text}
        </p>
      )}

      {admin && (
        <div>
          <Button type="submit" variant="sheen" disabled={!dirty || !colorOk || !urlOk || busy}>
            {busy ? "Saving…" : "Save branding"}
          </Button>
        </div>
      )}
    </form>
  );
}

/**
 * How client pages look: logo, agency name, accent colour, website, and (on
 * plans that include it) hiding Olmene's name. A live preview beside it.
 * Admins and the owner change it; everyone else sees it.
 */
export function BrandSettings({ view, onView }: { view: ClientsView; onView: (v: ClientsView) => void }) {
  const admin = atLeast(view.role, "admin");
  const [draft, setDraft] = useState<Brand | null>(null);
  const shown = draft ? { ...draft, logoUrl: view.brand.logoUrl } : view.brand;
  const key = [view.brand.name, view.brand.color, view.brand.url, view.brand.whiteLabel].join("|");
  return (
    <section id="branding" className="grid scroll-mt-24 gap-6 rounded-2xl border bg-card p-6" aria-labelledby="branding-title">
      <div className="grid gap-1">
        <h2 id="branding-title" className="o-display text-2xl">
          Your branding
        </h2>
        <p className="text-[13.5px] text-muted-foreground">
          {admin ? "How the pages you send clients look." : "How the pages clients see look. Admins can change it."}
        </p>
      </div>
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <LogoControl view={view} onView={onView} admin={admin} />
          <BrandForm
            key={key}
            view={view}
            admin={admin}
            onDraft={setDraft}
            onView={(v) => {
              setDraft(null);
              onView(v);
            }}
          />
        </div>
        <div className="lg:sticky lg:top-24">
          <BrandPreview brand={shown} clientName={view.clients[0]?.name ?? "Your client"} />
        </div>
      </div>
    </section>
  );
}
