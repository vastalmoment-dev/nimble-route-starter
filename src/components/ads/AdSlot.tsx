import { AD_SLOTS, adsterraDocument, getAdKey, type AdSlotId } from "@/lib/ads/config";
import { cn } from "@/lib/utils";

/**
 * Pre-sized, isolated ad container. Renders a quiet placeholder until a network key is configured,
 * then loads the network script inside a sandboxed iframe so it can't affect the app.
 */
export function AdSlot({ slot, className }: { slot: AdSlotId; className?: string }) {
  const cfg = AD_SLOTS[slot];
  const key = getAdKey(slot);
  return (
    <aside
      data-ad-slot={slot}
      aria-label="Advertisement"
      className={cn("flex shrink-0 items-center justify-center overflow-hidden", className)}
      style={{ width: cfg.width, height: cfg.height, maxWidth: "100%" }}
    >
      {key ? (
        <iframe
          title={`Advertisement ${cfg.label}`}
          width={cfg.width}
          height={cfg.height}
          srcDoc={adsterraDocument(key, cfg.width, cfg.height)}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
          className="border-0"
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/10 bg-surface/40 text-center">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/60">
            Ad space
          </span>
          <span className="text-[10px] text-muted-foreground/40">
            {cfg.width}×{cfg.height}
          </span>
        </div>
      )}
    </aside>
  );
}
