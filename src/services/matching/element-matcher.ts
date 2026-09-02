// src/services/matching/element-matcher.ts
// PilotRaven Universal Element Matching Engine
// Complete deterministic matching cascade with stale-element recovery, ambiguity protection,
// and zero website-specific heuristics.

import { PageElement } from '../../types/index.js';
import {
  MatchTarget,
  MatchResult,
  MatchCandidate,
  ElementFingerprint,
  MatchingConfig,
  AblationMode,
} from './matching-types.js';
import { DEFAULT_MATCHING_CONFIG } from './matching-config.js';
import { normalizeText, extractOrdinals } from './text-normalizer.js';
import { filterCandidates } from './candidate-filter.js';
import { calculateOrdinalScores } from './semantic-groups.js';
import { scoreCandidate } from './candidate-scorer.js';
import { computeTextSimilarity } from './similarity.js';

export class ElementMatcher {
  private config: MatchingConfig;

  constructor(config: Partial<MatchingConfig> = {}) {
    this.config = {
      ...DEFAULT_MATCHING_CONFIG,
      ...config,
      weights: { ...DEFAULT_MATCHING_CONFIG.weights, ...(config.weights || {}) },
      confidence: { ...DEFAULT_MATCHING_CONFIG.confidence, ...(config.confidence || {}) },
      limits: { ...DEFAULT_MATCHING_CONFIG.limits, ...(config.limits || {}) },
    };
  }

  /**
   * Generates a deterministic structural/semantic fingerprint for a PageElement.
   */
  public createFingerprint(el: PageElement): ElementFingerprint {
    const normText = normalizeText(el.text);
    const normAria = normalizeText(el.aria_label);
    const normPlaceholder = normalizeText(el.placeholder);
    const normName = normalizeText(el.name);
    const normType = normalizeText(el.type);
    const normParent = normalizeText(el.parent_text);

    const signature = [el.tag, el.role, normText, normAria, normPlaceholder, normName, normType]
      .filter(Boolean)
      .join('|');

    return {
      tag: el.tag,
      role: el.role,
      normalizedText: normText,
      normalizedAria: normAria,
      normalizedPlaceholder: normPlaceholder,
      normalizedName: normName,
      type: normType,
      normalizedParentText: normParent,
      signature,
    };
  }

  /**
   * Evaluates compatibility between two element fingerprints to confirm identity across DOM mutations.
   */
  public isFingerprintCompatible(
    fp1: ElementFingerprint | undefined,
    fp2: ElementFingerprint | undefined
  ): boolean {
    if (!fp1 || !fp2) return false;

    // Strict tag / role equality if present
    if (fp1.tag && fp2.tag && fp1.tag !== fp2.tag) return false;

    // Check textual fingerprint signals
    const textSim = fp1.normalizedText && fp2.normalizedText
      ? computeTextSimilarity(fp1.normalizedText, fp2.normalizedText)
      : 0;

    const ariaSim = fp1.normalizedAria && fp2.normalizedAria
      ? computeTextSimilarity(fp1.normalizedAria, fp2.normalizedAria)
      : 0;

    const placeholderSim = fp1.normalizedPlaceholder && fp2.normalizedPlaceholder
      ? computeTextSimilarity(fp1.normalizedPlaceholder, fp2.normalizedPlaceholder)
      : 0;

    const nameSim = fp1.normalizedName && fp2.normalizedName && fp1.normalizedName === fp2.normalizedName ? 1.0 : 0;

    const bestSim = Math.max(textSim, ariaSim, placeholderSim, nameSim);
    return bestSim >= this.config.confidence.fingerprintCompatibility;
  }

