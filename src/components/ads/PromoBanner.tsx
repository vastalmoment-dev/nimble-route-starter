import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROMO_BANNERS, type PromoBanner as Promo } from "@/lib/promo/banners";
import { cn } from "@/lib/utils";

export function PromoBanner({
  banner = PROMO_BANNERS[0],
  className,
}: {
  banner?: Promo;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  if (!banner) return null;
  const copy = async () => {
    if (!banner.code) return;
    try {
      await navigator.clipboard.writeText(banner.code);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside
      aria-label={`Sponsored: ${banner.partner}`}
      className={cn("px-4 sm:px-8 lg:px-12", className)}
    >
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-surface/90 shadow-card backdrop-blur-sm">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            {banner.image && (
              <a
                href={banner.href}
                target="_blank"
                rel="sponsored noopener noreferrer"
                aria-label={`${banner.partner} — ${banner.headline}`}
                className="block shrink-0 self-start sm:self-center"
              >
                <img
                  src={banner.image}
                  alt={`${banner.partner} promotional banner`}
                  loading="lazy"
                  decoding="async"
                  className="aspect-square w-24 shrink-0 rounded-xl border border-foreground/10 object-cover object-center transition duration-300 hover:scale-[1.02] sm:size-28"
                />
              </a>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cerulean">
                Sponsored · {banner.partner}
              </p>
              {banner.html ? (
                <div className="mt-1.5" dangerouslySetInnerHTML={{ __html: banner.html }} />
              ) : (
                <>
                  <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
                    {banner.headline}
                  </h3>
                  {banner.body && (
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {banner.body}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:flex-col sm:items-end lg:flex-row">
            {banner.code && (
              <button
                type="button"
                onClick={() => void copy()}
                aria-label={`Copy promo code ${banner.code}`}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-foreground/15 bg-background/80 px-3.5 py-2 font-mono text-sm font-semibold tabular-nums tracking-widest text-foreground transition hover:border-cerulean/60 hover:bg-background"
              >
                <span>{banner.code}</span>
                {copied ? (
                  <Check className="size-4 text-cerulean" />
                ) : (
                  <Copy className="size-4 text-muted-foreground" />
                )}
              </button>
            )}
            <a
              href={banner.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              <span>{banner.ctaLabel}</span>
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
        {banner.disclaimer && (
          <p className="border-t border-foreground/10 bg-background/40 px-5 py-2.5 text-[11px] text-muted-foreground sm:px-6">
            {banner.disclaimer}
          </p>
        )}
      </div>
    </aside>
  );
}
