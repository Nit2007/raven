import { DetectionResult } from '../../schema/detection.js';
export interface RawOcrWord {
    text: string;
    bbox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    confidence: number;
}
export declare class PiiCandidateDetector {
    private static readonly EMAIL_REGEX;
    private static readonly PHONE_REGEX;
    private static readonly CREDIT_CARD_REGEX;
    private static readonly SSN_REGEX;
    private static readonly SECRET_KEY_REGEX;
    /**
     * Scans recognized OCR words/text blocks for PII candidate patterns.
     */
    detectPiiFromOcr(ocrResults: RawOcrWord[]): DetectionResult[];
}
