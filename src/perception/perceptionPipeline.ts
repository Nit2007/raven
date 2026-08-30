import {
  DetectionResult,
  PerceptionFrameInput,
  StageTiming,
  UnifiedPerceptionResult
} from '../schema/detection.js';
import { FaceDetectionResponse, LocalFaceDetector } from './face/faceDetector.js';
import { PerceptionFusionEngine } from './fusion/perceptionFusion.js';
import { PerceptionInput } from './input/perceptionInput.js';
import { LocalOcrEngine, OcrResponse } from './ocr/ocrEngine.js';
import { OcrTokenNormalizer } from './ocr/ocrTokenNormalizer.js';
import { PiiCandidateDetector } from './pii/piiDetector.js';
import { LocalVisualObjectDetector, VisualDetectorResponse } from './vision/visualObjectDetector.js';

export interface PiiDetectionResponse {
  success: boolean;
  detections: DetectionResult[];
  latencyMs: number;
  engineInfo: string;
  error?: string;
}

export class LocalPerceptionPipeline {
  private faceDetector: LocalFaceDetector;
  private ocrEngine: LocalOcrEngine;
  private tokenNormalizer: OcrTokenNormalizer;
  private piiDetector: PiiCandidateDetector;
  private visualDetector: LocalVisualObjectDetector;
  private fusionEngine: PerceptionFusionEngine;
  private isOcrInitialized = false;

  constructor() {
    this.faceDetector = new LocalFaceDetector();
    this.ocrEngine = new LocalOcrEngine();
    this.tokenNormalizer = new OcrTokenNormalizer();
    this.piiDetector = new PiiCandidateDetector();
    this.visualDetector = new LocalVisualObjectDetector();
    this.fusionEngine = new PerceptionFusionEngine();
  }

  public async init(): Promise<void> {
    await Promise.all([
      this.faceDetector.init(),
      this.ocrEngine.init(),
      this.visualDetector.init()
    ]);
    this.isOcrInitialized = true;
  }

  /**
   * M2 Local Face Detection interface entry point.
   */
  public async detectFaces(
    input: PerceptionInput,
    imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ): Promise<FaceDetectionResponse> {
    return this.faceDetector.detectFaces(input, imageSource);
  }

  /**
   * M3 Local OCR interface entry point.
   */
  public async recognizeText(
    input: PerceptionInput,
    imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ): Promise<OcrResponse> {
    return this.ocrEngine.recognizeText(input, imageSource);
  }

