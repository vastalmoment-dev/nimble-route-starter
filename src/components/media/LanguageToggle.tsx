import { Globe } from "lucide-react";
import { useT, type SiteLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { lang, setLang, t } = useT();

  return (
    <div
      role="group"
      aria-label={t("shell.langFilter")}
      className={cn(
        "inline-flex items-center rounded-full border border-foreground/15 bg-scrim/75 p-0.5 backdrop-blur-md",
        compact ? "min-h-[44px] sm:h-9 sm:min-h-0" : "min-h-[44px] sm:h-10 sm:min-h-0",
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
          onClick={() => setLang(opt.id)}
          className={cn(
            "min-h-[38px] rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider transition sm:min-h-0",
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
