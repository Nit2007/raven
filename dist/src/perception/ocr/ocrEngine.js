import Tesseract from 'tesseract.js';
import { OcrCoordinateConverter } from './ocrCoordinateConverter.js';
import { OcrTokenNormalizer } from './ocrTokenNormalizer.js';
export class LocalOcrEngine {
    isInitialized = false;
    engineInfo = 'Tesseract.js WASM Engine (v5 Local)';
    normalizer = new OcrTokenNormalizer();
    async init() {
        if (this.isInitialized)
            return;
        this.isInitialized = true;
    }
    /**
     * Main entry point for Local OCR text recognition.
     * Uses genuine Tesseract.js WASM engine to recognize visual text.
     */
    async recognizeText(input, imageSource) {
        const startTime = performance.now();
        try {
            if (!this.isInitialized) {
                await this.init();
            }
            if (!input || !input.image) {
                return {
                    success: false,
                    detections: [],
                    words: [],
                    normalizedRegions: [],
                    latencyMs: 0,
                    engineInfo: this.engineInfo,
                    error: 'Invalid PerceptionInput frame provided.'
                };
            }
            // Determine image target for Tesseract recognition
            let imageTarget = input.image;
            const isCanvas = typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement;
            if (isCanvas) {
                imageTarget = imageSource;
            }
            // Configure local extension paths for worker and WASM core.
            const tessOptions = {};
            if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
                try {
                    tessOptions.workerPath = chrome.runtime.getURL('extension/vendor/tesseract/worker.min.js');
                    tessOptions.corePath = chrome.runtime.getURL('extension/vendor/tesseract/tesseract-core-lstm.wasm.js');
                    tessOptions.workerBlobURL = false;
                }
                catch (e) {
                    console.warn('Chrome runtime getURL note:', e);
                }
            }
            // Execute Tesseract.js OCR Recognition
            const result = await Tesseract.recognize(imageTarget, 'eng', tessOptions);
            console.log('=== RAW TESSERACT OCR OUTPUT ===');
            console.log('RAW TEXT:\n', result.data.text);
            console.log('RAW WORDS COUNT:', result.data.words?.length || 0);
            const words = [];
            const rawDetections = [];
            if (result && result.data && Array.isArray(result.data.words)) {
                for (const w of result.data.words) {
                    const rawText = w.text ? w.text.trim() : '';
                    if (!rawText || rawText.length === 0)
                        continue;
                    const rawBBox = {
                        x0: w.bbox.x0,
                        y0: w.bbox.y0,
                        x1: w.bbox.x1,
                        y1: w.bbox.y1
                    };
                    const width = rawBBox.x1 - rawBBox.x0;
                    const height = rawBBox.y1 - rawBBox.y0;
                    if (width <= 0 || height <= 0)
                        continue;
                    const confidence = Math.min(1.0, Math.max(0.0, (typeof w.confidence === 'number' ? w.confidence : 80) / 100));
                    const screenshotBox = OcrCoordinateConverter.toScreenshotPixelCoords(rawBBox, input.width, input.height);
                    words.push({
                        text: rawText,
                        bbox: screenshotBox,
                        confidence
                    });
                    rawDetections.push({
                        id: `det_ocr_${Date.now()}_${rawDetections.length + 1}`,
                        type: 'OCR_TEXT',
                        source: 'ocr',
                        bbox: screenshotBox,
                        confidence,
                        metadata: {
                            text: rawText,
                            detector: 'tesseract-wasm-v5',
                            coordinateSpace: 'SCREENSHOT'
                        }
                    });
                }
            }
            // Pass raw tokens through OCR Token Normalizer to form line-level regions
            const normalizedRegions = this.normalizer.normalizeTokens(words);
            // Create line-level detection objects from normalized regions
            const detections = normalizedRegions.map((norm, idx) => ({
                id: `det_norm_ocr_${Date.now()}_${idx + 1}`,
                type: 'OCR_TEXT',
                source: 'ocr',
                bbox: norm.combinedBBox,
                confidence: norm.avgConfidence,
                metadata: {
                    text: norm.groupedText,
                    detector: 'tesseract-wasm-v5-normalized',
                    coordinateSpace: 'SCREENSHOT',
                    tokenCount: norm.sourceTokens.length
                }
            }));
            const latencyMs = Math.round(performance.now() - startTime);
            return {
                success: true,
                detections: detections.length > 0 ? detections : rawDetections,
                words,
                normalizedRegions,
                latencyMs,
                engineInfo: this.engineInfo,
                rawText: result.data.text
            };
        }
        catch (err) {
            console.error('LocalOcrEngine Tesseract execution error:', err);
            return {
                success: false,
                detections: [],
                words: [],
                normalizedRegions: [],
                latencyMs: Math.round(performance.now() - startTime),
                engineInfo: this.engineInfo,
                error: err instanceof Error ? err.message : String(err)
            };
        }
    }
}
