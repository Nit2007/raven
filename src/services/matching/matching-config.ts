// src/services/matching/matching-config.ts
// Centralized configuration and tuning thresholds for Element Matching Engine
// NO magic numbers allowed throughout the codebase — all parameters are defined and documented here.

import { MatchingConfig } from './matching-types.js';

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  // Base feature weights for multi-signal fusion (normalized during scoring)
  weights: {
    // Primary visible text similarity (exact, substring, token overlap, edit distance)
    text: 0.35,
    // Action-to-role semantic compatibility (e.g. click -> button/link, type -> input/textarea)
    role: 0.15,
    // ARIA label and accessible name matching
    aria: 0.20,
    // Form label and <label for> associations
    label: 0.15,
    // Input placeholder matching
    placeholder: 0.10,
    // Form field name/id attribute matching
    name: 0.08,
    // Input type compatibility (e.g. type="email" for "email")
    type: 0.08,
    // Parent container text, headings, and surrounding contextual clues
    context: 0.12,
    // Ordinal group matching bonus (e.g. "second product", "3rd button")
    ordinal: 0.20,
    // Geometric position and visual order as secondary tie-breaking evidence
    geometry: 0.05,
  },

  // Action-specific weight overrides to adjust weighting based on interaction intent
  actionWeightOverrides: {
    click: {
      text: 0.38,
      role: 0.20,
      aria: 0.22,
      context: 0.12,
      geometry: 0.08,
    },
    type: {
      text: 0.20,
      label: 0.24,
      placeholder: 0.22,
      aria: 0.18,
      name: 0.12,
      type: 0.14,
      role: 0.18,
      context: 0.12,
    },
    select: {
      role: 0.25,
      label: 0.22,
      text: 0.25,
      placeholder: 0.12,
      aria: 0.18,
    },
    check: {
      role: 0.25,
      label: 0.25,
      text: 0.25,
      aria: 0.20,
    },
  },

  // Decision thresholds tuned to minimize dangerous false positives while keeping high recall
  confidence: {
    // Absolute score required to consider a candidate as a confident match
    accept: 0.65,
    // Score threshold where a candidate is considered a viable competitor for ambiguity check
    ambiguous: 0.52,
    // Minimum score difference required between rank #1 and rank #2 to prevent ambiguous actions
    minimumMargin: 0.07,
    // Direct ID match confidence when an element is found intact by its ephemeral ID
    directIdAccept: 0.85,
    // Minimum structural/semantic fingerprint similarity to confirm element identity across mutations
    fingerprintCompatibility: 0.60,
  },

  // Practical safety and performance bounds for O(N) local evaluation (< 5ms execution target)
  limits: {
    // Maximum candidate elements evaluated in a single matching pass
    maxCandidatesToScore: 200,
    // Maximum candidates included in the detailed diagnostic result
    maxReturnedCandidates: 10,
    // Maximum string length for context snippet processing to prevent unnecessary allocations
    maxContextLength: 300,
    // Maximum string length for text tokenization
    maxTextLength: 200,
  },
};
