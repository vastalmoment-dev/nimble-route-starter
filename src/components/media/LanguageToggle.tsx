import { Globe } from "lucide-react";
import { siteLanguage, useSiteLanguage, type SiteLanguage } from "@/lib/i18n/language";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const lang = useSiteLanguage();

  return (
    <div
      role="group"
      aria-label="Language filter"
      className={cn(
        "inline-flex items-center rounded-full border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md",
        compact ? "h-9" : "h-9",
        className,
      )}
    >
      <span className="hidden items-center pl-2.5 pr-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
        <Globe className="size-3.5" />
      </span>
      {(
        [
          { id: "en", label: "EN" },
          { id: "fr", label: "FR" },
        ] as { id: SiteLanguage; label: string }[]
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={lang === opt.id}
          onClick={() => siteLanguage.set(opt.id)}
          className={cn(
            "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition",
            lang === opt.id
              ? "bg-brand-gradient text-primary-foreground shadow-sm"
              : "text-foreground/75 hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
