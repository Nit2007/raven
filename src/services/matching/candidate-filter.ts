// src/services/matching/candidate-filter.ts
// Generic action-aware candidate pre-filtering.
// Eliminates incompatible candidates before scoring to ensure O(N) performance and safety.

import { PageElement, UniversalActionType } from '../../types/index.js';
import { MatchTarget } from './matching-types.js';

export interface FilterResult {
  viableCandidates: PageElement[];
  rejectedCandidates: Array<{ element: PageElement; reason: string }>;
}

/**
 * Filters a candidate list based on the requested universal action and basic viability constraints.
 * Never filters purely due to custom tags (e.g. custom web components or ARIA roles are fully supported).
 */
export function filterCandidates(target: MatchTarget, elements: PageElement[]): FilterResult {
  const viableCandidates: PageElement[] = [];
  const rejectedCandidates: Array<{ element: PageElement; reason: string }> = [];

  const action = target.action;

  for (const el of elements) {
    // 1. Basic visibility check
    if (el.visible === false) {
      rejectedCandidates.push({ element: el, reason: 'Element is not visible in the viewport' });
      continue;
    }

    // 2. Action-specific compatibility
    switch (action) {
      case 'type': {
        const isEditable =
          el.editable === true ||
          el.tag === 'input' ||
          el.tag === 'textarea' ||
          el.role === 'textbox' ||
          el.role === 'searchbox' ||
          el.role === 'combobox';

        if (!isEditable) {
          rejectedCandidates.push({
            element: el,
            reason: `Element <${el.tag} role="${el.role}"> is not editable for action "type"`,
          });
          continue;
        }

        if (el.enabled === false) {
          rejectedCandidates.push({ element: el, reason: 'Editable element is disabled' });
          continue;
        }
        break;
      }

      case 'select': {
        const isSelectable =
          el.tag === 'select' ||
          el.role === 'combobox' ||
          el.role === 'listbox' ||
          el.role === 'option' ||
          el.tag === 'option';

        if (!isSelectable && el.tag !== 'input') {
          rejectedCandidates.push({
            element: el,
            reason: `Element <${el.tag} role="${el.role}"> is not selectable for action "select"`,
          });
          continue;
        }
        break;
      }

      case 'check': {
        const isCheckable =
          el.role === 'checkbox' ||
          el.role === 'radio' ||
          el.role === 'switch' ||
          el.type === 'checkbox' ||
          el.type === 'radio';

        if (!isCheckable && el.tag !== 'input' && el.tag !== 'button') {
          rejectedCandidates.push({
            element: el,
            reason: `Element <${el.tag} role="${el.role}"> is not checkable for action "check"`,
          });
          continue;
        }
        break;
      }

      case 'click': {
        // For click, disabled elements are filtered unless no enabled alternatives exist
        if (el.enabled === false) {
          rejectedCandidates.push({ element: el, reason: 'Clickable element is disabled' });
          continue;
        }
        break;
      }

      default:
        break;
    }

    viableCandidates.push(el);
  }

  // Fallback safety: If all candidates were filtered out due to non-strict checks (e.g. dynamic custom widget),
  // retain visible candidates so semantic scoring can evaluate custom ARIA implementations.
  if (viableCandidates.length === 0 && elements.some((e) => e.visible)) {
    return {
      viableCandidates: elements.filter((e) => e.visible !== false),
      rejectedCandidates,
    };
  }

  return { viableCandidates, rejectedCandidates };
}
