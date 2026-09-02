// src/services/matching/semantic-groups.ts
// Generic structural grouping and ordinal resolution using visual geometry.
// Zero website-specific selectors or heuristics.

import { PageElement } from '../../types/index.js';
import { normalizeText } from './text-normalizer.js';

export interface ElementGroup {
  groupId: string;
  elements: PageElement[];
  dominantTag: string;
  dominantRole: string;
}

/**
 * Sorts elements according to natural visual reading order:
 * Primary: Top-to-bottom (Y coordinate)
 * Secondary: Left-to-right (X coordinate for elements in the same horizontal band)
 */
export function sortElementsByVisualOrder(elements: PageElement[]): PageElement[] {
  return [...elements].sort((a, b) => {
    const boxA = a.bbox || [0, 0, 0, 0];
    const boxB = b.bbox || [0, 0, 0, 0];

    const yA = boxA[1];
    const yB = boxB[1];
    const xA = boxA[0];
    const xB = boxB[0];

    // If vertical difference is small (<= 20px), treat them as being on the same horizontal row
    const rowTolerance = 20;
    if (Math.abs(yA - yB) <= rowTolerance) {
      return xA - xB;
    }
    return yA - yB;
  });
}

/**
 * Groups structurally or semantically similar elements (e.g. repeated item cards, list rows, button bars).
 */
export function groupSimilarElements(elements: PageElement[]): ElementGroup[] {
  const groups: Map<string, PageElement[]> = new Map();

  for (const el of elements) {
    // Structural signature based on tag, role, and parent context
    const parentKey = normalizeText(el.parent_text || '').slice(0, 30);
    const key = `${el.tag}:${el.role}:${parentKey || 'root'}`;

    const list = groups.get(key) || [];
    list.push(el);
    groups.set(key, list);
  }

  const result: ElementGroup[] = [];
  for (const [key, list] of groups.entries()) {
    const first = list[0];
    result.push({
      groupId: key,
      elements: sortElementsByVisualOrder(list),
      dominantTag: first.tag,
      dominantRole: first.role,
    });
  }

  return result;
}

/**
 * Resolves an ordinal target (e.g. "2nd product", "3rd button") within a set of matching candidates.
 *
 * @param requestedOrdinal - 1-based index (e.g. 1, 2, 3) or -1 for last
 * @param candidates - Candidate elements matching the semantic target
 * @returns Map of elementId -> ordinal score [0.0 - 1.0]
 */
export function calculateOrdinalScores(
  requestedOrdinal: number | undefined,
  candidates: PageElement[]
): Map<string, number> {
  const scores = new Map<string, number>();
  if (!requestedOrdinal || candidates.length === 0) {
    return scores;
  }

  // Sort candidates visually
  const visuallyOrdered = sortElementsByVisualOrder(candidates);
  const total = visuallyOrdered.length;

  let targetIndex: number;
  if (requestedOrdinal === -1) {
    // "last" element
    targetIndex = total - 1;
  } else {
    // 1-based index -> 0-based
    targetIndex = requestedOrdinal - 1;
  }

  for (let i = 0; i < total; i++) {
    const el = visuallyOrdered[i];
    if (i === targetIndex) {
      scores.set(el.id, 1.0); // Exact ordinal position match
    } else {
      // Distance penalty from requested ordinal
      const dist = Math.abs(i - targetIndex);
      const penaltyScore = Math.max(0, 1.0 - dist * 0.35);
      scores.set(el.id, penaltyScore);
    }
  }

  return scores;
}
