import { Link } from "@tanstack/react-router";
import { ArrowRight, Bell, BellRing, Check, Smartphone, Tv } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NOTIFY_STORAGE_KEY_PREFIX = "shadow_app_notify_";

function useReleaseReminder(platform: "ios" | "android") {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(`${NOTIFY_STORAGE_KEY_PREFIX}${platform}`) === "1");
    } catch {
      setEnabled(false);
    }
  }, [platform]);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        if (next) {
          window.localStorage.setItem(`${NOTIFY_STORAGE_KEY_PREFIX}${platform}`, "1");
        } else {
          window.localStorage.removeItem(`${NOTIFY_STORAGE_KEY_PREFIX}${platform}`);
        }
      } catch {
        // Ignore storage write errors in restricted privacy modes
      }
      return next;
    });
  };

  return { enabled, toggle };
}

function AppleLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
      <path d="M16.37 12.64c-.02-2.16 1.76-3.2 1.84-3.25-1-1.47-2.57-1.67-3.12-1.69-1.32-.14-2.6.78-3.27.78-.68 0-1.71-.76-2.82-.74-1.44.02-2.77.84-3.51 2.13-1.51 2.62-.39 6.49 1.07 8.61.72 1.03 1.56 2.19 2.67 2.15 1.08-.04 1.49-.69 2.79-.69 1.3 0 1.67.69 2.8.67 1.16-.02 1.89-1.05 2.59-2.09.82-1.19 1.15-2.36 1.17-2.42-.03-.01-2.29-.88-2.31-3.46ZM14.23 6.26c.59-.72.99-1.71.88-2.71-.85.03-1.9.57-2.51 1.28-.54.63-1.02 1.65-.9 2.62.95.07 1.93-.48 2.53-1.19Z" />
    </svg>
  );
}

function AndroidLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
      <path d="M16.6 7.57l1.39-2.4a.42.42 0 0 0-.15-.57.42.42 0 0 0-.57.15l-1.41 2.44A8.17 8.17 0 0 0 12 6.29c-1.4 0-2.72.32-3.86.9L6.73 4.75a.42.42 0 0 0-.57-.15.42.42 0 0 0-.15.57l1.39 2.4A7.63 7.63 0 0 0 4 13.75h16a7.63 7.63 0 0 0-3.4-6.18ZM9 11.4a.82.82 0 1 1 0-1.64.82.82 0 0 1 0 1.64Zm6 0a.82.82 0 1 1 0-1.64.82.82 0 0 1 0 1.64ZM4.5 14.95v3.55A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3.55h-15Z" />
    </svg>
  );
}

export function GetAppPage() {
  const { t } = useT();
  const iosReminder = useReleaseReminder("ios");
  const androidReminder = useReleaseReminder("android");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-24 md:px-8">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cerulean">
          {t("getApp.kicker")}
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance md:text-5xl">
          <span className="text-brand-gradient">{t("getApp.title")}</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          {t("getApp.subtitle")}
        </p>
      </header>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <article className="flex flex-col justify-between rounded-2xl border border-foreground/10 bg-surface/80 p-6 sm:p-8">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl border border-cerulean/30 bg-cerulean/10 text-cerulean">
                <AppleLogoIcon />
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold">
                {t("getApp.comingSoon")}
              </span>
            </div>

            <h2 className="mt-6 font-display text-2xl font-bold tracking-tight">
              {t("getApp.iosTitle")}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {t("getApp.iosPlatform")}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-foreground/85">{t("getApp.iosDesc")}</p>

            <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-cerulean" />
                <span>{t("getApp.iosFeat1")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-cerulean" />
                <span>{t("getApp.iosFeat2")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-cerulean" />
                <span>{t("getApp.iosFeat3")}</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 border-t border-foreground/10 pt-5">
            <Button
              type="button"
              variant={iosReminder.enabled ? "brand" : "glass"}
              size="lg"
              aria-pressed={iosReminder.enabled}
              onClick={iosReminder.toggle}
              className="min-h-[44px] w-full justify-center gap-2"
            >
              {iosReminder.enabled ? (
                <>
                  <BellRing className="size-4" />
                  <span>{t("getApp.notified")}</span>
                </>
              ) : (
                <>
                  <Bell className="size-4" />
                  <span>{t("getApp.notifyMe")}</span>
                </>
              )}
            </Button>
          </div>
        </article>

        <article className="flex flex-col justify-between rounded-2xl border border-foreground/10 bg-surface/80 p-6 sm:p-8">
          <div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-12 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-400">
                <AndroidLogoIcon />
              </div>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold">
                {t("getApp.comingSoon")}
              </span>
            </div>

            <h2 className="mt-6 font-display text-2xl font-bold tracking-tight">
              {t("getApp.androidTitle")}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {t("getApp.androidPlatform")}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-foreground/85">
              {t("getApp.androidDesc")}
            </p>

            <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>{t("getApp.androidFeat1")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>{t("getApp.androidFeat2")}</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                <span>{t("getApp.androidFeat3")}</span>
              </li>
            </ul>
          </div>

          <div className="mt-8 border-t border-foreground/10 pt-5">
            <Button
              type="button"
              variant={androidReminder.enabled ? "brand" : "glass"}
              size="lg"
              aria-pressed={androidReminder.enabled}
              onClick={androidReminder.toggle}
              className="min-h-[44px] w-full justify-center gap-2"
            >
              {androidReminder.enabled ? (
                <>
                  <BellRing className="size-4" />
                  <span>{t("getApp.notified")}</span>
                </>
              ) : (
                <>
                  <Bell className="size-4" />
                  <span>{t("getApp.notifyMe")}</span>
                </>
              )}
            </Button>
          </div>
        </article>
      </div>

      <section className="mt-10 flex flex-col items-start justify-between gap-5 rounded-2xl border border-foreground/10 bg-background/60 p-6 sm:flex-row sm:items-center sm:p-8">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-cerulean">
            <Smartphone className={cn("size-4 shrink-0")} />
            <Tv className="size-4 shrink-0" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              {t("getApp.webReadyTitle")}
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("getApp.webReadyDesc")}
          </p>
        </div>
        <Button asChild variant="hero" size="lg" className="min-h-[44px] shrink-0 gap-2">
          <Link to="/anime">
            <span>{t("getApp.browseNow")}</span>
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
