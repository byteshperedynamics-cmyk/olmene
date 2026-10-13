import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepState = "done" | "now" | "pending" | "failed";

export interface RailStep {
  key: string;
  label: string;
  state: StepState;
  /** Mono meta on the trailing edge, e.g. "0:38" or "now". */
  meta?: string;
}

/**
 * StepRail — vertical timeline. The rail fills green as steps complete, the
 * active step's node pulses. `orientation="horizontal"` is the compact mobile
 * form (scrolls inside itself).
 */
export function StepRail({
  steps,
  orientation = "vertical",
  className,
}: {
  steps: RailStep[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  if (orientation === "horizontal") {
    return (
      <ol className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
        {steps.map((s) => (
          <li
            key={s.key}
            aria-current={s.state === "now" ? "step" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
              s.state === "done" && "border-tel-emerald/40 text-foreground",
              s.state === "now" && "border-foreground/60 bg-chip font-medium text-foreground",
              s.state === "pending" && "text-muted-foreground",
              s.state === "failed" && "border-tel-rose/50 text-tel-rose",
            )}
          >
            <Node state={s.state} small /> {s.label}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className={cn("grid", className)}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li
            key={s.key}
            aria-current={s.state === "now" ? "step" : undefined}
            className={cn(
              "relative flex items-center gap-2.5 py-[7px] text-[13px]",
              s.state === "pending" ? "text-muted-foreground" : "text-foreground",
              s.state === "now" && "font-medium",
              s.state === "failed" && "text-tel-rose",
            )}
          >
            {!last && (
              <span
                aria-hidden
                className={cn(
                  "absolute start-[7px] top-[24px] bottom-[-8px] w-px",
                  s.state === "done" ? "bg-tel-emerald/70" : "bg-line-strong",
                )}
              />
            )}
            <Node state={s.state} />
            <span className="min-w-0 flex-1">{s.label}</span>{" "}
            {s.meta && <span className="shrink-0 ps-2 font-mono text-[11px] tabular-nums text-faint">{s.meta}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Node({ state, small }: { state: StepState; small?: boolean }) {
  const size = small ? "size-3" : "size-[15px]";
  if (state === "done") {
    return (
      <span className={cn("relative z-[1] grid shrink-0 place-items-center rounded-full bg-tel-emerald text-background transition-colors duration-[var(--dur-state)]", size)}>
        <Check className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className={cn("relative z-[1] grid shrink-0 place-items-center rounded-full bg-tel-rose text-background", size)}>
        <X className="size-2.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "relative z-[1] shrink-0 rounded-full border bg-card",
        size,
        state === "now" ? "border-foreground animate-[o-pulse-dot_1.8s_ease-out_infinite] o-anim" : "border-line-strong",
      )}
    />
  );
}
