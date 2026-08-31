import { BoundingBox } from '../../schema/detection.js';
import { RawOcrWord } from '../pii/piiDetector.js';
export interface NormalizedOcrRegion {
    id: string;
    groupedText: string;
    combinedBBox: BoundingBox;
    avgConfidence: number;
    sourceTokens: RawOcrWord[];
}
export declare class OcrTokenNormalizer {
    private static readonly MAX_BASELINE_DIFF_PX;
    private static readonly MAX_HORIZONTAL_GAP_PX;
    /**
     * Scans raw word-level OCR tokens and groups spatially adjacent tokens into normalized line-level text regions.
     */
    normalizeTokens(rawTokens: RawOcrWord[]): NormalizedOcrRegion[];
    /**
     * Computes the bounding box covering all tokens in a group.
     * x = min(token.x), y = min(token.y), width = max(x + width) - x, height = max(y + height) - y
     */
    private computeCombinedBBox;
}
