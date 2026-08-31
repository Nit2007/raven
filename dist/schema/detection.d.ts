/**
 * DETECTION SCHEMA CONTRACT (Person 2 -> Person 1)
 * PS 26171 — AI-Powered On-device Visual Perception for Lightweight Browser Agents
 */
export type DetectionType = 'FACE' | 'OCR_TEXT' | 'PII_CANDIDATE' | 'VISUAL_REGION';
export type DetectionSource = 'face' | 'ocr' | 'pii' | 'vision' | 'fusion';
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface DetectionResult {
    /** Unique detection identifier */
    id: string;
    /** Primary classification of detected element */
    type: DetectionType;
    /** Detector module that produced this result */
    source: DetectionSource;
    /** Bounding box in CSS pixel coordinates (0,0 is top-left of screenshot) */
    bbox: BoundingBox;
    /** Detection confidence score between 0.0 and 1.0 */
    confidence: number;
    /** Additional non-sensitive metadata (text string if OCR, PII category, etc.) */
    metadata?: {
        text?: string;
        piiType?: 'EMAIL' | 'PHONE' | 'CREDIT_CARD' | 'SSN' | 'PASSWORD' | 'UNKNOWN';
        detector?: string;
        [key: string]: unknown;
    };
}
export interface ViewportMeta {
    width: number;
    height: number;
    devicePixelRatio: number;
}
export interface PerceptionFrameInput {
    dataUrl: string;
    viewport: ViewportMeta;
    timestamp: number;
}
