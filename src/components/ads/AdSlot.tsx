import { useState } from "react";
import { AD_SLOTS, type AdSlotId } from "@/lib/ads/config";
import { PROMO_BANNERS } from "@/lib/promo/banners";
import { cn } from "@/lib/utils";

/**
 * Every ad space shows the 1xBet partner promo (image + promo code + affiliate link).
 */
export function AdSlot({ slot, className }: { slot: AdSlotId; className?: string }) {
  const cfg = AD_SLOTS[slot];
  const promo = PROMO_BANNERS[0]!;
  const [copied, setCopied] = useState(false);
  const wide = cfg.width > cfg.height * 2;
  const copy = async () => {
    if (!promo.code) return;
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <aside
      data-ad-slot={slot}
      aria-label={`Sponsored: ${promo.partner}`}
      className={cn("shrink-0 rounded-xl bg-brand-gradient p-px", className)}
      style={{ width: cfg.width, maxWidth: "100%" }}
    >
      <div className={cn("flex size-full gap-3 rounded-[calc(0.75rem-1px)] bg-card p-3", wide ? "flex-row items-center" : "flex-col")}>
        {promo.image && (
          <a href={promo.href} target="_blank" rel="sponsored noopener noreferrer" className="shrink-0">
            <img
              src={promo.image}
              alt={`${promo.partner} promotional banner`}
              loading="lazy"
              className={cn("aspect-square rounded-lg object-cover", wide ? "h-16 w-16" : "w-full")}
            />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sponsored · {promo.partner}</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-foreground">{promo.headline}</p>
        </div>
        <div className={cn("flex gap-2", wide ? "shrink-0 items-center" : "flex-col")}>
          {promo.code && (
            <button
              type="button"
              onClick={copy}
              className="rounded-md border border-dashed border-cerulean/60 px-2 py-1 font-mono text-xs font-bold tracking-wider text-cerulean"
            >
              {copied ? "Copied!" : promo.code}
            </button>
          )}
          <a
            href={promo.href}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="rounded-md bg-brand-gradient px-3 py-1.5 text-center text-xs font-semibold text-primary-foreground"
          >
            {promo.ctaLabel}
          </a>
        </div>
        <p className="text-[9px] text-muted-foreground">18+ · T&Cs apply</p>
      </div>
    </aside>
  );
}
