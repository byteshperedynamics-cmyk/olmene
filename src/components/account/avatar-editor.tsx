"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { LogoLoader } from "@/components/logo-loader";
import { AccountError, avatarFromGoogle, removeAvatar, renderSquare, uploadAvatar, type Identity } from "@/lib/account-client";
import { UserAvatar } from "./user-avatar";

const FRAME = 264; // the crop circle, in CSS pixels
const MAX_FILE = 15 * 1024 * 1024; // the photo is shrunk to 512px before upload

type Pose = { z: number; x: number; y: number }; // zoom (1 = cover), top-left offset in frame px

function clampPose(p: Pose, w: number, h: number): Pose {
  const s = (FRAME / Math.min(w, h)) * p.z;
  const minX = FRAME - w * s;
  const minY = FRAME - h * s;
  return { z: p.z, x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
}

function centred(w: number, h: number, z = 1): Pose {
  const s = (FRAME / Math.min(w, h)) * z;
  return { z, x: (FRAME - w * s) / 2, y: (FRAME - h * s) / 2 };
}

/**
 * Pick a photo, then frame it: drag to move, slider, wheel or +/- to zoom,
 * arrow keys to nudge. The browser crops it to a 512px square before
 * uploading, so a 12 MB phone photo goes up as about 50 KB.
 */
function CropDialog({ file, onClose, onSaved }: { file: File | null; onClose: () => void; onSaved: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [pose, setPose] = useState<Pose>({ z: 1, x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.src = url;
    let live = true;
    el.decode()
      .then(() => {
        if (!live) return;
        setImg(el);
        setPose(centred(el.naturalWidth, el.naturalHeight));
      })
      .catch(() => {
        if (!live) return;
        toast.error("This image type can't be opened here. Use a JPEG, PNG or WebP photo.");
        onClose();
      });
    return () => {
      live = false;
      URL.revokeObjectURL(url);
      setImg(null);
    };
  }, [file, onClose]);

  const w = img?.naturalWidth ?? 1;
  const h = img?.naturalHeight ?? 1;
  const s = (FRAME / Math.min(w, h)) * pose.z;
  const set = useCallback((p: Pose) => setPose(clampPose(p, w, h)), [w, h]);

  // Zoom around the centre of the circle, so the face you framed stays put.
  const zoomTo = (z: number) => {
    const nz = Math.min(4, Math.max(1, z));
    const cx = (FRAME / 2 - pose.x) / s;
    const cy = (FRAME / 2 - pose.y) / s;
    const ns = (FRAME / Math.min(w, h)) * nz;
    set({ z: nz, x: FRAME / 2 - cx * ns, y: FRAME / 2 - cy * ns });
  };

  async function save() {
    if (!img || saving) return;
    setSaving(true);
    try {
      const blob = await renderSquare(img, { x: -pose.x / s, y: -pose.y / s, size: FRAME / s });
      await uploadAvatar(blob);
      toast.success("Photo updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "Couldn't save your photo. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[26rem] gap-5 rounded-2xl">
        <DialogHeader>
          <DialogTitle>Frame your photo</DialogTitle>
          <DialogDescription>Drag to move it. Zoom with the slider.</DialogDescription>
        </DialogHeader>
        <div className="grid place-items-center">
          <div
            tabIndex={0}
            role="application"
            aria-label="Photo position. Arrow keys move the photo; plus and minus zoom."
            className="relative touch-none cursor-grab overflow-hidden rounded-full bg-secondary ring-1 ring-rim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, px: pose.x, py: pose.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== e.pointerId) return;
              set({ z: pose.z, x: d.px + (e.clientX - d.sx), y: d.py + (e.clientY - d.sy) });
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => zoomTo(pose.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 24 : 8;
              const k = e.key;
              if (k === "ArrowLeft") set({ ...pose, x: pose.x + step });
              else if (k === "ArrowRight") set({ ...pose, x: pose.x - step });
              else if (k === "ArrowUp") set({ ...pose, y: pose.y + step });
              else if (k === "ArrowDown") set({ ...pose, y: pose.y - step });
              else if (k === "+" || k === "=") zoomTo(pose.z + 0.1);
              else if (k === "-") zoomTo(pose.z - 0.1);
              else return;
              e.preventDefault();
            }}
          >
            {img ? (
              <img
                src={img.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left select-none"
                style={{ width: w * s, height: h * s, transform: `translate(${pose.x}px, ${pose.y}px)` }}
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center">
                <LogoLoader size={28} />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 px-1">
          <button type="button" aria-label="Zoom out" onClick={() => zoomTo(pose.z - 0.25)} className="o-hit relative text-muted-foreground hover:text-foreground">
            <Minus className="size-4" aria-hidden />
          </button>
          <Slider value={[pose.z]} min={1} max={4} step={0.01} onValueChange={([z]) => zoomTo(z)} aria-label="Zoom" className="flex-1" />
          <button type="button" aria-label="Zoom in" onClick={() => zoomTo(pose.z + 0.25)} className="o-hit relative text-muted-foreground hover:text-foreground">
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="hairline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!img || saving}>
            {saving ? (
              <>
                <LogoLoader size={14} /> Saving…
              </>
            ) : (
              "Save photo"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The profile picture with its three actions: upload (then frame), use the
 * Google photo, remove. `onChanged` refreshes whatever shows the avatar.
 */
export function AvatarEditor({
  identity,
  hasOwnPhoto,
  onChanged,
  size = 88,
  compact = false,
}: {
  identity: Identity;
  hasOwnPhoto: boolean;
  onChanged: () => void;
  size?: number;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"google" | "remove" | null>(null);
  const close = useCallback(() => setFile(null), []);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file (JPEG, PNG or WebP).");
    if (f.size > MAX_FILE) return toast.error("That photo is over 15 MB. Choose a smaller one.");
    setFile(f);
  }

  async function run(kind: "google" | "remove") {
    setBusy(kind);
    try {
      if (kind === "google") await avatarFromGoogle();
      else await removeAvatar();
      toast.success(kind === "google" ? "Using your Google photo" : "Photo removed");
      onChanged();
    } catch (e) {
      toast.error(e instanceof AccountError ? e.message : "That didn't work. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  const canUseGoogle = !!identity.providerAvatarUrl && !hasOwnPhoto;

  return (
    <div className={compact ? "flex flex-col items-center gap-4" : "flex flex-wrap items-center gap-5"}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={hasOwnPhoto || identity.avatarUrl ? "Change photo" : "Add a photo"}
        className="group relative cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <UserAvatar src={identity.avatarUrl} initials={identity.initials} size={size} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5" aria-hidden />
        </span>
        <span className="absolute -bottom-0.5 -end-0.5 grid size-7 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-sm">
          <Camera className="size-3.5" aria-hidden />
        </span>
      </button>
      <div className={compact ? "flex flex-wrap justify-center gap-2" : "grid gap-2"}>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="hairline" onClick={() => input.current?.click()}>
            {hasOwnPhoto ? "Change photo" : "Upload a photo"}
          </Button>
          {canUseGoogle && (
            <Button size="sm" variant="ghost" onClick={() => run("google")} disabled={!!busy}>
              {busy === "google" ? <LogoLoader size={14} /> : null} Keep my Google photo
            </Button>
          )}
          {hasOwnPhoto && (
            <Button size="sm" variant="ghost" onClick={() => run("remove")} disabled={!!busy} className="text-muted-foreground">
              {busy === "remove" ? <LogoLoader size={14} /> : <Trash2 className="size-3.5" aria-hidden />} Remove
            </Button>
          )}
        </div>
        {!compact && <p className="text-[13px] text-muted-foreground">JPEG, PNG or WebP. It shows in Olmene and on progress links you share.</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <CropDialog file={file} onClose={close} onSaved={onChanged} />
    </div>
  );
}
