import { useId } from "react";
import { cn } from "@/lib/utils";

/** The S: one continuous curve, drawn twice — a midnight "shadow" offset behind a gradient light. */
export const S_PATH =
  "M73 25 C66 14 40 11 31 22 C21 34 32 44 50 49 C68 54 80 63 71 77 C62 90 35 89 26 77";

export function ShadowMark({
  className,
  primaryClassName,
  shadowClassName,
  glowClassName,
  withGlow = false,
}: {
  className?: string;
  primaryClassName?: string;
  shadowClassName?: string;
  glowClassName?: string;
  withGlow?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" className={cn("overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`g-${id}`} x1="26" y1="16" x2="74" y2="86" gradientUnits="userSpaceOnUse">
          <stop offset="0%" style={{ stopColor: "var(--cerulean)" }} />
          <stop offset="58%" style={{ stopColor: "var(--violet)" }} />
          <stop offset="100%" style={{ stopColor: "var(--magenta)" }} />
        </linearGradient>
        <filter id={`b-${id}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      <g className={shadowClassName}>
        <path
          d={S_PATH}
          transform="translate(7 6)"
          fill="none"
          strokeWidth="14"
          strokeLinecap="round"
          style={{ stroke: "var(--midnight)", opacity: 0.78 }}
        />
      </g>
      {withGlow && (
        <path
          d={S_PATH}
          pathLength={1}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          filter={`url(#b-${id})`}
          className={glowClassName}
          style={{ stroke: "var(--cerulean)" }}
        />
      )}
      <path
        d={S_PATH}
        pathLength={1}
        fill="none"
        stroke={`url(#g-${id})`}
        strokeWidth="13"
        strokeLinecap="round"
        className={primaryClassName}
      />
    </svg>
  );
}

export function ShadowWordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <ShadowMark className="size-8 shrink-0" />
      {!compact && (
        <span className="font-display text-lg font-bold uppercase tracking-[0.32em] text-foreground">
          Shadow
        </span>
      )}
    </span>
  );
}
