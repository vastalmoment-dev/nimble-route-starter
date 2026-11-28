import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export function PolicyPage() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-24 sm:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Button
          asChild
          variant="glass"
          size="sm"
          className="min-h-[44px] gap-2 rounded-full px-4 sm:min-h-0"
        >
          <Link to="/">
            <ArrowLeft className="size-4" />
            <span>{t("common.backHome")}</span>
          </Link>
        </Button>
      </div>

      <header className="border-b border-foreground/10 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cerulean">
          {t("policy.kicker")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          {t("policy.title")}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t("policy.intro")}
        </p>
      </header>

      <div className="mt-10 space-y-10 divide-y divide-foreground/10">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("policy.s1Title")}
          </h2>
          <p className="leading-relaxed text-foreground/85">{t("policy.s1P1")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s1P2")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s1P3")}</p>
        </section>

        <section className="space-y-3 pt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("policy.s2Title")}
          </h2>
          <p className="leading-relaxed text-foreground/85">{t("policy.s2P1")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s2P2")}</p>
        </section>

        <section className="space-y-3 pt-10">
          <div className="flex items-center gap-2.5 text-amber-400">
            <ShieldAlert className="size-5 shrink-0" />
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {t("policy.s3Title")}
            </h2>
          </div>
          <p className="leading-relaxed text-foreground/90">{t("policy.s3P1")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s3P2")}</p>
        </section>

        <section className="space-y-3 pt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("policy.s4Title")}
          </h2>
          <p className="leading-relaxed text-foreground/85">{t("policy.s4P1")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s4P2")}</p>
        </section>

        <section className="space-y-3 pt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {t("policy.s5Title")}
          </h2>
          <p className="leading-relaxed text-foreground/85">{t("policy.s5P1")}</p>
          <p className="leading-relaxed text-muted-foreground">{t("policy.s5P2")}</p>
        </section>
      </div>
    </div>
  );
}
