import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ShadowMark } from "./ShadowLogo";

const STORAGE_KEY = "shadow:intro-played";
const COLORS = ["bg-genre-anime", "bg-genre-kdrama", "bg-genre-hollywood", "bg-genre-bollywood", "bg-genre-cartoons", "bg-cerulean"];

// Deterministic so server and client render the same particles.
const PARTICLES = Array.from({ length: 42 }, (_, i) => {
  const angle = (i * 137.508 * Math.PI) / 180;
  const radius = 220 + ((i * 53) % 260);
  return {
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius * 0.7),
    size: 3 + (i % 4),
    delay: (i % 14) * 0.035,
    color: COLORS[i % COLORS.length]!,
  };
});

/** Startup intro: genre particles converge, light traces the S, the shadow merges, one pulse, fade. */
export function IntroAnimation() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) setVisible(false);
      else sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage blocked: just play the intro.
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className="intro-root fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-background grain"
      onAnimationEnd={(e) => {
        if (e.animationName === "intro-out") setVisible(false);
      }}
    >
      <div className="relative flex flex-col items-center">
        <div className="pointer-events-none absolute left-1/2 top-[38%]">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className={cn("intro-particle absolute rounded-full", p.color)}
              style={
                {
                  width: p.size,
                  height: p.size,
                  marginLeft: -p.size / 2,
                  marginTop: -p.size / 2,
                  "--px": `${p.x}px`,
                  "--py": `${p.y}px`,
                  "--delay": `${p.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="intro-logo">
          <ShadowMark
            className="size-36 sm:size-44"
            withGlow
            primaryClassName="intro-trace"
            glowClassName="intro-trace"
            shadowClassName="intro-shadow"
          />
        </div>
        <span className="intro-wordmark mt-8 pl-[0.42em] font-display text-2xl font-bold uppercase tracking-[0.42em] text-foreground sm:text-3xl">
          Shadow
        </span>
      </div>
    </div>
  );
}
