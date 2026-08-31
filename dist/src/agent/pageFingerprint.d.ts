/**
 * PageFingerprint — Lightweight deterministic page state fingerprinting.
 *
 * Used to detect meaningful browser transitions and evaluate action causality.
 * STRICT PRIVACY GUARANTEE: Never includes raw sensitive values or PII.
 */
export interface PageFingerprintResult {
    fingerprint: string;
    navigationKey: string;
    elementSignatureHash: string;
}
export declare function createPageFingerprint(sanitizedPageState: any): PageFingerprintResult;