  /**
   * M4 Local PII Candidate Detection entry point.
   */
  public async detectPii(
    input: PerceptionInput,
    imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ): Promise<PiiDetectionResponse> {
    const startTime = performance.now();
    try {
      const ocrResponse = await this.ocrEngine.recognizeText(input, imageSource);
      if (!ocrResponse.success) {
        return {
          success: false,
          detections: [],
          latencyMs: Math.round(performance.now() - startTime),
          engineInfo: 'Local PII Candidate Detector (Layered Rules v2)',
          error: ocrResponse.error
        };
      }

      const piiDetections = this.piiDetector.detectPiiFromOcr(ocrResponse.words);
      const latencyMs = Math.round(performance.now() - startTime);

      return {
        success: true,
        detections: piiDetections,
        latencyMs,
        engineInfo: 'Local PII Candidate Detector (Layered Rules v2)'
      };
    } catch (err) {
      return {
        success: false,
        detections: [],
        latencyMs: Math.round(performance.now() - startTime),
        engineInfo: 'Local PII Candidate Detector (Layered Rules v2)',
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * M6/M6.1 Local Visual Sensitive Document Detector entry point.
   */
  public async detectVisualObjects(
    input: PerceptionInput,
    imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    ocrWords?: any[]
  ): Promise<VisualDetectorResponse> {
    return this.visualDetector.detectVisualObjects(input, imageSource, ocrWords);
  }

  /**
   * M5/M6/M6.1 Main Entry Point: Person 1 Local Handoff Function.
   * Executes local perception across Face, OCR, PII, and Visual Document modules with failure isolation and constructs UnifiedPerceptionResult.
   */
  public async runLocalPerception(
    input: PerceptionInput,
    imageSource?: HTMLImageElement | HTMLCanvasElement | ImageBitmap
  ): Promise<UnifiedPerceptionResult> {
    const tTotalStart = performance.now();

    console.log('[RAVEN:M2] CAPTURE START', { width: input.width, height: input.height });

    // 1 & 2. Concurrent Execution: Face Detection + OCR Text Recognition
    const tFaceStart = performance.now();
    const tOcrInitStart = performance.now();
    let ocrInitMs = 0;

    if (!this.isOcrInitialized) {
      try {
        await this.ocrEngine.init();
        this.isOcrInitialized = true;
        ocrInitMs = Math.round(performance.now() - tOcrInitStart);
      } catch (e) {
        console.warn('OCR init warning:', e);
      }
    }

    console.log('[RAVEN:M3] OCR START');
    console.log('[RAVEN:M4] FACE START');

    const tOcrInfStart = performance.now();

    const [faceResp, ocrResp] = await Promise.all([
      this.faceDetector.detectFaces(input, imageSource).catch(err => ({
        success: false,
        detections: [],
        latencyMs: Math.round(performance.now() - tFaceStart),
        engineInfo: 'BlazeFace WASM',
        error: err instanceof Error ? err.message : String(err)
      })),
      this.ocrEngine.recognizeText(input, imageSource).catch(err => ({
        success: false,
        detections: [],
        words: [],
        latencyMs: Math.round(performance.now() - tOcrInfStart),
        engineInfo: 'Tesseract.js WASM v5',
        error: err instanceof Error ? err.message : String(err)
      }))
    ]);

    const faceMs = Math.round(performance.now() - tFaceStart);
    const ocrInferenceMs = Math.round(performance.now() - tOcrInfStart);

    console.log('[RAVEN:M3] OCR COMPLETE', { latencyMs: ocrInferenceMs, regions: ocrResp.detections?.length || 0 });
    console.log('[RAVEN:M4] FACE COMPLETE', { latencyMs: faceMs, faces: faceResp.detections?.length || 0 });

    const faceRes = faceResp.success
      ? { detections: faceResp.detections, status: 'SUCCESS' as const }
      : { detections: [], status: 'FAILED' as const, error: faceResp.error };

    const rawOcrWords = (ocrResp as any).words || [];
    const ocrRes = ocrResp.success
      ? { detections: ocrResp.detections, status: 'SUCCESS' as const }
      : { detections: [], status: 'FAILED' as const, error: ocrResp.error };

    // 3. Visual Sensitive Document Detection (M6.1)
    console.log('[RAVEN:M5] VISION START');
    const tVisionStart = performance.now();
    let visionRes: { detections: DetectionResult[]; status: 'SUCCESS' | 'FAILED' | 'SKIPPED'; error?: string };
    let visionMs = 0;
    try {
      const vResp = await this.visualDetector.detectVisualObjects(input, imageSource, rawOcrWords);
      visionRes = vResp.success
        ? { detections: vResp.detections, status: 'SUCCESS' }
        : { detections: [], status: 'FAILED', error: vResp.error };
      visionMs = Math.round(performance.now() - tVisionStart);
    } catch (err) {
      visionRes = { detections: [], status: 'FAILED', error: err instanceof Error ? err.message : String(err) };
      visionMs = Math.round(performance.now() - tVisionStart);
    }
    console.log('[RAVEN:M5] VISION COMPLETE', { latencyMs: visionMs, objects: visionRes.detections.length });

    // 4. Token Normalization
    const tNormStart = performance.now();
    let normalizationMs = 0;
    if (rawOcrWords.length > 0) {
      this.tokenNormalizer.normalizeTokens(rawOcrWords);
      normalizationMs = Math.round((performance.now() - tNormStart) * 100) / 100;
    }

    // 5. PII Candidate Detection
    console.log('[RAVEN:M6] PII/FUSION START');
    const tPiiStart = performance.now();
    let piiRes: { detections: DetectionResult[]; status: 'SUCCESS' | 'FAILED' | 'SKIPPED'; error?: string };
    try {
      if (ocrRes.status === 'SUCCESS' && rawOcrWords.length > 0) {
        const piiDets = this.piiDetector.detectPiiFromOcr(rawOcrWords);
        piiRes = { detections: piiDets, status: 'SUCCESS' };
      } else {
        piiRes = { detections: [], status: 'SKIPPED', error: 'OCR failed or returned 0 words' };
      }
    } catch (err) {
      piiRes = { detections: [], status: 'FAILED', error: err instanceof Error ? err.message : String(err) };
    }
    const piiMs = Math.round((performance.now() - tPiiStart) * 100) / 100;

    // 6. Spatial Perception Fusion
    const tFusionStart = performance.now();
    const timing: StageTiming = {
      captureMs: 0,
      faceMs,
      ocrInitMs,
      ocrInferenceMs,
      normalizationMs,
      piiMs,
      visionMs,
      fusionMs: 0,
      totalMs: 0
    };

    const unifiedResult = this.fusionEngine.buildUnifiedResult({
      screenshotWidth: input.width,
      screenshotHeight: input.height,
      faceResults: faceRes,
      ocrResults: ocrRes,
      piiResults: piiRes,
      visionResults: visionRes,
      timing
    });

    const fusionMs = Math.round((performance.now() - tFusionStart) * 100) / 100;
    const totalMs = Math.round(performance.now() - tTotalStart);

    unifiedResult.timing.fusionMs = fusionMs;
    unifiedResult.timing.totalMs = totalMs;

    console.log('[RAVEN:M6] PII/FUSION COMPLETE', {
      latencyMs: fusionMs,
      totalUnifiedElements: unifiedResult.detections.length,
      totalPipelineMs: totalMs
    });

    return unifiedResult;
  }

  /**
   * Main entry point for local perception frame processing.
   */
  public async perceiveFrame(input: PerceptionFrameInput, canvasSource?: HTMLCanvasElement): Promise<DetectionResult[]> {
    if (!canvasSource) {
      return [];
    }

    const perceptionInput: PerceptionInput = {
      image: input.dataUrl,
      width: input.viewport.width,
      height: input.viewport.height,
      coordinateSpace: 'SCREENSHOT',
      devicePixelRatio: input.viewport.devicePixelRatio,
      timestamp: input.timestamp,
      locality: {
        isLocal: true,
        externalAiUsed: false,
        uploadPerformed: false
      }
    };

    const unified = await this.runLocalPerception(perceptionInput, canvasSource);
    return unified.detections;
  }
}
