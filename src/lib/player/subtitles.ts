export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseTimestamp(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const secPart = parts[parts.length - 1]!;
  const minPart = parts[parts.length - 2]!;
  const hrPart = parts.length === 3 ? parts[0]! : "0";
  const hr = Number(hrPart);
  const min = Number(minPart);
  const sec = Number(secPart);
  if (!Number.isFinite(hr) || !Number.isFinite(min) || !Number.isFinite(sec)) return null;
  return hr * 3600 + min * 60 + sec;
}

function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

export function parseVtt(raw: string): SubtitleCue[] {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);
    if (!lines.length) continue;

    const first = lines[0]!;
    if (
      first.startsWith("WEBVTT") ||
      first.startsWith("NOTE") ||
      first.startsWith("STYLE") ||
      first.startsWith("REGION")
    ) {
      continue;
    }

    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx < 0) continue;

    const timingLine = lines[timingIdx]!;
    const [left, rightWithSettings] = timingLine.split("-->");
    if (!left || !rightWithSettings) continue;
    const right = rightWithSettings.trim().split(/\s+/)[0] ?? "";

    const start = parseTimestamp(left);
    const end = parseTimestamp(right);
    if (start === null || end === null || end <= start) continue;

    const text = cleanCueText(lines.slice(timingIdx + 1).join("\n"));
    if (!text) continue;
    cues.push({ start, end, text });
  }

  return cues.sort((a, b) => a.start - b.start);
}

export function activeCueText(cues: SubtitleCue[], currentTime: number): string {
  if (!cues.length) return "";
  const active: string[] = [];
  for (const cue of cues) {
    if (cue.start > currentTime) break;
    if (currentTime >= cue.start && currentTime <= cue.end) {
      active.push(cue.text);
    }
  }
  return active.join("\n");
}
