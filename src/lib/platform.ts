const platform =
  typeof navigator === "undefined"
    ? ""
    : `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;

export const isMac = /mac/i.test(platform);

interface ShortcutOptions {
  shift?: boolean;
  alt?: boolean;
}

export function formatShortcut(key: string, options: ShortcutOptions = {}): string {
  const parts: string[] = [isMac ? "⌘" : "Ctrl"];

  if (options.alt) parts.push(isMac ? "⌥" : "Alt");
  if (options.shift) parts.push(isMac ? "⇧" : "Shift");
  parts.push(key);

  return parts.join(isMac ? " " : "+");
}
