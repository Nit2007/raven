import { ModelAgnosticFaceDetector } from './face/faceDetector.js';
import { PerceptionFusionEngine } from './fusion/perceptionFusion.js';
import { ModelAgnosticOcrEngine } from './ocr/ocrEngine.js';
import { PiiCandidateDetector } from './pii/piiDetector.js';
export class LocalPerceptionPipeline {
    faceDetector;
    ocrEngine;
    piiDetector;
    fusionEngine;
    constructor() {
        this.faceDetector = new ModelAgnosticFaceDetector();
        this.ocrEngine = new ModelAgnosticOcrEngine();
        this.piiDetector = new PiiCandidateDetector();
        this.fusionEngine = new PerceptionFusionEngine();
    }
    async init() {
        await Promise.all([
            this.faceDetector.init(),
            this.ocrEngine.init()
        ]);
    }
    /**
     * Main entry point for local perception processing.
     * Transforms raw frame image into structured DetectionResult[] evidence for Person 1.
     */
    async perceiveFrame(input, canvasSource) {
        if (!canvasSource) {
            // If no canvas object supplied, return fused detections based on image metadata
            return [];
        }
        // 1. Run Face Detection
        const faceDetections = await this.faceDetector.detectFaces(canvasSource);
        // 2. Run OCR Recognition
        const { words: ocrWords, detections: ocrDetections } = await this.ocrEngine.recognizeText(canvasSource);
        // 3. Extract PII Candidates from OCR words
        const piiDetections = this.piiDetector.detectPiiFromOcr(ocrWords);
        // 4. Perception Fusion (Merge & Deduplicate)
        const fusedDetections = this.fusionEngine.fuseDetections([
            faceDetections,
            piiDetections,
            ocrDetections
        ]);
        return fusedDetections;
    }
}
