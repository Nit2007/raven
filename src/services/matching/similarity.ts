// src/services/matching/similarity.ts
// Local, lightweight semantic & string similarity algorithms.
// Deterministic, O(N) evaluation, zero external ML or embedding dependencies.

import { normalizeText, tokenize } from './text-normalizer.js';

const NEGATION_PREFIXES = ['un', 'non', 'dis', 'in', 'im', 'de'];

/**
 * Exact normalized string equality, including collapsed spaceless equality (e.g. "check out" vs "checkout").
 */
export function exactMatch(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  // Spaceless equality (e.g. "log in" === "login", "check out" === "checkout")
  if (normA.replace(/\s+/g, '') === normB.replace(/\s+/g, '')) {
    return 1.0;
  }
  return 0.0;
}

/**
 * Prefix match similarity. Rewards candidates that start directly with the target phrase.
 * Scaled so exact matches maintain a decisive margin (> 0.15) over prefix extensions.
 */
export function prefixMatch(target: string, candidate: string): number {
  const normTarget = normalizeText(target);
  const normCandidate = normalizeText(candidate);
  if (!normTarget || !normCandidate) return 0;
  if (exactMatch(normTarget, normCandidate) === 1.0) return 1.0;

  if (normCandidate.startsWith(normTarget)) {
    const ratio = normTarget.length / normCandidate.length;
    // Prefix score between 0.58 and 0.78
    return 0.58 + 0.20 * ratio;
  }
  if (normTarget.startsWith(normCandidate)) {
    const ratio = normCandidate.length / normTarget.length;
    return 0.52 * ratio;
  }
  return 0;
}

/**
 * Length-normalized substring containment.
 */
export function substringMatch(target: string, candidate: string): number {
  const normTarget = normalizeText(target);
  const normCandidate = normalizeText(candidate);
  if (!normTarget || !normCandidate) return 0;
  if (exactMatch(normTarget, normCandidate) === 1.0) return 1.0;

  // Antonym check (e.g. "subscribe" vs "unsubscribe", "check" vs "uncheck")
  for (const prefix of NEGATION_PREFIXES) {
    if (normCandidate === prefix + normTarget || normTarget === prefix + normCandidate) {
      return 0.10; // Antonyms receive near-zero similarity
    }
  }

  if (normCandidate.includes(normTarget)) {
    const ratio = normTarget.length / normCandidate.length;
    return 0.52 + 0.23 * ratio;
  }
  if (normTarget.includes(normCandidate)) {
    const ratio = normCandidate.length / normTarget.length;
    return 0.48 * ratio;
  }
  return 0;
}

/**
 * Jaccard similarity over token sets: |A ∩ B| / |A ∪ B|
 */
export function tokenJaccard(tokensA: string[], tokensB: string[]): number {
  if (!tokensA.length || !tokensB.length) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }

  const unionSize = setA.size + setB.size - intersectionCount;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

/**
 * Token containment: Fraction of target tokens present in candidate tokens.
 */
export function tokenContainment(targetTokens: string[], candidateTokens: string[]): number {
  if (!targetTokens.length || !candidateTokens.length) return 0;

  const candidateSet = new Set(candidateTokens);
  let matchedCount = 0;

  for (const t of targetTokens) {
    if (candidateSet.has(t)) {
      matchedCount++;
    } else {
      // Check for singular/plural or prefix matching on individual tokens
      for (const c of candidateTokens) {
        // Skip antonym prefixes (e.g. "subscribe" vs "unsubscribe")
        let isAntonym = false;
        for (const p of NEGATION_PREFIXES) {
          if (c === p + t || t === p + c) {
            isAntonym = true;
            break;
          }
        }
        if (isAntonym) continue;

        if (
          (c.length >= 3 && t.length >= 3 && (c.startsWith(t) || t.startsWith(c))) ||
          (Math.abs(c.length - t.length) === 1 && (c === t + 's' || t === c + 's'))
        ) {
          matchedCount += 0.85;
          break;
        }
      }
    }
  }

  return Math.min(1.0, matchedCount / targetTokens.length);
}

/**
 * Fast two-row Levenshtein distance implementation.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const la = a.length;
  const lb = b.length;

  if (la > lb) {
    return levenshteinDistance(b, a);
  }

  let prevRow = new Array(la + 1);
  let currRow = new Array(la + 1);

  for (let i = 0; i <= la; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= lb; j++) {
    currRow[0] = j;
    const charB = b.charCodeAt(j - 1);

    for (let i = 1; i <= la; i++) {
      const cost = a.charCodeAt(i - 1) === charB ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,
        prevRow[i] + 1,
        prevRow[i - 1] + cost
      );
    }

    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[la];
}

/**
 * Normalized edit distance similarity: 1.0 - (dist / maxLen).
 * Handles typos such as "Logn" -> "Login", "Pswrd" -> "Password".
 */
export function normalizedEditSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0;
  if (exactMatch(normA, normB) === 1.0) return 1.0;

  // Antonym check (e.g. "subscribe" vs "unsubscribe")
  for (const prefix of NEGATION_PREFIXES) {
    if (normA === prefix + normB || normB === prefix + normA) {
      return 0; // Antonyms are not typos
    }
  }

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;

  if (Math.abs(normA.length - normB.length) > 4) {
    return 0;
  }

  const dist = levenshteinDistance(normA, normB);
  const sim = 1.0 - dist / maxLen;

  return sim >= 0.50 ? 0.65 + 0.35 * sim : 0;
}

/**
 * Composite multi-signal text similarity score.
 */
export function computeTextSimilarity(target: string, candidate: string): number {
  const normTarget = normalizeText(target);
  const normCandidate = normalizeText(candidate);

  if (!normTarget || !normCandidate) return 0;

  // 1. Exact match (including spaceless equality like "check out" === "checkout")
  if (exactMatch(normTarget, normCandidate) === 1.0) {
    return 1.0;
  }

  const targetTokens = tokenize(normTarget);
  const candidateTokens = tokenize(normCandidate);

  // 2. Prefix & substring match
  const prefixScore = prefixMatch(normTarget, normCandidate);
  const subScore = substringMatch(normTarget, normCandidate);

  // 3. Token containment & Jaccard (scaled by length ratio to prevent extra distractor words from getting near 1.0)
  const containment = tokenContainment(targetTokens, candidateTokens);
  const jaccard = tokenJaccard(targetTokens, candidateTokens);
  const lengthRatio = Math.min(targetTokens.length, candidateTokens.length) / Math.max(targetTokens.length, candidateTokens.length);

  let tokenScore = 0;
  if (containment >= 0.5) {
    tokenScore = 0.50 * containment + 0.25 * jaccard + 0.25 * lengthRatio;
  } else {
    tokenScore = 0.45 * containment + 0.45 * jaccard;
  }

  // 4. Typo tolerance
  let typoScore = 0;
  if (targetTokens.length <= 2 && Math.abs(normTarget.length - normCandidate.length) <= 4) {
    typoScore = normalizedEditSimilarity(normTarget, normCandidate);
  }

  return Math.min(1.0, Math.max(prefixScore, subScore, tokenScore, typoScore));
}
