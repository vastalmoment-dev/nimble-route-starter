import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-24 sm:px-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Button asChild variant="glass" size="sm" className="gap-2 rounded-full px-4">
          <Link to="/">
            <ArrowLeft className="size-4" />
            <span>Back to Home</span>
          </Link>
        </Button>
      </div>

      <header className="border-b border-foreground/10 pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cerulean">
          Legal & Service Guidelines
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          Policy, DMCA & Acceptable Use
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Please read these terms carefully before browsing or streaming on SHADOW. By using this
          site, you agree to respect third-party copyright rules and protect server stability for
          every viewer.
        </p>
      </header>

      <div className="mt-10 space-y-10 divide-y divide-foreground/10">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            01. No Hosted Files & Third-Party Content Disclaimer
          </h2>
          <p className="leading-relaxed text-foreground/85">
            SHADOW does not host, upload, store, or distribute any video, audio, subtitle, or media
            files on our own servers. All streams, episodes, movies, and media embeds accessible
            through this site originate exclusively from independent third-party websites and
            external media providers.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            SHADOW functions solely as an informational catalog and playback interface that locates
            and displays content already publicly available on third-party sites. We have no control
            over, and assume no responsibility for, the availability, legality, or uptime of files
            hosted by external sources.
          </p>
        </section>

        <section className="space-y-3 pt-10">
          <div className="flex items-center gap-2.5 text-amber-400">
            <ShieldAlert className="size-5 shrink-0" />
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
              02. Anti-Bot Warning & Server Protection
            </h2>
          </div>
          <p className="leading-relaxed text-foreground/90">
            Do not use automated bots, scrapers, crawlers, download scripts, or high-frequency
            request tools to overwhelm or flood our servers. Automated traffic consumes bandwidth
            and degrades playback quality for genuine viewers.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            Any user, script, automated client, or IP address detected attempting to scrape catalog
            endpoints, bypass rate limits, or overwhelm SHADOW servers with excessive requests will
            be permanently banned and blocked without prior notice.
          </p>
        </section>

        <section className="space-y-3 pt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            03. Copyright & DMCA Removal Requests
          </h2>
          <p className="leading-relaxed text-foreground/85">
            We respect intellectual property rights. Because SHADOW does not host any media files on
            our servers, permanent file removal must be requested directly with the third-party host
            storing the file.
          </p>
          <p className="leading-relaxed text-muted-foreground">
            If you are a copyright owner or authorized representative and wish for a catalog
            reference link to be removed from SHADOW, identify the exact page URL and title so it
            can be promptly de-indexed.
          </p>
        </section>

        <section className="space-y-3 pt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            04. Viewer Privacy & Browser Preferences
          </h2>
          <p className="leading-relaxed text-foreground/85">
            Your watchlist, language selection, and playback resume timestamps are saved locally
            inside your own browser storage so you can continue shows where you left off across
            sessions. No personal account registration is required to browse or stream.
          </p>
        </section>
      </div>
    </div>
  );
}
