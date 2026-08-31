/**
 * PERCEPTION INPUT INTERFACE (Milestone 1 Foundation)
 * Defines the clean visual frame data structure passed into future ML modules (M2 Face Detection, M3 OCR, M4 PII).
 */
/**
 * Validates a candidate PerceptionInput object.
 */
export function validatePerceptionInput(input) {
    return (typeof input.image === 'string' &&
        input.image.startsWith('data:image/') &&
        typeof input.width === 'number' &&
        input.width > 0 &&
        typeof input.height === 'number' &&
        input.height > 0 &&
        input.coordinateSpace === 'SCREENSHOT' &&
        input.locality?.isLocal === true);
}
