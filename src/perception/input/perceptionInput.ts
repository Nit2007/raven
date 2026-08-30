/**
 * PERCEPTION INPUT INTERFACE (Milestone 1 Foundation)
 * Defines the clean visual frame data structure passed into future ML modules (M2 Face Detection, M3 OCR, M4 PII).
 */

export interface PerceptionInput {
  /** Base64 PNG/JPEG image data URL */
  image: string;

  /** Width of the captured screenshot in pixels */
  width: number;

  /** Height of the captured screenshot in pixels */
  height: number;

  /** Stable coordinate system identifier (Origin (0,0) is top-left of screenshot) */
  coordinateSpace: 'SCREENSHOT';

  /** Display scaling ratio of the browser viewport */
  devicePixelRatio: number;

  /** Epoch timestamp of capture */
  timestamp: number;

  /** Verification flags confirming client locality */
  locality: {
    isLocal: true;
    externalAiUsed: false;
    uploadPerformed: false;
  };
}

/**
 * Validates a candidate PerceptionInput object.
 */
export function validatePerceptionInput(input: Partial<PerceptionInput>): input is PerceptionInput {
  return (
    typeof input.image === 'string' &&
    input.image.startsWith('data:image/') &&
    typeof input.width === 'number' &&
    input.width > 0 &&
    typeof input.height === 'number' &&
    input.height > 0 &&
    input.coordinateSpace === 'SCREENSHOT' &&
    input.locality?.isLocal === true
  );
}
