import { CaptureManager } from '../perception/capture/captureManager.js';
import { LocalFaceDetector } from '../perception/face/faceDetector.js';
import { PerceptionInput } from '../perception/input/perceptionInput.js';
import { LocalOcrEngine } from '../perception/ocr/ocrEngine.js';
import { OcrTokenNormalizer } from '../perception/ocr/ocrTokenNormalizer.js';
import { LocalPerceptionPipeline } from '../perception/perceptionPipeline.js';
import { PiiCandidateDetector, PiiDetectionMetadata } from '../perception/pii/piiDetector.js';
import { LocalVisualObjectDetector } from '../perception/vision/visualObjectDetector.js';
import { DetectionResult } from '../schema/detection.js';

const captureManager = new CaptureManager();
const faceDetector = new LocalFaceDetector();
const ocrEngine = new LocalOcrEngine();
const tokenNormalizer = new OcrTokenNormalizer();
const piiDetector = new PiiCandidateDetector();
const visualDetector = new LocalVisualObjectDetector();
const pipeline = new LocalPerceptionPipeline();

let currentInput: PerceptionInput | null = null;
let lastCaptureTimeMs = 0;
let isOcrInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
  const captureBtn = document.getElementById('captureBtn') as HTMLButtonElement;
  const detectFacesBtn = document.getElementById('detectFacesBtn') as HTMLButtonElement;
  const runOcrBtn = document.getElementById('runOcrBtn') as HTMLButtonElement;
  const detectPiiBtn = document.getElementById('detectPiiBtn') as HTMLButtonElement;
  const detectVisionBtn = document.getElementById('detectVisionBtn') as HTMLButtonElement;
  const runUnifiedBtn = document.getElementById('runUnifiedBtn') as HTMLButtonElement;

  const statusEl = document.getElementById('captureStatus') as HTMLSpanElement;
  const dimensionsEl = document.getElementById('imgDimensions') as HTMLSpanElement;
  const coordEl = document.getElementById('coordSpace') as HTMLSpanElement;
  const countsEl = document.getElementById('detectionCounts') as HTMLSpanElement;
  const handoffStatusEl = document.getElementById('handoffStatus') as HTMLSpanElement;

  const subFaceEl = document.getElementById('subFace') as HTMLDivElement;
  const subOcrEl = document.getElementById('subOcr') as HTMLDivElement;
  const subPiiEl = document.getElementById('subPii') as HTMLDivElement;
  const subVisionEl = document.getElementById('subVision') as HTMLDivElement;
  const subFusionEl = document.getElementById('subFusion') as HTMLDivElement;

  const visualWrapper = document.getElementById('visualWrapper') as HTMLDivElement;
  const previewImg = document.getElementById('capturePreview') as HTMLImageElement;
  const bboxOverlay = document.getElementById('bboxOverlay') as HTMLCanvasElement;
  const detectionListEl = document.getElementById('detectionList') as HTMLDivElement;
  const errorBox = document.getElementById('errorBox') as HTMLDivElement;

  const timingPanel = document.getElementById('timingPanel') as HTMLDivElement;
  const tCaptureEl = document.getElementById('tCapture') as HTMLSpanElement;
  const tFaceEl = document.getElementById('tFace') as HTMLSpanElement;
  const tVisionEl = document.getElementById('tVision') as HTMLSpanElement;
  const tOcrInitEl = document.getElementById('tOcrInit') as HTMLSpanElement;
  const tOcrInferenceEl = document.getElementById('tOcrInference') as HTMLSpanElement;
  const tNormalizerEl = document.getElementById('tNormalizer') as HTMLSpanElement;
  const tPiiEl = document.getElementById('tPii') as HTMLSpanElement;
  const tFusionEl = document.getElementById('tFusion') as HTMLSpanElement;
  const tTotalEl = document.getElementById('tTotal') as HTMLSpanElement;

  captureBtn.addEventListener('click', async () => {
    errorBox.style.display = 'none';
    statusEl.textContent = 'CAPTURING...';
    statusEl.className = 'status-val';
    captureBtn.disabled = true;
    detectFacesBtn.disabled = true;
    runOcrBtn.disabled = true;
    detectPiiBtn.disabled = true;
    detectVisionBtn.disabled = true;
    runUnifiedBtn.disabled = true;

    const tStart = performance.now();
    try {
      const result = await captureManager.captureVisibleViewport();
      lastCaptureTimeMs = Math.round(performance.now() - tStart);

      if (result.success && result.input) {
        currentInput = result.input;
        statusEl.textContent = 'SUCCESS';
        statusEl.className = 'status-val status-success';

        dimensionsEl.textContent = `${result.input.width} x ${result.input.height} px`;
        coordEl.textContent = result.input.coordinateSpace;

        previewImg.src = result.input.image;
        visualWrapper.style.display = 'block';

        detectFacesBtn.disabled = false;
        runOcrBtn.disabled = false;
        detectPiiBtn.disabled = false;
        detectVisionBtn.disabled = false;
        runUnifiedBtn.disabled = false;

        clearOverlay();
        countsEl.textContent = 'Ready for Local ML';
        tCaptureEl.textContent = `${lastCaptureTimeMs} ms`;
        timingPanel.style.display = 'block';
        detectionListEl.style.display = 'none';
      } else {
        statusEl.textContent = 'FAILED';
        statusEl.className = 'status-val status-error';
        errorBox.textContent = result.error || 'Capture failed.';
        errorBox.style.display = 'block';
        visualWrapper.style.display = 'none';
      }
    } catch (err) {
      statusEl.textContent = 'ERROR';
      statusEl.className = 'status-val status-error';
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      captureBtn.disabled = false;
    }
  });

  detectFacesBtn.addEventListener('click', async () => {
    if (!currentInput) return;

    detectFacesBtn.disabled = true;
    countsEl.textContent = 'RUNNING FACE DETECTOR...';

    const tStart = performance.now();
    try {
      const response = await faceDetector.detectFaces(currentInput, previewImg);
      const faceTimeMs = Math.round(performance.now() - tStart);

      if (response.success) {
        countsEl.textContent = `Faces: ${response.detections.length}`;
        tFaceEl.textContent = `${faceTimeMs} ms`;
        tTotalEl.textContent = `${lastCaptureTimeMs + faceTimeMs} ms`;
        renderDetections(response.detections, 'FACE');
      } else {
        errorBox.textContent = response.error || 'Face detection failed.';
        errorBox.style.display = 'block';
      }
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      detectFacesBtn.disabled = false;
    }
  });

  runOcrBtn.addEventListener('click', async () => {
    if (!currentInput) return;

    runOcrBtn.disabled = true;
    countsEl.textContent = 'RUNNING LOCAL OCR...';

    const tOcrStart = performance.now();
    try {
      if (!isOcrInitialized) {
        const tInitStart = performance.now();
        await ocrEngine.init();
        const initTimeMs = Math.round(performance.now() - tInitStart);
        isOcrInitialized = true;
        tOcrInitEl.textContent = `${initTimeMs} ms (Cold Load)`;
      } else {
        tOcrInitEl.textContent = `0 ms (Warm Cache)`;
      }

      const response = await ocrEngine.recognizeText(currentInput, previewImg);
      const totalTimeMs = Math.round(performance.now() - tOcrStart);

      if (response.success) {
        countsEl.textContent = `Text Regions: ${response.detections.length}`;
        tOcrInferenceEl.textContent = `${response.latencyMs} ms`;
        tTotalEl.textContent = `${totalTimeMs} ms`;
        renderDetections(response.detections, 'OCR_TEXT');
      } else {
        errorBox.textContent = response.error || 'Local OCR failed.';
        errorBox.style.display = 'block';
      }
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      runOcrBtn.disabled = false;
    }
  });

  detectPiiBtn.addEventListener('click', async () => {
    if (!currentInput) return;

    detectPiiBtn.disabled = true;
    countsEl.textContent = 'SCANNING PII CANDIDATES...';

    const tPiiStart = performance.now();
    try {
      if (!isOcrInitialized) {
        await ocrEngine.init();
        isOcrInitialized = true;
      }
      const ocrResp = await ocrEngine.recognizeText(currentInput, previewImg);
      const piiCandidates = piiDetector.detectPiiFromOcr(ocrResp.words);
      const totalTimeMs = Math.round(performance.now() - tPiiStart);

      countsEl.textContent = `PII Candidates: ${piiCandidates.length}`;
      tPiiEl.textContent = `${totalTimeMs} ms`;
      tTotalEl.textContent = `${totalTimeMs} ms`;
      renderDetections(piiCandidates, 'PII_CANDIDATE');
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      detectPiiBtn.disabled = false;
    }
  });

  detectVisionBtn.addEventListener('click', async () => {
    if (!currentInput) return;

    detectVisionBtn.disabled = true;
    countsEl.textContent = 'RUNNING VISUAL OBJECT DETECTOR (M6)...';

    const tStart = performance.now();
    try {
      const response = await visualDetector.detectVisualObjects(currentInput, previewImg);
      const visionTimeMs = Math.round(performance.now() - tStart);

      countsEl.textContent = `Visual Objects: ${response.detections.length} (${response.capabilityStatus})`;
      tVisionEl.textContent = `${visionTimeMs} ms`;
      tTotalEl.textContent = `${lastCaptureTimeMs + visionTimeMs} ms`;
      renderDetections(response.detections, 'VISUAL_REGION');
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      detectVisionBtn.disabled = false;
    }
  });

  // M5/M6 Unified Perception Result Handler
  runUnifiedBtn.addEventListener('click', async () => {
    if (!currentInput) return;

    runUnifiedBtn.disabled = true;
    countsEl.textContent = 'EXECUTING UNIFIED PERCEPTION (M6)...';

    try {
      const unifiedResult = await pipeline.runLocalPerception(currentInput, previewImg);

      countsEl.textContent = `Faces: ${unifiedResult.counts.faces} | OCR: ${unifiedResult.counts.ocrRegions} | PII: ${unifiedResult.counts.piiCandidates} | Visual: ${unifiedResult.counts.visualObjects || 0} | Total: ${unifiedResult.counts.total}`;
      countsEl.className = 'status-val status-success';

      handoffStatusEl.textContent = unifiedResult.status === 'SUCCESS' ? 'READY FOR PERSON 1' : 'PARTIAL HANDOFF TO PERSON 1';
      handoffStatusEl.className = unifiedResult.status === 'SUCCESS' ? 'status-val status-success' : 'status-val status-warning';

      // Update Subsystem Badges
      subFaceEl.textContent = `M2 Face: ${unifiedResult.subsystems.face.status}`;
      subFaceEl.className = `subsystem-badge status-${unifiedResult.subsystems.face.status === 'SUCCESS' ? 'success' : 'error'}`;

      subOcrEl.textContent = `M3 OCR: ${unifiedResult.subsystems.ocr.status}`;
      subOcrEl.className = `subsystem-badge status-${unifiedResult.subsystems.ocr.status === 'SUCCESS' ? 'success' : 'error'}`;

      subPiiEl.textContent = `M4 PII: ${unifiedResult.subsystems.pii.status}`;
      subPiiEl.className = `subsystem-badge status-${unifiedResult.subsystems.pii.status === 'SUCCESS' ? 'success' : 'error'}`;

      subVisionEl.textContent = `M6 Vision: ${unifiedResult.subsystems.vision?.status || 'SUCCESS'}`;
      subVisionEl.className = `subsystem-badge status-${unifiedResult.subsystems.vision?.status === 'FAILED' ? 'error' : 'success'}`;

      subFusionEl.textContent = `M5 Fusion: SUCCESS`;
      subFusionEl.className = `subsystem-badge status-success`;

      // Update Timing Panel
      tCaptureEl.textContent = `${lastCaptureTimeMs} ms`;
      tFaceEl.textContent = `${unifiedResult.timing.faceMs} ms`;
      tVisionEl.textContent = `${unifiedResult.timing.visionMs || 0} ms`;
      tOcrInitEl.textContent = `${unifiedResult.timing.ocrInitMs} ms (${unifiedResult.timing.ocrInitMs > 0 ? 'Cold' : 'Warm'})`;
      tOcrInferenceEl.textContent = `${unifiedResult.timing.ocrInferenceMs} ms`;
      tNormalizerEl.textContent = `${unifiedResult.timing.normalizationMs} ms`;
      tPiiEl.textContent = `${unifiedResult.timing.piiMs} ms`;
      tFusionEl.textContent = `${unifiedResult.timing.fusionMs} ms`;
      tTotalEl.textContent = `${lastCaptureTimeMs + unifiedResult.timing.totalMs} ms`;
      timingPanel.style.display = 'block';

      // Render Fused Detections
      renderDetections(unifiedResult.detections, 'UNIFIED');
    } catch (err) {
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      runUnifiedBtn.disabled = false;
    }
  });

  function clearOverlay() {
    bboxOverlay.width = previewImg.clientWidth;
    bboxOverlay.height = previewImg.clientHeight;
    const ctx = bboxOverlay.getContext('2d');
    ctx?.clearRect(0, 0, bboxOverlay.width, bboxOverlay.height);
  }

  function renderDetections(detections: DetectionResult[], mode: 'FACE' | 'OCR_TEXT' | 'PII_CANDIDATE' | 'VISUAL_REGION' | 'UNIFIED') {
    if (!currentInput) return;

    bboxOverlay.width = previewImg.naturalWidth || previewImg.clientWidth;
    bboxOverlay.height = previewImg.naturalHeight || previewImg.clientHeight;

    const ctx = bboxOverlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, bboxOverlay.width, bboxOverlay.height);
    detectionListEl.innerHTML = '';

    if (detections.length === 0) {
      detectionListEl.innerHTML = `<div class="detection-item">No detections in current frame.</div>`;
      detectionListEl.style.display = 'block';
      return;
    }

    detections.forEach((det, idx) => {
      const { x, y, width, height } = det.bbox;

      let color = '#f9e2af';
      if (det.type === 'OCR_TEXT') color = '#74c7ec';
      if (det.type === 'PII_CANDIDATE') color = '#f5c2e7';
      if (det.type === 'VISUAL_REGION') color = '#fab387';

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, Math.round(bboxOverlay.width / 400));
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = color;
      const fontSize = Math.max(12, Math.round(bboxOverlay.width / 65));
      ctx.font = `bold ${fontSize}px sans-serif`;

      let labelText = `FACE #${idx + 1} (${Math.round(det.confidence * 100)}%)`;
      if (det.type === 'OCR_TEXT') {
        labelText = `TEXT: "${det.metadata?.text || 'Region'}" (${Math.round(det.confidence * 100)}%)`;
      } else if (det.type === 'PII_CANDIDATE') {
        const meta = det.metadata as PiiDetectionMetadata;
        const evidenceStr = meta.evidence ? ` [${meta.evidence.join(', ')}]` : '';
        labelText = `PII: ${meta.category} (${Math.round(det.confidence * 100)}%)${evidenceStr}`;
      } else if (det.type === 'VISUAL_REGION') {
        labelText = `VISUAL: ${det.metadata?.category || 'OBJECT'} (${Math.round(det.confidence * 100)}%)`;
      }

      const textWidth = ctx.measureText(labelText).width;
      ctx.fillRect(x, Math.max(0, y - fontSize - 4), textWidth + 8, fontSize + 4);

      ctx.fillStyle = '#11111b';
      ctx.fillText(labelText, x + 4, Math.max(fontSize, y - 4));

      const itemEl = document.createElement('div');
      itemEl.className = `detection-item ${det.type === 'FACE' ? 'face-item' : det.type === 'OCR_TEXT' ? 'ocr-item' : det.type === 'PII_CANDIDATE' ? 'pii-item' : 'vision-item'}`;
      if (det.type === 'PII_CANDIDATE') {
        const meta = det.metadata as PiiDetectionMetadata;
        itemEl.textContent = `[${det.id}] PII (${meta.category}): "${meta.text}" | Conf: ${det.confidence} | BBox: {x:${x},y:${y},w:${width},h:${height}}`;
      } else {
        itemEl.textContent = `[${det.id}] ${det.type}: "${det.metadata?.text || det.metadata?.category || 'FACE'}" | Conf: ${det.confidence} | BBox: {x:${x},y:${y},w:${width},h:${height}}`;
      }
      detectionListEl.appendChild(itemEl);
    });

    detectionListEl.style.display = 'block';
  }
});
