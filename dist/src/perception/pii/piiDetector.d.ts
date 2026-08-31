import { BoundingBox, DetectionResult } from '../../schema/detection.js';
export interface RawOcrWord {
    text: string;
    bbox: BoundingBox;
    confidence: number;
}
export type PiiCategory = 'EMAIL' | 'PHONE' | 'PAYMENT_CARD' | 'GOVERNMENT_ID' | 'PERSON_NAME' | 'ADDRESS' | 'PASSWORD' | 'UNKNOWN';
export interface PiiDetectionMetadata {
    category: PiiCategory;
    piiType: PiiCategory;
    text: string;
    evidence: string[];
    detector: string;
    coordinateSpace: 'SCREENSHOT';
    [key: string]: unknown;
}
export declare class PiiCandidateDetector {
    private static readonly EMAIL_REGEX;
    private static readonly PHONE_REGEX;
    private static readonly LOCAL_PHONE_REGEX;
    private static readonly PAN_REGEX;
    private static readonly AADHAAR_REGEX;
    private static readonly SSN_REGEX;
    private static readonly SECRET_KEY_REGEX;
    private static readonly NON_PHONE_CONTEXT_REGEX;
    /**
     * Main entry point for Local PII Candidate Detection.
     * Scans OCR words, evaluates single and multi-token spatial sequences, patterns, context, and bounding boxes.
     */
    detectPiiFromOcr(ocrResults: RawOcrWord[]): DetectionResult[];
    /**
     * Evaluates spatially adjacent OCR tokens for multi-token phone numbers (e.g. +91 733 961 3670, +91 99444 90004, +92 318 9664771, +39 339 214 9566).
     */
    private tryExtractMultiTokenPhone;
    /**
     * Evaluates spatially adjacent OCR tokens for multi-token payment cards (e.g. 4111 1111 1111 1111).
     * Strictly rejects any text containing a '+' country code prefix.
     */
    private tryExtractMultiTokenCard;
    /**
     * Evaluates spatially adjacent OCR tokens for Aadhaar numbers (e.g. 1234 5678 9012).
     */
    private tryExtractMultiTokenAadhaar;
    /**
     * Scans spatial neighborhood for contextual label words.
     */
    private getNearbyContextText;
    /**
     * Validates credit card digits using Luhn algorithm.
     */
    private luhnCheck;
    /**
     * Merges two bounding boxes into a single bounding box.
     */
    private mergeBoundingBoxes;
    /**
     * Deduplicates identical candidate values or highly overlapping spatial boxes.
     */
    private deduplicateCandidates;
    /**
     * Factory method constructing a DetectionResult conforming strictly to DETECTION_SCHEMA.md.
     */
    private createDetection;
}
