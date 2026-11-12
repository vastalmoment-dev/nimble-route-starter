import { Check, Copy, Minus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PROMO_BANNERS } from "@/lib/promo/banners";
import { cn } from "@/lib/utils";

const promo = PROMO_BANNERS[0]!;

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(promo.code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return { copied, copy };
}

/**
 * Centered 1xBet popup. `storageKey` gates it to once per browser session; omit to show on every mount.
 * Minimizing collapses it to a small corner pill that reopens it.
 */
export function PromoPopup({ delay = 0, storageKey }: { delay?: number; storageKey?: string }) {
  const [state, setState] = useState<"hidden" | "open" | "min">("hidden");
  const { copied, copy } = useCopy();

  useEffect(() => {
    if (storageKey && sessionStorage.getItem(storageKey)) return;
    const t = setTimeout(() => {
      setState("open");
      if (storageKey) sessionStorage.setItem(storageKey, "1");
    }, delay);
    return () => clearTimeout(t);
  }, [delay, storageKey]);

  if (state === "hidden") return null;

  if (state === "min") {
    return (
      <div className="fixed bottom-4 left-4 z-[70] flex items-center gap-1 rounded-full bg-brand-gradient p-px shadow-glow">
        <button
          type="button"
          onClick={() => setState("open")}
          className="flex items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-3 text-xs font-semibold"
        >
          {promo.image && <img src={promo.image} alt="" className="size-7 rounded-full object-cover" />}
          {promo.partner} · <span className="font-mono text-cerulean">{promo.code}</span>
        </button>
        <button type="button" aria-label="Close ad" onClick={() => setState("hidden")} className="mr-1 rounded-full p-1 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-scrim/70 p-4 backdrop-blur-sm animate-in fade-in" role="dialog" aria-modal="true" aria-label={`${promo.partner} offer`}>
      <div className="w-full max-w-sm rounded-2xl bg-brand-gradient p-px shadow-glow animate-in zoom-in-95">
        <div className="relative overflow-hidden rounded-[calc(1rem-1px)] bg-card">
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            <button type="button" aria-label="Minimize ad" onClick={() => setState("min")} className="rounded-full bg-scrim/70 p-1.5 text-foreground hover:bg-scrim">
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label="Close ad" onClick={() => setState("hidden")} className="rounded-full bg-scrim/70 p-1.5 text-foreground hover:bg-scrim">
              <X className="size-4" />
            </button>
          </div>
          {promo.image && (
            <a href={promo.href} target="_blank" rel="sponsored noopener noreferrer">
              <img src={promo.image} alt={`${promo.partner} promotional banner`} className="aspect-square w-full object-cover" />
            </a>
          )}
          <div className="space-y-3 p-5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Sponsored · {promo.partner}</p>
            <p className="font-display text-lg font-bold leading-snug">{promo.headline}</p>
            <PromoActions copied={copied} copy={copy} />
            <p className="text-[10px] text-muted-foreground">{promo.disclaimer}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromoActions({ copied, copy, compact }: { copied: boolean; copy: () => void; compact?: boolean }) {
  return (
    <div className={cn("flex gap-2", compact ? "flex-col" : "flex-col sm:flex-row")}>
      <button
        type="button"
        onClick={copy}
        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-cerulean/60 px-3 py-2 font-mono text-sm font-bold tracking-wider text-cerulean"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? "Copied!" : promo.code}
      </button>
      <a
        href={promo.href}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="flex-1 rounded-lg bg-brand-gradient px-3 py-2 text-center text-sm font-semibold text-primary-foreground"
      >
        {promo.ctaLabel}
      </a>
    </div>
  );
}

/** Small floating side ad, minimizable to a slim tab on the right edge. */
export function FloatingPromo() {
  const [min, setMin] = useState(false);
  const { copied, copy } = useCopy();
  if (min) {
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        aria-label={`Show ${promo.partner} offer`}
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-lg bg-brand-gradient px-1.5 py-3 text-[11px] font-bold text-primary-foreground [writing-mode:vertical-rl]"
      >
        {promo.code}
      </button>
    );
  }
  return (
    <aside aria-label={`Sponsored: ${promo.partner}`} className="fixed bottom-4 right-4 z-40 w-48 rounded-xl bg-brand-gradient p-px shadow-glow animate-in slide-in-from-right">
      <div className="relative space-y-2 rounded-[calc(0.75rem-1px)] bg-card p-2.5">
        <button type="button" aria-label="Minimize ad" onClick={() => setMin(true)} className="absolute right-1.5 top-1.5 z-10 rounded-full bg-scrim/70 p-1 hover:bg-scrim">
          <Minus className="size-3.5" />
        </button>
        {promo.image && (
          <a href={promo.href} target="_blank" rel="sponsored noopener noreferrer">
            <img src={promo.image} alt={`${promo.partner} promotional banner`} loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          </a>
        )}
        <p className="text-xs font-semibold leading-snug">{promo.headline}</p>
        <PromoActions copied={copied} copy={copy} compact />
        <p className="text-[9px] text-muted-foreground">18+ · T&Cs apply</p>
      </div>
    </aside>
  );
}
