/** Environment metadata collection: browser, OS, viewport, url. */

export interface BrowserInfo {
  browser: string;
  os: string;
}

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/Firefox\/(\d+)/, "Firefox"],
  [/Chrome\/(\d+)/, "Chrome"],
];
const SAFARI_VERSION = /Version\/(\d+)/;
const OS_PATTERNS: [RegExp, string][] = [
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iOS/, "iOS"],
  [/Linux/, "Linux"],
];
const MILLISECONDS_SUFFIX = /\.\d{3}Z$/;

export function parseUserAgent(ua: string): BrowserInfo {
  let browser = "Unknown";
  for (const [pattern, name] of BROWSER_PATTERNS) {
    const match = ua.match(pattern);
    if (match) {
      browser = `${name} ${match[1]}`;
      break;
    }
  }
  if (browser === "Unknown" && ua.includes("Safari/")) {
    const match = ua.match(SAFARI_VERSION);
    if (match) {
      browser = `Safari ${match[1]}`;
    }
  }

  let os = "Unknown";
  for (const [pattern, name] of OS_PATTERNS) {
    if (pattern.test(ua)) {
      os = name;
      break;
    }
  }

  return { browser, os };
}

/** ISO timestamp with seconds precision, e.g. "2026-07-20T14:03:22Z". */
export function isoTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(MILLISECONDS_SUFFIX, "Z");
}

export interface PageEnvironment {
  baseUrl: string;
  browser: string;
  /** "light" | "dark" from the prefers-color-scheme media query. */
  colorScheme: string;
  devicePixelRatio: number;
  /** Primary UI language, e.g. "en-US". */
  language: string;
  /** Ordered language preferences, e.g. ["en-US", "ru"]. */
  languages: string[];
  os: string;
  /** Whether the reader prefers reduced motion. */
  reducedMotion: boolean;
  /** Physical screen resolution in CSS px, e.g. "2560x1440". */
  screen: string;
  /** IANA timezone, e.g. "Europe/Berlin". */
  timezone: string;
  /** Path relative to base url, e.g. "/dashboard/animals". */
  url: string;
  viewport: string;
}

function safeTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function prefersColorScheme(): string {
  if (typeof matchMedia !== "function") {
    return "";
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function collectPageEnvironment(): PageEnvironment {
  const { browser, os } = parseUserAgent(navigator.userAgent);
  const languages = navigator.languages ? [...navigator.languages] : [];
  return {
    baseUrl: window.location.origin,
    url: window.location.pathname + window.location.search,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    devicePixelRatio: window.devicePixelRatio || 1,
    browser,
    os,
    language: navigator.language || "",
    languages: languages.length > 0 ? languages : [navigator.language || ""],
    timezone: safeTimezone(),
    colorScheme: prefersColorScheme(),
    reducedMotion:
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}
