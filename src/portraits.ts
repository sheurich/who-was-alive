import type { Portrait } from "./types.ts";

export function portraitSource(
  portrait: Portrait | undefined,
  base: string,
  failed: ReadonlySet<string> = new Set(),
): string | null {
  const path = portrait?.path?.replace(/^\//, "");
  const local =
    path && /^portraits\/[\w.-]+$/.test(path) ? `${base}${path}` : null;
  if (local && !failed.has(local)) return local;
  try {
    const url = new URL(portrait?.thumbnailUrl ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)
    )
      return null;
    return failed.has(url.href) ? null : url.href;
  } catch {
    return null;
  }
}
