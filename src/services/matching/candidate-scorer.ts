// src/services/matching/candidate-scorer.ts
// Multi-signal candidate scoring engine with action-specific weighting and ablation support.
// Centralized configuration, zero magic numbers.

import { PageElement, UniversalActionType } from '../../types/index.js';
import { MatchTarget, MatchCandidate, MatchEvidence, MatchingConfig, AblationMode, FeatureWeights } from './matching-types.js';
import { computeTextSimilarity, exactMatch } from './similarity.js';
import { normalizeText, tokenize } from './text-normalizer.js';

/**
 * Calculates role-to-action semantic compatibility [0.0 - 1.0].
 */
export function computeRoleCompatibility(action: UniversalActionType, el: PageElement): number {
  const role = normalizeText(el.role);
  const tag = normalizeText(el.tag);
  const type = normalizeText(el.type);

  switch (action) {
    case 'click': {
      if (tag === 'button' || role === 'button' || type === 'button' || type === 'submit') return 1.0;
      if (tag === 'a' || role === 'link' || el.href) return 1.0;
      if (role === 'tab' || role === 'menuitem' || role === 'checkbox' || role === 'radio' || role === 'switch') return 0.95;
      if (role === 'option' || tag === 'option' || role === 'combobox') return 0.90;
      if (el.editable || tag === 'input' || tag === 'textarea') return 0.70;
      if (role && role !== 'generic' && role !== 'presentation') return 0.80;
      return 0.35;
    }

    case 'type': {
      if (tag === 'textarea' || role === 'textbox' || role === 'searchbox') return 1.0;
      if (tag === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'password' || type === 'tel' || type === 'url' || type === 'number' || type === 'date' || !type)) return 1.0;
      if (el.editable) return 1.0;
      if (role === 'combobox' || role === 'spinbutton') return 0.90;
      return 0.0;
    }

    case 'select': {
      if (tag === 'select' || role === 'combobox' || role === 'listbox') return 1.0;
      if (tag === 'option' || role === 'option') return 0.95;
      return 0.20;
    }

    case 'check': {
      if (role === 'checkbox' || type === 'checkbox') return 1.0;
      if (role === 'radio' || type === 'radio') return 1.0;
      if (role === 'switch') return 1.0;
      return 0.10;
    }

    case 'scroll': {
      if (role === 'region' || role === 'main' || role === 'dialog' || tag === 'body' || tag === 'div') return 1.0;
      return 0.5;
    }

    default:
      return 0.8;
  }
}

/**
 * Calculates input type compatibility based on target terms (e.g. "email" target vs type="email").
 */
export function computeTypeCompatibility(targetText: string, el: PageElement): number {
  if (!el.type) return 0.5;
  const normTarget = normalizeText(targetText);
  const normType = normalizeText(el.type);

  if (normTarget.includes(normType) || normType.includes(normTarget)) {
    return 1.0;
  }

  if (normTarget.includes('search') && normType === 'search') return 1.0;
  if (normTarget.includes('email') && normType === 'email') return 1.0;
  if (normTarget.includes('pass') && normType === 'password') return 1.0;
  if (normTarget.includes('phone') && (normType === 'tel' || normType === 'phone')) return 1.0;
  if (normTarget.includes('submit') && normType === 'submit') return 1.0;
  if (normTarget.includes('price') || normTarget.includes('quantity') || normTarget.includes('number')) {
    if (normType === 'number' || el.role === 'spinbutton') return 1.0;
  }
  if (normTarget.includes('date') || normTarget.includes('birth')) {
    if (normType === 'date') return 1.0;
  }

  return 0.5;
}

/**
 * Computes contextual similarity between target context/goal and element's parent container text.
 */
export function computeContextSimilarity(target: MatchTarget, el: PageElement): number {
  const contextStr = target.context || target.goal || '';
  const parentStr = el.parent_text || '';
  if (!contextStr) return 0.5;
  if (!parentStr) return 0.2;

  const targetTokens = tokenize(contextStr);
  const parentTokens = tokenize(parentStr);
  if (!targetTokens.length || !parentTokens.length) return 0.5;

  let matches = 0;
  for (const t of targetTokens) {
    let matched = false;
    for (const p of parentTokens) {
      if (t === p || (t.length >= 3 && p.length >= 3 && (t.startsWith(p) || p.startsWith(t)))) {
        matched = true;
        break;
      }
    }
    if (matched) matches++;
  }

  const ratio = matches / targetTokens.length;
  return ratio > 0 ? Math.min(1.0, 0.4 + 0.6 * ratio) : 0.15;
}

