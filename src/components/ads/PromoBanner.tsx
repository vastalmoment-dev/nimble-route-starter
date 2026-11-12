import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { PROMO_BANNERS, type PromoBanner as Promo } from "@/lib/promo/banners";
import { cn } from "@/lib/utils";

export function PromoBanner({ banner = PROMO_BANNERS[0], className }: { banner?: Promo; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!banner) return null;
  const copy = async () => {
    if (!banner.code) return;
    try {
      await navigator.clipboard.writeText(banner.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside aria-label={`Sponsored: ${banner.partner}`} className={cn("px-4 sm:px-8 lg:px-12", className)}>
      <div className="rounded-2xl bg-brand-gradient p-px shadow-glow">
        <div className="relative overflow-hidden rounded-[calc(1rem-1px)] bg-card">
          <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
          <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
            {banner.image && (
              <img
                src={banner.image}
                alt={`${banner.partner} promotional banner`}
                loading="lazy"
                className="mx-auto aspect-square w-full max-w-xs shrink-0 rounded-xl object-cover object-center ring-1 ring-inset ring-foreground/10 sm:mx-0 sm:h-48 sm:w-48 sm:max-w-none"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Sponsored · {banner.partner}
              </p>
              {banner.html ? (
                <div dangerouslySetInnerHTML={{ __html: banner.html }} />
              ) : (
                <>
                  <h3 className="font-display text-lg font-bold sm:text-xl">{banner.headline}</h3>
                  {banner.body && <p className="mt-1 text-sm text-muted-foreground">{banner.body}</p>}
                </>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {banner.code && (
                  <button
                    type="button"
                    onClick={() => void copy()}
                    aria-label={`Copy promo code ${banner.code}`}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-cerulean/60 bg-background/60 px-3 py-2 font-mono text-sm font-semibold tracking-widest transition hover:border-cerulean"
                  >
                    {banner.code}
                    {copied ? <Check className="size-4 text-cerulean" /> : <Copy className="size-4 text-muted-foreground" />}
                  </button>
                )}
                <a
                  href={banner.href}
                  target="_blank"
                  rel="sponsored noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold transition hover:opacity-90"
                >
                  {banner.ctaLabel} <ExternalLink className="size-4" />
                </a>
              </div>
            </div>
          </div>
          {banner.disclaimer && (
            <p className="relative border-t border-foreground/5 px-5 py-2 text-[10px] text-muted-foreground sm:px-6">{banner.disclaimer}</p>
          )}
        </div>
      </div>
    </aside>
  );
}
