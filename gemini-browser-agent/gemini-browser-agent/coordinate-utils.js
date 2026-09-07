/**
 * coordinate-utils.js — Canonical Coordinate Normalization & Bounding Box Validation
 * 
 * Defines the single authoritative coordinate system for visual redaction:
 *   CANONICAL_COORDINATE_SPACE = "m1-screenshot-pixels"
 * 
 * Rules:
 * 1. M1 screenshot pixel coordinates are the canonical coordinate system.
 * 2. Every visual sensitive region sent to M6 must be represented in this space.
 * 3. Exact scaling: scaleX = Wimg / Wsrc, scaleY = Himg / Hsrc. Never assume scale === dpr.
 * 4. Validation invariants: 0 <= x < W, 0 <= y < H, w > 0, h > 0, x + w <= W, y + h <= H.
 * 5. Reject NaN, Infinity, negative/zero area, and suspicious coverage (coverageRatio >= 0.45).
 * 6. Never convert invalid boxes into full-screen redaction.
 * 7. Zero-leak telemetry: logs coordinate metadata without raw face images or PII.
 */

export const CANONICAL_COORDINATE_SPACE = 'm1-screenshot-pixels';

/**
 * Validates a bounding box against target image dimensions.
 * Enforces invariants:
 * - 0 <= x < targetWidth
 * - 0 <= y < targetHeight
 * - width > 0, height > 0
 * - x + width <= targetWidth + tolerance
 * - y + height <= targetHeight + tolerance
 * - coverageRatio < maxCoverageRatio (default 0.45)
 * 
 * @param {object} box - { x, y, width, height }
 * @param {number} targetWidth - Physical pixel width of M1 screenshot
 * @param {number} targetHeight - Physical pixel height of M1 screenshot
 * @param {object} [options]
 * @param {number} [options.maxCoverageRatio=0.45] - Area coverage anomaly threshold
 * @param {number} [options.tolerance=2] - Floating point rounding tolerance in px
 * @returns {{ isValid: boolean, box?: object, reason?: string, coverageRatio?: number, clamped?: boolean }}
 */
export function validateBoundingBox(box, targetWidth, targetHeight, options = {}) {
  const { maxCoverageRatio = 0.45, tolerance = 2 } = options;

  if (!box || typeof box !== 'object') {
    return { isValid: false, reason: 'box_null_or_invalid_type' };
  }

  const rawX = Number(box.x);
  const rawY = Number(box.y);
  const rawW = Number(box.width);
  const rawH = Number(box.height);

  // Reject NaN / Infinity
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY) || !Number.isFinite(rawW) || !Number.isFinite(rawH)) {
    return { isValid: false, reason: 'non_finite_coordinates' };
  }

  // Reject zero or negative dimensions
  if (rawW <= 0 || rawH <= 0) {
    return { isValid: false, reason: 'zero_or_negative_dimensions' };
  }

  // Ensure target dimensions are positive
  if (!targetWidth || !targetHeight || targetWidth <= 0 || targetHeight <= 0) {
    return { isValid: false, reason: 'invalid_target_dimensions' };
  }

  // Check if box starts completely outside target bounds
  if (rawX >= targetWidth || rawY >= targetHeight || (rawX + rawW) <= 0 || (rawY + rawH) <= 0) {
    return { isValid: false, reason: 'box_completely_outside_image' };
  }

  // Clamp with small floating point tolerance
  const clampedX = Math.max(0, Math.min(targetWidth - 1, Math.round(rawX)));
  const clampedY = Math.max(0, Math.round(rawY));
  const clampedW = Math.max(1, Math.min(targetWidth - clampedX, Math.round(rawW)));
  const clampedH = Math.max(1, Math.min(targetHeight - clampedY, Math.round(rawH)));

  const wasClamped = (
    Math.abs(clampedX - rawX) > tolerance ||
    Math.abs(clampedY - rawY) > tolerance ||
    Math.abs(clampedW - rawW) > tolerance ||
    Math.abs(clampedH - rawH) > tolerance
  );

  // Calculate area coverage ratio
  const regionArea = clampedW * clampedH;
  const imageArea = targetWidth * targetHeight;
  const coverageRatio = Number((regionArea / imageArea).toFixed(4));

  // Area sanity check: faces are localized; suspiciously large coverage indicates corruption
  if (coverageRatio >= maxCoverageRatio) {
    return {
      isValid: false,
      reason: `suspiciously_large_coverage_ratio (${(coverageRatio * 100).toFixed(1)}% >= ${(maxCoverageRatio * 100).toFixed(0)}%)`,
      coverageRatio,
      box: { x: clampedX, y: clampedY, width: clampedW, height: clampedH }
    };
  }

  return {
    isValid: true,
    box: {
      x: clampedX,
      y: clampedY,
      width: clampedW,
      height: clampedH,
      coordinateSpace: CANONICAL_COORDINATE_SPACE
    },
    coverageRatio,
    clamped: wasClamped
  };
}