/**
 * Combines active weights with action-specific overrides and normalizes their sum to 1.0.
 */
export function resolveWeights(
  config: MatchingConfig,
  action: UniversalActionType,
  ablation: AblationMode = 'FULL'
): FeatureWeights {
  const base = { ...config.weights };
  const overrides = config.actionWeightOverrides[action] || {};

  const merged: FeatureWeights = {
    text: overrides.text ?? base.text,
    role: overrides.role ?? base.role,
    aria: overrides.aria ?? base.aria,
    label: overrides.label ?? base.label,
    placeholder: overrides.placeholder ?? base.placeholder,
    name: overrides.name ?? base.name,
    type: overrides.type ?? base.type,
    context: overrides.context ?? base.context,
    ordinal: overrides.ordinal ?? base.ordinal,
    geometry: overrides.geometry ?? base.geometry,
  };

  if (ablation === 'EXACT_ONLY') {
    return { text: 1.0, role: 0, aria: 0, label: 0, placeholder: 0, name: 0, type: 0, context: 0, ordinal: 0, geometry: 0 };
  } else if (ablation === 'TEXT_ROLE') {
    return { text: 0.7, role: 0.3, aria: 0, label: 0, placeholder: 0, name: 0, type: 0, context: 0, ordinal: 0, geometry: 0 };
  } else if (ablation === 'TEXT_ROLE_ARIA') {
    return { text: 0.5, role: 0.25, aria: 0.25, label: 0, placeholder: 0, name: 0, type: 0, context: 0, ordinal: 0, geometry: 0 };
  } else if (ablation === 'TEXT_ROLE_CONTEXT') {
    return { text: 0.45, role: 0.25, aria: 0, label: 0, placeholder: 0, name: 0, type: 0, context: 0.30, ordinal: 0, geometry: 0 };
  }

  const total = Object.values(merged).reduce((sum, w) => sum + w, 0);
  if (total > 0) {
    for (const key of Object.keys(merged) as (keyof FeatureWeights)[]) {
      merged[key] = merged[key] / total;
    }
  }

  return merged;
}

/**
 * Scores a single PageElement candidate against the requested target.
 */
