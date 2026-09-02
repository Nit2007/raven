// src/services/matching/matching-types.ts
// Strongly-typed interfaces for PilotRaven Universal Element Matching Engine

import { PageElement, UniversalActionType } from '../../types/index.js';

export type MatchStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NO_MATCH'
  | 'STALE_ELEMENT'
  | 'ELEMENT_NOT_VISIBLE'
  | 'ELEMENT_DISABLED'
  | 'ACTION_INCOMPATIBLE'
  | 'DOM_CHANGED'
  | 'MATCHING_ERROR';

export type AblationMode =
  | 'EXACT_ONLY'
  | 'TEXT_ROLE'
  | 'TEXT_ROLE_ARIA'
  | 'TEXT_ROLE_CONTEXT'
  | 'FULL';

export interface ElementFingerprint {
  tag: string;
  role: string;
  normalizedText: string;
  normalizedAria: string;
  normalizedPlaceholder: string;
  normalizedName: string;
  type: string;
  normalizedParentText: string;
  signature: string;
}

export interface MatchTarget {
  text?: string;
  action: UniversalActionType;
  elementId?: string;
  targetHint?: string;
  context?: string;
  ordinal?: number;
  observationId?: string;
  expectedFingerprint?: ElementFingerprint;
  goal?: string;
}

export interface MatchEvidence {
  textScore: number;
  roleScore: number;
  ariaScore: number;
  labelScore: number;
  placeholderScore: number;
  nameScore: number;
  typeScore: number;
  contextScore: number;
  ordinalScore: number;
  visibilityScore: number;
  enabledScore: number;
  geometryScore: number;
  weightedScore: number;
  details: string[];
}

export interface MatchCandidate {
  elementId: string;
  element: PageElement;
  score: number;
  confidence: number;
  evidence: MatchEvidence;
  rejectedReasons: string[];
  isAmbiguous?: boolean;
}

export interface MatchResult {
  matched: boolean;
  status: MatchStatus;
  elementId?: string;
  element?: PageElement;
  confidence: number;
  margin?: number;
  candidates: MatchCandidate[];
  reason: string;
  diagnostics?: string;
  executionTimeMs?: number;
}

export interface FeatureWeights {
  text: number;
  role: number;
  aria: number;
  label: number;
  placeholder: number;
  name: number;
  type: number;
  context: number;
  ordinal: number;
  geometry: number;
}

export interface ConfidenceThresholds {
  /** Minimum score to accept a match directly */
  accept: number;
  /** Minimum score where an element is considered a plausible competitor */
  ambiguous: number;
  /** Minimum required margin between rank 1 and rank 2 to avoid ambiguity */
  minimumMargin: number;
  /** Direct ID match score threshold when validating unchanged elements */
  directIdAccept: number;
  /** Direct ID fingerprint match compatibility threshold */
  fingerprintCompatibility: number;
}

export interface MatchingLimits {
  maxCandidatesToScore: number;
  maxReturnedCandidates: number;
  maxContextLength: number;
  maxTextLength: number;
}

export interface MatchingConfig {
  weights: FeatureWeights;
  actionWeightOverrides: Partial<Record<UniversalActionType, Partial<FeatureWeights>>>;
  confidence: ConfidenceThresholds;
  limits: MatchingLimits;
}