/**
 * Authoritative helper to normalize any visual region into canonical M1 screenshot coordinates.
 * Determines the actual source coordinate space rather than guessing.
 * 
 * @param {object|Array} region - Raw region { x, y, width, height } or [x, y, w, h]
 * @param {object} sourceDimensions - { width: number, height: number, coordinateSpace?: string }
 * @param {object} targetDimensions - { width: number, height: number, coordinateSpace?: string }
 * @param {object} [options] - Options passed to validateBoundingBox
 * @returns {object} Normalization result with normalizedBox or isValid: false
 */
export function normalizeVisualRegionToM1(region, sourceDimensions, targetDimensions, options = {}) {
  if (!region) {
    return { isValid: false, reason: 'region_missing' };
  }

  // Extract raw coordinates
  let rawX = 0, rawY = 0, rawW = 0, rawH = 0;
  if (Array.isArray(region)) {
    [rawX, rawY, rawW, rawH] = region;
  } else if (typeof region === 'object') {
    rawX = region.x ?? region.left ?? region.bbox?.[0] ?? 0;
    rawY = region.y ?? region.top ?? region.bbox?.[1] ?? 0;
    rawW = region.width ?? region.bbox?.[2] ?? 0;
    rawH = region.height ?? region.bbox?.[3] ?? 0;
  }

  const sourceBox = { x: rawX, y: rawY, width: rawW, height: rawH };
  const sourceSpace = sourceDimensions?.coordinateSpace || (
    (region.coordinateSpace === CANONICAL_COORDINATE_SPACE) ? CANONICAL_COORDINATE_SPACE : 'dom-css-viewport'
  );

  const srcW = Number(sourceDimensions?.width) || 0;
  const srcH = Number(sourceDimensions?.height) || 0;
  const tgtW = Number(targetDimensions?.width) || 0;
  const tgtH = Number(targetDimensions?.height) || 0;

  if (tgtW <= 0 || tgtH <= 0) {
    return {
      isValid: false,
      reason: 'target_dimensions_invalid',
      sourceBox,
      sourceSpace
    };
  }

  // If already in canonical M1 screenshot pixels and target dimensions match source
  if (sourceSpace === CANONICAL_COORDINATE_SPACE && (srcW === 0 || srcW === tgtW) && (srcH === 0 || srcH === tgtH)) {
    const val = validateBoundingBox(sourceBox, tgtW, tgtH, options);
    return {
      isValid: val.isValid,
      reason: val.reason,
      sourceSpace: CANONICAL_COORDINATE_SPACE,
      sourceBox,
      targetSpace: CANONICAL_COORDINATE_SPACE,
      targetDimensions: { width: tgtW, height: tgtH },
      normalizedBox: val.box || null,
      scaleX: 1,
      scaleY: 1,
      coverageRatio: val.coverageRatio
    };
  }

  // Calculate explicit scale factors: target / source
  const effectiveSrcW = srcW > 0 ? srcW : tgtW;
  const effectiveSrcH = srcH > 0 ? srcH : tgtH;

  const scaleX = tgtW / effectiveSrcW;
  const scaleY = tgtH / effectiveSrcH;

  const scaledBox = {
    x: Math.round(sourceBox.x * scaleX),
    y: Math.round(sourceBox.y * scaleY),
    width: Math.round(sourceBox.width * scaleX),
    height: Math.round(sourceBox.height * scaleY)
  };

  const validation = validateBoundingBox(scaledBox, tgtW, tgtH, options);

  return {
    isValid: validation.isValid,
    reason: validation.reason,
    sourceSpace,
    sourceDimensions: { width: effectiveSrcW, height: effectiveSrcH },
    sourceBox,
    targetSpace: CANONICAL_COORDINATE_SPACE,
    targetDimensions: { width: tgtW, height: tgtH },
    normalizedBox: validation.box || null,
    scaleX: Number(scaleX.toFixed(4)),
    scaleY: Number(scaleY.toFixed(4)),
    coverageRatio: validation.coverageRatio,
    clamped: validation.clamped
  };
}

/**
 * Creates structured, zero-leak telemetry for coordinate transformations.
 * Strictly excludes raw pixel buffers, personal names, email, phone, or OCR values.
 */
export function createCoordinateTelemetry(regionId, normResult) {
  return {
    type: 'COORDINATE_TRANSFORMATION',
    regionId: regionId || 'region',
    sourceSpace: normResult.sourceSpace || 'unknown',
    sourceWidth: normResult.sourceDimensions?.width || 0,
    sourceHeight: normResult.sourceDimensions?.height || 0,
    sourceBox: normResult.sourceBox || null,
    targetSpace: normResult.targetSpace || CANONICAL_COORDINATE_SPACE,
    targetWidth: normResult.targetDimensions?.width || 0,
    targetHeight: normResult.targetDimensions?.height || 0,
    normalizedBox: normResult.normalizedBox || null,
    scaleX: normResult.scaleX || 1,
    scaleY: normResult.scaleY || 1,
    coverageRatio: normResult.coverageRatio || 0,
    isValid: normResult.isValid,
    reason: normResult.reason || null
  };
}