export function scoreCandidate(
  target: MatchTarget,
  el: PageElement,
  config: MatchingConfig,
  ordinalScores?: Map<string, number>,
  ablation: AblationMode = 'FULL'
): MatchCandidate {
  const targetText = target.text || target.targetHint || '';
  const weights = resolveWeights(config, target.action, ablation);

  // 1. Text similarity
  const isExactText = exactMatch(targetText, el.text) === 1.0;
  const textScore = ablation === 'EXACT_ONLY'
    ? (isExactText ? 1.0 : 0.0)
    : computeTextSimilarity(targetText, el.text);

  // 2. Role compatibility
  const roleScore = computeRoleCompatibility(target.action, el);

  // 3. ARIA accessible name similarity
  const isExactAria = el.aria_label ? exactMatch(targetText, el.aria_label) === 1.0 : false;
  const ariaScore = el.aria_label ? computeTextSimilarity(targetText, el.aria_label) : 0;

  // 4. Form placeholder / name / label
  const isExactPlaceholder = el.placeholder ? exactMatch(targetText, el.placeholder) === 1.0 : false;
  const placeholderScore = el.placeholder ? computeTextSimilarity(targetText, el.placeholder) : 0;
  const nameScore = el.name ? computeTextSimilarity(targetText, el.name) : 0;
  const labelScore = Math.max(placeholderScore, ariaScore, nameScore);

  // 5. Input type compatibility
  const typeScore = computeTypeCompatibility(targetText, el);

  // 6. Context similarity
  const contextScore = computeContextSimilarity(target, el);

  // 7. Ordinal score
  const ordinalScore = ordinalScores?.get(el.id) ?? (target.ordinal !== undefined ? 0.2 : 0.5);

  // 8. Visibility & Enabled status
  const visibilityScore = el.visible !== false ? 1.0 : 0.0;
  const enabledScore = el.enabled !== false ? 1.0 : 0.1;

  // 9. Geometry
  const bbox = el.bbox || [0, 0, 0, 0];
  const geometryScore = Math.max(0, 1.0 - Math.min(1.0, bbox[1] / 2000));

  // Multi-attribute semantic match
  const semanticAttributes = [
    textScore,
    ariaScore,
    placeholderScore,
    nameScore,
    typeScore === 1.0 ? 0.85 : 0,
    target.context && contextScore >= 0.70 ? contextScore * 0.85 : 0,
  ];
  const bestSemanticSignal = Math.max(...semanticAttributes);
  const isExactAny = isExactText || isExactAria || isExactPlaceholder;

  let weightedScore = 0;

  if (ablation === 'EXACT_ONLY') {
    weightedScore = textScore;
  } else {
    weightedScore =
      weights.text * textScore +
      weights.role * roleScore +
      weights.aria * ariaScore +
      weights.label * labelScore +
      weights.placeholder * placeholderScore +
      weights.name * nameScore +
      weights.type * typeScore +
      weights.context * contextScore +
      weights.geometry * geometryScore;

    // Exact match direct high confidence assignment
    if (isExactAny) {
      weightedScore = Math.max(weightedScore, 0.75 + 0.25 * roleScore);
    } else if (bestSemanticSignal >= 0.50) {
      weightedScore = Math.max(weightedScore, 0.70 * bestSemanticSignal + 0.30 * roleScore);
    }

    // Context tie-breaking: when target.context is supplied, apply differential penalty for lower context alignment
    if (target.context) {
      const contextDelta = (contextScore - 1.0) * 0.40;
      weightedScore = Math.min(1.0, Math.max(0.1, weightedScore + contextDelta));
    }

    // Ordinal modifier
    if (target.ordinal !== undefined) {
      if (ordinalScore === 1.0) {
        weightedScore = Math.min(1.0, weightedScore + 0.25);
      } else {
        weightedScore = Math.max(0.1, weightedScore - 0.25);
      }
    }

    // For type action on editable elements when target describes typing action/content
    if (target.action === 'type' && el.editable) {
      if (bestSemanticSignal >= 0.5) {
        weightedScore = Math.max(weightedScore, 0.70 * bestSemanticSignal + 0.30 * roleScore);
      } else if (bestSemanticSignal === 0) {
        const targetTokens = tokenize(targetText);
        const isGenericTypePrompt = targetTokens.some((t) =>
          ['message', 'body', 'text', 'prompt', 'content', 'comment', 'note', 'search', 'query', 'question'].includes(t)
        );
        if (isGenericTypePrompt) {
          weightedScore = Math.max(weightedScore, 0.80 * roleScore);
        }
      }
    }
  }

  // Penalize disabled or invisible candidates
  weightedScore *= visibilityScore * enabledScore;

  // Build explanation evidence details
  const details: string[] = [];
  if (textScore > 0.6) details.push(`Text: ${Math.round(textScore * 100)}% match`);
  if (ariaScore > 0.6) details.push(`ARIA: ${Math.round(ariaScore * 100)}% match`);
  if (placeholderScore > 0.6) details.push(`Placeholder: ${Math.round(placeholderScore * 100)}% match`);
  if (nameScore > 0.6) details.push(`Name: ${Math.round(nameScore * 100)}% match`);
  if (typeScore === 1.0) details.push(`Type (${el.type}): compatible`);
  if (roleScore > 0.8) details.push(`Role (${el.tag}/${el.role}): compatible`);
  if (contextScore >= 0.60) details.push(`Context: aligned (${Math.round(contextScore * 100)}%)`);
  if (target.ordinal !== undefined) details.push(`Ordinal (#${target.ordinal}): ${Math.round(ordinalScore * 100)}%`);

  const rejectedReasons: string[] = [];
  if (visibilityScore === 0) rejectedReasons.push('Element is invisible');
  if (enabledScore < 1) rejectedReasons.push('Element is disabled');
  if (weightedScore < config.confidence.ambiguous) rejectedReasons.push('Low semantic match confidence');

  const evidence: MatchEvidence = {
    textScore,
    roleScore,
    ariaScore,
    labelScore,
    placeholderScore,
    nameScore,
    typeScore,
    contextScore,
    ordinalScore,
    visibilityScore,
    enabledScore,
    geometryScore,
    weightedScore,
    details,
  };

  return {
    elementId: el.id,
    element: el,
    score: Number(weightedScore.toFixed(4)),
    confidence: Number(weightedScore.toFixed(4)),
    evidence,
    rejectedReasons,
  };
}