  /**
   * Resolves a target to the best matching PageElement.
   * If a target element ID is specified and valid, it verifies its identity.
   * If stale, missing, or omitted, it executes full semantic cascade matching.
   */
  public resolveElement(
    target: MatchTarget,
    elements: PageElement[],
    prevFingerprint?: ElementFingerprint
  ): MatchResult {
    const startTime = performance.now();

    // 1. Direct ID validation check if elementId is provided
    if (target.elementId) {
      const existing = elements.find((e) => e.id === target.elementId);
      if (existing) {
        if (existing.visible === false) {
          // Element exists but has become invisible
          return this.createFailureResult(
            'ELEMENT_NOT_VISIBLE',
            `Target element ${target.elementId} is not visible in current viewport`,
            startTime
          );
        }

        if (target.action === 'click' && existing.enabled === false) {
          // Element exists but has become disabled
          return this.createFailureResult(
            'ELEMENT_DISABLED',
            `Target element ${target.elementId} is currently disabled`,
            startTime
          );
        }

        const currentFp = this.createFingerprint(existing);
        const expectedFp = target.expectedFingerprint || prevFingerprint;

        // If no prior fingerprint to compare or fingerprint is compatible, accept direct match
        if (!expectedFp || this.isFingerprintCompatible(expectedFp, currentFp)) {
          const directScore = this.config.confidence.directIdAccept;
          const candidate: MatchCandidate = {
            elementId: existing.id,
            element: existing,
            score: directScore,
            confidence: directScore,
            evidence: {
              textScore: 1.0,
              roleScore: 1.0,
              ariaScore: 1.0,
              labelScore: 1.0,
              placeholderScore: 1.0,
              nameScore: 1.0,
              typeScore: 1.0,
              contextScore: 1.0,
              ordinalScore: 1.0,
              visibilityScore: 1.0,
              enabledScore: 1.0,
              geometryScore: 1.0,
              weightedScore: directScore,
              details: ['Direct ID verified intact and active'],
            },
            rejectedReasons: [],
          };

          return {
            matched: true,
            status: 'MATCHED',
            elementId: existing.id,
            element: existing,
            confidence: directScore,
            margin: 1.0,
            candidates: [candidate],
            reason: `Direct element ID "${target.elementId}" validated successfully`,
            executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
          };
        }
      }
      // If direct element is missing or mutated, proceed to semantic recovery
    }

    // 2. Perform semantic matching across all candidate elements
    return this.match(target, elements, undefined, undefined, startTime);
  }

