const MAX_SLUG_LENGTH = 40;
const NON_ALNUM = /[^a-z0-9]+/g;
const WHITESPACE = /\s+/;

const CYRILLIC_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function transliterate(text: string): string {
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower in CYRILLIC_MAP ? CYRILLIC_MAP[lower] : ch;
  }
  return out;
}

/**
 * Build a slug from the first words of a comment: transliterated Latin,
 * lowercase, hyphen-separated, at most 40 characters, cut at a word boundary
 * when possible.
 */
export function slugFromComment(comment: string): string {
  const words = transliterate(comment)
    .toLowerCase()
    .replace(NON_ALNUM, " ")
    .trim()
    .split(WHITESPACE)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return "issue";
  }

  let slug = "";
  for (const word of words) {
    const candidate = slug === "" ? word : `${slug}-${word}`;
    if (candidate.length > MAX_SLUG_LENGTH) {
      break;
    }
    slug = candidate;
  }
  // A single word longer than the limit: hard truncate.
  if (slug === "") {
    slug = words[0].slice(0, MAX_SLUG_LENGTH);
  }
  return slug;
}
