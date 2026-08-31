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
        category?: string;
        piiType?: 'EMAIL' | 'PHONE' | 'PAYMENT_CARD' | 'GOVERNMENT_ID' | 'PERSON_NAME' | 'ADDRESS' | 'PASSWORD' | 'CREDIT_CARD' | 'SSN' | 'UNKNOWN';
        evidence?: string[];
        detector?: string;
        coordinateSpace?: 'SCREENSHOT';
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
export interface SubsystemStatus {
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    error?: string;
}
export interface StageTiming {
    captureMs: number;
    faceMs: number;
    ocrInitMs: number;
    ocrInferenceMs: number;
    normalizationMs: number;
    piiMs: number;
    fusionMs: number;
    totalMs: number;
    visionMs?: number;
}
export interface LocalityReport {
    isLocal: true;
    externalAiUsed: false;
    networkUploadPerformed: false;
}
export interface UnifiedPerceptionResult {
    schemaVersion: '1.0.0';
    status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE';
    generatedAt: number;
    screenshot: {
        width: number;
        height: number;
        coordinateSpace: 'SCREENSHOT';
    };
    detections: DetectionResult[];
    counts: {
        faces: number;
        ocrRegions: number;
        piiCandidates: number;
        visualObjects?: number;
        total: number;
    };
    timing: StageTiming;
    locality: LocalityReport;
    subsystems: {
        face: SubsystemStatus;
        ocr: SubsystemStatus;
        pii: SubsystemStatus;
        vision?: SubsystemStatus;
    };
}
