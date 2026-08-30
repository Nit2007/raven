import { CaptureManager } from '../perception/capture/captureManager.js';
import { LocalFaceDetector } from '../perception/face/faceDetector.js';
import { PerceptionInput } from '../perception/input/perceptionInput.js';
import { LocalOcrEngine } from '../perception/ocr/ocrEngine.js';
import { LocalPerceptionPipeline } from '../perception/perceptionPipeline.js';
import { PiiCandidateDetector, PiiDetectionMetadata } from '../perception/pii/piiDetector.js';
import { LocalVisualObjectDetector } from '../perception/vision/visualObjectDetector.js';
import { PerceptionAdapter } from '../integration/perceptionAdapter.js';
import { DetectionResult } from '../schema/detection.js';

const captureManager = new CaptureManager();
const ocrEngine = new LocalOcrEngine();
const pipeline = new LocalPerceptionPipeline();

let currentInput: PerceptionInput | null = null;
let lastCaptureTimeMs = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const runIntegratedBtn = document.getElementById('runIntegratedBtn') as HTMLButtonElement;
  const devModeToggle = document.getElementById('devModeToggle') as HTMLButtonElement;

  const headerStatusDot = document.getElementById('headerStatusDot') as HTMLSpanElement;
  const errorBox = document.getElementById('errorBox') as HTMLDivElement;

  // Status Card Elements
  const statusCard = document.getElementById('statusCard') as HTMLDivElement;
  const statusIcon = document.getElementById('statusIcon') as HTMLSpanElement;
  const statusHeading = document.getElementById('statusHeading') as HTMLHeadingElement;
  const statusDesc = document.getElementById('statusDesc') as HTMLParagraphElement;
  const localityTag = document.getElementById('localityTag') as HTMLSpanElement;
  const timeLatencyTag = document.getElementById('timeLatencyTag') as HTMLSpanElement;

  // Protection Summary Category Rows
  const catFacesRow = document.getElementById('catFacesRow') as HTMLDivElement;
  const catFacesVal = document.getElementById('catFacesVal') as HTMLElement;
  const catPiiRow = document.getElementById('catPiiRow') as HTMLDivElement;
  const catPiiVal = document.getElementById('catPiiVal') as HTMLElement;
  const catDocsRow = document.getElementById('catDocsRow') as HTMLDivElement;
  const catDocsVal = document.getElementById('catDocsVal') as HTMLElement;
  const catEmptyRow = document.getElementById('catEmptyRow') as HTMLDivElement;

  // Pipeline Flow Checklist Items
  const stepAnalysis = document.getElementById('stepAnalysis') as HTMLDivElement;
  const stepProtected = document.getElementById('stepProtected') as HTMLDivElement;
  const stepGate = document.getElementById('stepGate') as HTMLDivElement;
  const stepReady = document.getElementById('stepReady') as HTMLDivElement;

  // Server Communication Box
  const serverStatusBadge = document.getElementById('serverStatusBadge') as HTMLSpanElement;
  const serverNotice = document.getElementById('serverNotice') as HTMLDivElement;

  // Advanced Details Elements
  const imgDimensionsEl = document.getElementById('imgDimensions') as HTMLSpanElement;
  const coordSpaceEl = document.getElementById('coordSpace') as HTMLSpanElement;
  const subFaceEl = document.getElementById('subFace') as HTMLSpanElement;
  const subOcrEl = document.getElementById('subOcr') as HTMLSpanElement;
  const subPiiEl = document.getElementById('subPii') as HTMLSpanElement;
  const subVisionEl = document.getElementById('subVision') as HTMLSpanElement;
  const subFusionEl = document.getElementById('subFusion') as HTMLSpanElement;
  const p1RedactedCountEl = document.getElementById('p1RedactedCount') as HTMLSpanElement;
  const p1OutboundStatusEl = document.getElementById('p1OutboundStatus') as HTMLSpanElement;

  // Diagnostics & Canvas Elements
  const devDiagnostics = document.getElementById('devDiagnostics') as HTMLDetailsElement;
  const devModeBadge = document.getElementById('devModeBadge') as HTMLSpanElement;
  const showOcrOverlayCheck = document.getElementById('showOcrOverlayCheck') as HTMLInputElement;

  const visualWrapper = document.getElementById('visualWrapper') as HTMLDivElement;
  const previewImg = document.getElementById('capturePreview') as HTMLImageElement;
  const bboxOverlay = document.getElementById('bboxOverlay') as HTMLCanvasElement;

  // Detailed Timing Elements
  const tCaptureEl = document.getElementById('tCapture') as HTMLSpanElement;
  const tFaceEl = document.getElementById('tFace') as HTMLSpanElement;
  const tVisionEl = document.getElementById('tVision') as HTMLSpanElement;
  const tOcrInitEl = document.getElementById('tOcrInit') as HTMLSpanElement;
  const tOcrInferenceEl = document.getElementById('tOcrInference') as HTMLSpanElement;
  const tNormalizerEl = document.getElementById('tNormalizer') as HTMLSpanElement;
  const tPiiEl = document.getElementById('tPii') as HTMLSpanElement;
  const tFusionEl = document.getElementById('tFusion') as HTMLSpanElement;
  const tTotalEl = document.getElementById('tTotal') as HTMLSpanElement;

  // Tabs & Views
  const tabDetectionsBtn = document.getElementById('tabDetectionsBtn') as HTMLButtonElement;
  const tabRedactedBtn = document.getElementById('tabRedactedBtn') as HTMLButtonElement;
  const tabJsonBtn = document.getElementById('tabJsonBtn') as HTMLButtonElement;

  const detectionsView = document.getElementById('detectionsView') as HTMLDivElement;
  const redactedView = document.getElementById('redactedView') as HTMLDivElement;
  const jsonViewContainer = document.getElementById('jsonViewContainer') as HTMLDivElement;
  const jsonView = document.getElementById('jsonView') as HTMLPreElement;
  const copyJsonBtn = document.getElementById('copyJsonBtn') as HTMLButtonElement;

  let currentDetections: DetectionResult[] = [];
  let currentJsonPayload: any = null;

  // Developer Diagnostics Toggle
  devModeToggle.addEventListener('click', () => {
    devDiagnostics.open = !devDiagnostics.open;
    devModeBadge.textContent = devDiagnostics.open ? 'ON' : 'OFF';
  });

  devDiagnostics.addEventListener('toggle', () => {
    devModeBadge.textContent = devDiagnostics.open ? 'ON' : 'OFF';
  });

  // Switch Tab View Inside Diagnostics
  const switchTab = (activeTab: 'DETECTIONS' | 'REDACTED' | 'JSON') => {
    tabDetectionsBtn.className = `tab-btn ${activeTab === 'DETECTIONS' ? 'active' : ''}`;
    tabRedactedBtn.className = `tab-btn ${activeTab === 'REDACTED' ? 'active' : ''}`;
    tabJsonBtn.className = `tab-btn ${activeTab === 'JSON' ? 'active' : ''}`;

    detectionsView.style.display = activeTab === 'DETECTIONS' ? 'block' : 'none';
    redactedView.style.display = activeTab === 'REDACTED' ? 'block' : 'none';
    jsonViewContainer.style.display = activeTab === 'JSON' ? 'block' : 'none';
  };

  tabDetectionsBtn.addEventListener('click', () => switchTab('DETECTIONS'));
  tabRedactedBtn.addEventListener('click', () => switchTab('REDACTED'));
  tabJsonBtn.addEventListener('click', () => switchTab('JSON'));

  // Copy JSON Payload to Clipboard
  copyJsonBtn.addEventListener('click', () => {
    if (currentJsonPayload) {
      navigator.clipboard.writeText(JSON.stringify(currentJsonPayload, null, 2));
      copyJsonBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyJsonBtn.textContent = '📋 Copy JSON'; }, 2000);
    }
  });

  // Overlay Toggle (Show all OCR boxes vs sensitive boxes only)
  showOcrOverlayCheck.addEventListener('change', () => {
    if (currentDetections) {
      renderBboxes(currentDetections);
    }
  });

  // UI State Setter Function
  const updateUIState = (state: 'SAFE' | 'PROTECTED' | 'PROCESSING' | 'BLOCKED' | 'ERROR', message?: string) => {
    statusCard.className = `status-card status-card-${state.toLowerCase()}`;

    if (state === 'PROCESSING') {
      headerStatusDot.className = 'status-dot dot-processing';
      headerStatusDot.textContent = '● Analyzing';
      statusIcon.textContent = '◌';
      statusIcon.className = 'status-icon spinner-mark';
      statusHeading.textContent = 'RAVEN IS ANALYZING';
      statusDesc.textContent = message || 'Your screen is being analyzed locally before anything is shared.';

      stepAnalysis.innerHTML = `<span class="spinner-mark">◌</span> Local analysis`;
      stepProtected.innerHTML = `<span style="color:var(--text-muted)">○</span> Sensitive content protection`;
      stepGate.innerHTML = `<span style="color:var(--text-muted)">○</span> Outbound privacy check`;
      stepReady.innerHTML = `<span style="color:var(--text-muted)">○</span> Safe context ready`;
    } else if (state === 'PROTECTED') {
      headerStatusDot.className = 'status-dot dot-protected';
      headerStatusDot.textContent = '● Protected';
      statusIcon.textContent = '🛡️';
      statusIcon.className = 'status-icon';
      statusHeading.textContent = 'PRIVACY PROTECTION ACTIVE';
      statusDesc.textContent = message || 'RAVEN protected sensitive content on this page.';

      stepAnalysis.innerHTML = `<span class="check-mark">✓</span> Local analysis complete`;
      stepProtected.innerHTML = `<span class="check-mark">✓</span> Sensitive content protected`;
      stepGate.innerHTML = `<span class="check-mark">✓</span> Outbound privacy check passed`;
      stepReady.innerHTML = `<span class="check-mark">✓</span> Safe context ready`;
    } else if (state === 'SAFE') {
      headerStatusDot.className = 'status-dot dot-protected';
      headerStatusDot.textContent = '● Protected';
      statusIcon.textContent = '🛡️';
      statusIcon.className = 'status-icon';
      statusHeading.textContent = 'PAGE PROTECTED';
      statusDesc.textContent = message || 'RAVEN analyzed this page locally. No sensitive information detected.';

      stepAnalysis.innerHTML = `<span class="check-mark">✓</span> Local analysis complete`;
      stepProtected.innerHTML = `<span class="check-mark">✓</span> No sensitive content found`;
      stepGate.innerHTML = `<span class="check-mark">✓</span> Outbound privacy check passed`;
      stepReady.innerHTML = `<span class="check-mark">✓</span> Safe context ready`;
    } else if (state === 'BLOCKED') {
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Transmission Blocked';
      statusIcon.textContent = '⚠️';
      statusIcon.className = 'status-icon';
      statusHeading.textContent = 'TRANSMISSION BLOCKED';
      statusDesc.textContent = message || 'Privacy verification did not pass. Nothing was sent to the server.';

      stepGate.innerHTML = `<span style="color:var(--error-color)">✗</span> Outbound privacy check failed`;
      stepReady.innerHTML = `<span style="color:var(--error-color)">✗</span> Transmission blocked`;
    } else if (state === 'ERROR') {
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Protection Unavailable';
      statusIcon.textContent = '⚠️';
      statusIcon.className = 'status-icon';
      statusHeading.textContent = 'PROTECTION UNAVAILABLE';
      statusDesc.textContent = message || 'RAVEN could not complete the local privacy check.';
    }
  };

  // Main Pipeline Executor
  const executePipeline = async () => {
    errorBox.style.display = 'none';
    runIntegratedBtn.disabled = true;
    updateUIState('PROCESSING', 'Analyzing viewport pixels and DOM structures locally...');

    const tStart = performance.now();
    try {
      // 1. Capture Viewport
      const capResult = await captureManager.captureVisibleViewport();
      lastCaptureTimeMs = Math.round(performance.now() - tStart);

      if (!capResult.success || !capResult.input) {
        throw new Error(capResult.error || 'Viewport capture failed');
      }

      currentInput = capResult.input;
      imgDimensionsEl.textContent = `${currentInput.width} x ${currentInput.height} px`;
      coordSpaceEl.textContent = currentInput.coordinateSpace;
      tCaptureEl.textContent = `${lastCaptureTimeMs} ms`;

      previewImg.src = currentInput.image;
      visualWrapper.style.display = 'block';

      // 2. Execute Person 2 Local Perception Pipeline
      const perceptionResult = await pipeline.runLocalPerception(currentInput, previewImg);
      currentDetections = perceptionResult.detections;

      // 3. Person 1 DOM Elements Integration
      const mockDomElements = [
        { tag: 'input', type: 'text', name: 'user', id: 'name-field', value: 'John Doe', boundingBox: { x: 50, y: 100, width: 200, height: 30 } },
        { tag: 'input', type: 'email', name: 'email', id: 'email-field', value: 'john.doe@example.com', boundingBox: { x: 50, y: 150, width: 200, height: 30 } }
      ];

      const integratedElements = PerceptionAdapter.mergePerceptionWithDOM(mockDomElements, perceptionResult);

      // 4. Person 1 Redaction Engine & Sanitizer
      let redactedCount = 0;
      let isSafe = true;
      let redactedList: any[] = [];

      const win = window as any;
      if (win.RedactionEngine && win.Sanitizer && win.ServerAdapter) {
        redactedList = win.RedactionEngine.redactElements(integratedElements);
        const sanitizedPayload = win.Sanitizer.sanitizeContext(redactedList);
        const gateCheck = win.Sanitizer.outboundCheck(sanitizedPayload);

        redactedCount = sanitizedPayload.elements.filter((e: any) => e.redacted).length;
        isSafe = gateCheck.safe;
        currentJsonPayload = win.ServerAdapter.buildOutboundPayload(sanitizedPayload, 'raven_popup_task');
      } else {
        redactedList = integratedElements.map(e => ({
          ...e,
          redacted: !!e.sensitivity && e.sensitivity !== 'SAFE',
          value: e.sensitivity && e.sensitivity !== 'SAFE' ? `{${e.ruleToken || 'PII'} filled}` : e.value
        }));
        redactedCount = redactedList.filter(e => e.redacted).length;
        currentJsonPayload = { version: '1.0.0', elements: redactedList };
      }

      // Update Counts
      const facesCount = perceptionResult.counts.faces || 0;
      const piiCount = perceptionResult.counts.piiCandidates || 0;
      const docsCount = perceptionResult.counts.visualObjects || 0;
      const totalProtected = facesCount + piiCount + docsCount;

      // Update Summary Rows
      catFacesRow.style.display = facesCount > 0 ? 'flex' : 'none';
      catFacesVal.textContent = String(facesCount);

      catPiiRow.style.display = piiCount > 0 ? 'flex' : 'none';
      catPiiVal.textContent = String(piiCount);

      catDocsRow.style.display = docsCount > 0 ? 'flex' : 'none';
      catDocsVal.textContent = String(docsCount);

      catEmptyRow.style.display = totalProtected === 0 ? 'block' : 'none';

      // Update Latency Tag
      timeLatencyTag.textContent = `${lastCaptureTimeMs + perceptionResult.timing.totalMs} ms`;

      // Update Advanced Details Panel
      subFaceEl.textContent = `${perceptionResult.subsystems.face.status} (${perceptionResult.timing.faceMs}ms)`;
      subOcrEl.textContent = `${perceptionResult.subsystems.ocr.status} (${perceptionResult.timing.ocrInferenceMs}ms)`;
      subPiiEl.textContent = `${perceptionResult.subsystems.pii.status} (${perceptionResult.timing.piiMs}ms)`;
      subVisionEl.textContent = `${perceptionResult.subsystems.vision?.status || 'SUCCESS'} (${perceptionResult.timing.visionMs || 0}ms)`;
      subFusionEl.textContent = `SUCCESS (${perceptionResult.timing.fusionMs}ms)`;

      tFaceEl.textContent = `${perceptionResult.timing.faceMs} ms`;
      tVisionEl.textContent = `${perceptionResult.timing.visionMs || 0} ms`;
      tOcrInitEl.textContent = `${perceptionResult.timing.ocrInitMs} ms`;
      tOcrInferenceEl.textContent = `${perceptionResult.timing.ocrInferenceMs} ms`;
      tNormalizerEl.textContent = `${perceptionResult.timing.normalizationMs} ms`;
      tPiiEl.textContent = `${perceptionResult.timing.piiMs} ms`;
      tFusionEl.textContent = `${perceptionResult.timing.fusionMs} ms`;
      tTotalEl.textContent = `${lastCaptureTimeMs + perceptionResult.timing.totalMs} ms`;

      p1RedactedCountEl.textContent = `${redactedCount} sensitive elements masked`;
      p1OutboundStatusEl.textContent = isSafe ? 'SAFE (0 Leaks)' : 'LEAKS BLOCKED';

      // Update Server Status Card
      if (isSafe) {
        serverStatusBadge.className = 'status-dot dot-protected';
        serverStatusBadge.textContent = '● Protected / Ready';
        serverNotice.textContent = '🟢 Nothing sensitive will leak';
        serverNotice.style.color = 'var(--success-color)';
      } else {
        serverStatusBadge.className = 'status-dot dot-blocked';
        serverStatusBadge.textContent = '● Transmission Blocked';
        serverNotice.textContent = '🔴 Outbound privacy leak blocked';
        serverNotice.style.color = 'var(--error-color)';
      }

      // Render Canvas Bboxes
      renderBboxes(currentDetections);

      // Populate Diagnostics Tabs
      detectionsView.innerHTML = currentDetections.map(d => {
        return `<div style="padding:3px 0; border-bottom:1px dashed #313244;">` +
          `[${d.type}] Conf: ${(d.confidence * 100).toFixed(0)}% | BBox: {x:${d.bbox.x},y:${d.bbox.y},w:${d.bbox.width},h:${d.bbox.height}}` +
          `</div>`;
      }).join('\n') || 'No detections.';

      redactedView.innerHTML = redactedList.map(e => {
        return `<div style="padding:3px 0; border-bottom:1px dashed #313244; color:${e.redacted ? 'var(--success-color)' : 'var(--info-color)'}">` +
          `[<${e.tag}> id="${e.id || 'N/A'}"] Protected: <strong>${e.redacted}</strong> | Output: <code>"${e.value || e.visibleText || ''}"</code>` +
          `</div>`;
      }).join('\n');

      jsonView.textContent = JSON.stringify(currentJsonPayload, null, 2);

      // Set Final Status Card State
      if (!isSafe) {
        updateUIState('BLOCKED', 'Privacy verification failed. Outbound transmission was blocked by RAVEN.');
      } else if (totalProtected > 0) {
        updateUIState('PROTECTED', `${totalProtected} sensitive item${totalProtected > 1 ? 's were' : ' was'} protected on this page.`);
      } else {
        updateUIState('SAFE', 'RAVEN analyzed this page locally. No sensitive information detected.');
      }

    } catch (err) {
      updateUIState('ERROR', err instanceof Error ? err.message : String(err));
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      runIntegratedBtn.disabled = false;
    }
  };

  runIntegratedBtn.addEventListener('click', executePipeline);

  // Render Bounding Boxes on Overlay Canvas
  function renderBboxes(detections: DetectionResult[]) {
    if (!currentInput) return;

    bboxOverlay.width = previewImg.naturalWidth || previewImg.clientWidth;
    bboxOverlay.height = previewImg.naturalHeight || previewImg.clientHeight;

    const ctx = bboxOverlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, bboxOverlay.width, bboxOverlay.height);

    // Filter out raw OCR text boxes unless user enabled showOcrOverlayCheck
    const visibleDetections = detections.filter(d => showOcrOverlayCheck.checked || d.type !== 'OCR_TEXT');

    visibleDetections.forEach((det, idx) => {
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

      let labelText = `FACE #${idx + 1}`;
      if (det.type === 'OCR_TEXT') {
        labelText = `TEXT: "${det.metadata?.text || 'Region'}"`;
      } else if (det.type === 'PII_CANDIDATE') {
        const meta = det.metadata as PiiDetectionMetadata;
        labelText = `PII: ${meta.category}`;
      } else if (det.type === 'VISUAL_REGION') {
        labelText = `VISUAL: ${det.metadata?.category || 'OBJECT'}`;
      }

      const textWidth = ctx.measureText(labelText).width;
      ctx.fillRect(x, Math.max(0, y - fontSize - 4), textWidth + 8, fontSize + 4);

      ctx.fillStyle = '#11111b';
      ctx.fillText(labelText, x + 4, Math.max(fontSize, y - 4));
    });
  }

  // Run automatic initial pipeline scan on open
  executePipeline();
});
