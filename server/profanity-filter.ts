/**
 * Chat profanity filter — replaces matched words with "***".
 * Word-boundary aware, case-insensitive, handles common letter substitutions.
 */

const WORD_LIST = [
  "ass",
  "asshole",
  "bastard",
  "bitch",
  "bollocks",
  "cock",
  "crap",
  "cunt",
  "damn",
  "dick",
  "douche",
  "fag",
  "faggot",
  "fuck",
  "goddamn",
  "hell",
  "jackass",
  "motherfucker",
  "nigga",
  "nigger",
  "piss",
  "prick",
  "pussy",
  "retard",
  "shit",
  "slut",
  "twat",
  "whore",
  "wanker",
];

/** Map of common letter substitutions → their canonical letter */
const SUBSTITUTIONS: Record<string, string> = {
  "@": "a",
  "4": "a",
  "8": "b",
  "3": "e",
  "1": "i",
  "!": "i",
  "0": "o",
  "5": "s",
  "$": "s",
  "7": "t",
  "+": "t",
};

/**
 * Build a regex pattern for a word that matches common letter substitutions.
 * E.g. "fuck" → "f[uv]c[ck]" style patterns with substitution awareness.
 */
function buildPattern(word: string): string {
  return word
    .split("")
    .map((ch) => {
      // Find all substitution chars that map to this letter
      const alts = Object.entries(SUBSTITUTIONS)
        .filter(([, v]) => v === ch)
        .map(([k]) => escapeRegex(k));
      if (alts.length > 0) {
        return `[${escapeRegex(ch)}${alts.join("")}]`;
      }
      return escapeRegex(ch);
    })
    .join("");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pre-compiled regex matching all profane words with substitution variants */
const FILTER_REGEX = new RegExp(
  "\\b(" + WORD_LIST.map(buildPattern).join("|") + ")\\b",
  "gi",
);

/**
 * Replace profane words in `text` with "***".
 * Returns the filtered string.
 */
export function filterText(text: string): string {
  return text.replace(FILTER_REGEX, "***");
}
