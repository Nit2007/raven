import { DetectionResult } from '../../schema/detection.js';
import { RawOcrWord } from '../pii/piiDetector.js';
export interface IOcrEngine {
    init(): Promise<void>;
    recognizeText(imageElement: CanvasImageSource): Promise<{
        words: RawOcrWord[];
        detections: DetectionResult[];
    }>;
}
export declare class ModelAgnosticOcrEngine implements IOcrEngine {
    private isInitialized;
    init(): Promise<void>;
    recognizeText(imageElement: CanvasImageSource): Promise<{
        words: RawOcrWord[];
        detections: DetectionResult[];
    }>;
}
