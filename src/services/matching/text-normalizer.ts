// src/services/matching/text-normalizer.ts
// Fast, deterministic, memory-efficient string normalizer and tokenizer with LRU caching.
// Zero external dependencies.

const MAX_CACHE_ENTRIES = 500;
const normalizationCache = new Map<string, string>();
const tokenCache = new Map<string, string[]>();

const LEADING_COMMAND_VERBS = new Set([
  'click', 'press', 'tap', 'choose'
]);

const LEADING_ARTICLES = new Set(['the', 'a', 'an']);

/**
 * Normalizes text for robust semantic comparison without destroying meaningful tokens.
 * - Converts to lowercase and normalizes Unicode (NFC)
 * - Replaces delimiters (hyphens, underscores, slashes, pipes) with spaces
 * - Strips noise punctuation while preserving alphanumeric characters and spaces
 * - Collapses multiple spaces into single spaces and trims
 */
export function normalizeText(raw: string | null | undefined): string {
  if (!raw) return '';
  const input = String(raw);

  const cached = normalizationCache.get(input);
  if (cached !== undefined) return cached;

  let normalized = input
    .normalize('NFC')
    .toLowerCase()
    // Replace separators, punctuation, and bullets with single space
    .replace(/[-_\\/|•·:;~+()[\]{}<>"'`=,!?#%*^&$@]+/g, ' ')
    // Collapse any whitespace / newlines / tabs
    .replace(/\s+/g, ' ')
    .trim();

  // Keep cache bounded
  if (normalizationCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = normalizationCache.keys().next().value;
    if (firstKey !== undefined) normalizationCache.delete(firstKey);
  }
  normalizationCache.set(input, normalized);

  return normalized;
}

/**
 * Splits normalized text into a list of meaningful alphanumeric tokens.
 */
export function tokenize(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const normalized = normalizeText(raw);
  if (!normalized) return [];

  const cached = tokenCache.get(normalized);
  if (cached !== undefined) return cached;

  const tokens = normalized
    .split(' ')
    .filter((t) => t.length > 0);

  if (tokenCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey !== undefined) tokenCache.delete(firstKey);
  }
  tokenCache.set(normalized, tokens);

  return tokens;
}

/**
 * Ordinal word-to-number mapping (1-indexed, negative for reverse like -1 for last).
 */
const ORDINAL_MAP: Record<string, number> = {
  first: 1,
  '1st': 1,
  second: 2,
  '2nd': 2,
  third: 3,
  '3rd': 3,
  fourth: 4,
  '4th': 4,
  fifth: 5,
  '5th': 5,
  sixth: 6,
  '6th': 6,
  seventh: 7,
  '7th': 7,
  eighth: 8,
  '8th': 8,
  ninth: 9,
  '9th': 9,
  tenth: 10,
  '10th': 10,
  last: -1,
  final: -1,
};

/**
 * Extracts ordinal references from a natural language target/task and cleans the target text
 * by removing leading command verbs ("click", "tap") and leading articles ("the", "a") to isolate
 * the core semantic subject.
 * Example: "click the second product" -> { ordinal: 2, cleanText: "product" }
 */
export function extractOrdinals(targetText: string): { ordinal?: number; cleanText: string } {
  if (!targetText) return { cleanText: '' };

  const tokens = tokenize(targetText);
  let foundOrdinal: number | undefined = undefined;
  const meaningfulTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (foundOrdinal === undefined && token in ORDINAL_MAP) {
      foundOrdinal = ORDINAL_MAP[token];
    } else if (i === 0 && LEADING_COMMAND_VERBS.has(token) && tokens.length > 1) {
      // Skip leading command verb when followed by target subject (e.g. "click login" -> "login")
      continue;
    } else if (i <= 1 && LEADING_ARTICLES.has(token) && (i === 0 || foundOrdinal !== undefined)) {
      // Skip leading articles
      continue;
    } else {
      meaningfulTokens.push(token);
    }
  }

  const cleanText = meaningfulTokens.length > 0 ? meaningfulTokens.join(' ') : normalizeText(targetText);

  return {
    ordinal: foundOrdinal,
    cleanText,
  };
}

/**
 * Clears the normalization caches.
 */
export function clearNormalizationCache(): void {
  normalizationCache.clear();
  tokenCache.clear();
}