  /**
   * Main matching cascade.
   */
  public match(
    target: MatchTarget,
    elements: PageElement[],
    configOverride?: Partial<MatchingConfig>,
    ablation: AblationMode = 'FULL',
    startTime: number = performance.now()
  ): MatchResult {
    const activeConfig = configOverride
      ? { ...this.config, ...configOverride }
      : this.config;

    if (!elements || elements.length === 0) {
      return this.createFailureResult('NO_MATCH', 'No DOM elements available for matching', startTime);
    }

    // 1. Target normalization and ordinal extraction
    const rawTarget = target.text || target.targetHint || '';
    const { ordinal: extractedOrdinal, cleanText } = extractOrdinals(rawTarget);
    const activeOrdinal = target.ordinal !== undefined ? target.ordinal : extractedOrdinal;

    const normalizedTarget: MatchTarget = {
      ...target,
      text: cleanText || rawTarget,
      ordinal: activeOrdinal,
    };

    // 2. Action-aware candidate pre-filtering
    const { viableCandidates } = filterCandidates(normalizedTarget, elements);
    if (viableCandidates.length === 0) {
      return this.createFailureResult('ACTION_INCOMPATIBLE', 'No compatible interactive elements found for action', startTime);
    }

    // 3. Calculate ordinal scores across viable candidates if ordinal requested
    const ordinalScores = activeOrdinal !== undefined
      ? calculateOrdinalScores(activeOrdinal, viableCandidates)
      : undefined;

    // 4. Score all candidates
    const scoredCandidates: MatchCandidate[] = [];
    const maxToScore = Math.min(viableCandidates.length, activeConfig.limits.maxCandidatesToScore);

    for (let i = 0; i < maxToScore; i++) {
      const el = viableCandidates[i];
      const candidate = scoreCandidate(normalizedTarget, el, activeConfig, ordinalScores, ablation);
      scoredCandidates.push(candidate);
    }

    // 5. Rank candidates by descending composite score
    scoredCandidates.sort((a, b) => b.score - a.score);

    if (scoredCandidates.length === 0) {
      return this.createFailureResult('NO_MATCH', 'No candidates scored above threshold', startTime);
    }

    const rank1 = scoredCandidates[0];
    const rank2 = scoredCandidates.length > 1 ? scoredCandidates[1] : undefined;
    const margin = rank2 ? Number((rank1.score - rank2.score).toFixed(4)) : rank1.score;

    // 6. Confidence and Ambiguity Evaluation
    const { accept, ambiguous, minimumMargin } = activeConfig.confidence;

    // Case A: Top score is too low to be any valid match
    if (rank1.score < ambiguous) {
      return {
        matched: false,
        status: 'NO_MATCH',
        confidence: rank1.score,
        margin,
        candidates: scoredCandidates.slice(0, activeConfig.limits.maxReturnedCandidates),
        reason: `Highest candidate score (${rank1.score}) was below ambiguous threshold (${ambiguous})`,
        executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      };
    }

    // Case B: Check for ambiguity between rank1 and rank2
    const isAmbiguous =
      rank2 !== undefined &&
      rank2.score >= ambiguous &&
      margin < minimumMargin;

    if (isAmbiguous) {
      rank1.isAmbiguous = true;
      if (rank2) rank2.isAmbiguous = true;

      return {
        matched: false,
        status: 'AMBIGUOUS',
        confidence: rank1.score,
        margin,
        candidates: scoredCandidates.slice(0, activeConfig.limits.maxReturnedCandidates),
        reason: `Ambiguous match between "${rank1.element.text || rank1.element.id}" (${rank1.score}) and "${rank2?.element.text || rank2?.element.id}" (${rank2?.score}) with insufficient margin (${margin} < ${minimumMargin})`,
        executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      };
    }

    // Case C: High-confidence unambiguous match
    if (rank1.score >= accept || (rank1.score >= ambiguous && margin >= minimumMargin)) {
      return {
        matched: true,
        status: 'MATCHED',
        elementId: rank1.elementId,
        element: rank1.element,
        confidence: rank1.score,
        margin,
        candidates: scoredCandidates.slice(0, activeConfig.limits.maxReturnedCandidates),
        reason: `Matched "${rank1.element.text || rank1.element.aria_label || rank1.element.id}" with high confidence (${rank1.score})`,
        executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      };
    }

    // Fallback: below strict accept threshold without clear margin
    return {
      matched: false,
      status: 'NO_MATCH',
      confidence: rank1.score,
      margin,
      candidates: scoredCandidates.slice(0, activeConfig.limits.maxReturnedCandidates),
      reason: `Candidate score ${rank1.score} insufficient for confident execution`,
      executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
    };
  }

  /**
   * Formats a detailed, PII-safe diagnostic string for logging and sidepanel inspection.
   */
  public formatDiagnostics(result: MatchResult): string {
    const lines: string[] = [
      '========================================',
      '## Element Matching Diagnostics',
      `Status:     ${result.status}`,
      `Matched:    ${result.matched}`,
      `Confidence: ${Math.round(result.confidence * 100)}%`,
      `Margin:     ${result.margin !== undefined ? Math.round(result.margin * 100) + '%' : 'N/A'}`,
      `Latency:    ${result.executionTimeMs} ms`,
      `Reason:     ${result.reason}`,
    ];

    if (result.element) {
      lines.push(
        `Selected:   ${result.element.id} (<${result.element.tag} role="${result.element.role}">)`
      );
    }

    if (result.candidates && result.candidates.length > 0) {
      lines.push('\nTop Candidates:');
      result.candidates.slice(0, 5).forEach((c, idx) => {
        const textSample = (c.element.text || c.element.aria_label || c.element.placeholder || '<no text>').slice(0, 40);
        lines.push(`  ${idx + 1}. [${c.elementId}] "${textSample}" -> Score: ${c.score}`);
        if (c.evidence.details.length > 0) {
          lines.push(`     Evidence: ${c.evidence.details.join(', ')}`);
        }
      });
    }

    lines.push('========================================');
    return lines.join('\n');
  }

  private createFailureResult(
    status: MatchResult['status'],
    reason: string,
    startTime: number
  ): MatchResult {
    return {
      matched: false,
      status,
      confidence: 0,
      candidates: [],
      reason,
      executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
    };
  }
}
