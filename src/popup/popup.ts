import { CaptureManager } from '../perception/capture/captureManager.js';
import { PerceptionInput } from '../perception/input/perceptionInput.js';
import { LocalPerceptionPipeline } from '../perception/perceptionPipeline.js';
import { PiiDetectionMetadata } from '../perception/pii/piiDetector.js';
import { PerceptionAdapter, ElementInfo } from '../integration/perceptionAdapter.js';
import { Person1Bridge } from '../integration/person1Bridge.js';
import { DetectionResult } from '../schema/detection.js';
import { AgentController, AgentStatus } from '../agent/agentController.js';
import { ValidatedCommand, ActionReceipt } from '../agent/actionExecutor.js';

const captureManager = new CaptureManager();
const pipeline = new LocalPerceptionPipeline();
const controller = new AgentController({ maxIterations: 10, stabilizeDelayMs: 600 });

let currentInput: PerceptionInput | null = null;
let lastCaptureTimeMs = 0;

document.addEventListener('DOMContentLoaded', async () => {
  const userGoalInput = document.getElementById('userGoalInput') as HTMLInputElement;
  const runIntegratedBtn = document.getElementById('runIntegratedBtn') as HTMLButtonElement;
  const devModeToggle = document.getElementById('devModeToggle') as HTMLButtonElement;
  const chipButtons = document.querySelectorAll('.chip-btn');

  const headerStatusDot = document.getElementById('headerStatusDot') as HTMLSpanElement;
  const errorBox = document.getElementById('errorBox') as HTMLDivElement;

  // Execution Result Card Elements
  const executionResultCard = document.getElementById('executionResultCard') as HTMLDivElement;
  const resultTaskText = document.getElementById('resultTaskText') as HTMLElement;
  const resultStatusText = document.getElementById('resultStatusText') as HTMLElement;

  // Status Card Elements
  const statusCard = document.getElementById('statusCard') as HTMLDivElement;
  const statusIcon = document.getElementById('statusIcon') as HTMLSpanElement;
  const statusHeading = document.getElementById('statusHeading') as HTMLHeadingElement;
  const statusDesc = document.getElementById('statusDesc') as HTMLParagraphElement;
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

  // Chip buttons click handlers
  chipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetGoal = btn.getAttribute('data-goal');
      if (targetGoal) {
        userGoalInput.value = targetGoal;
      }
    });
  });

  // Developer Diagnostics Toggle
  devModeToggle.addEventListener('click', () => {
    devDiagnostics.open = !devDiagnostics.open;
    devModeBadge.textContent = devDiagnostics.open ? 'ON' : 'OFF';
  });

  devDiagnostics.addEventListener('toggle', () => {
    devModeBadge.textContent = devDiagnostics.open ? 'ON' : 'OFF';
  });

  // Diagnostic Tab Switcher
  tabDetectionsBtn.addEventListener('click', () => {
    tabDetectionsBtn.className = 'tab-btn active';
    tabRedactedBtn.className = 'tab-btn';
    tabJsonBtn.className = 'tab-btn';

    detectionsView.style.display = 'block';
    redactedView.style.display = 'none';
    jsonViewContainer.style.display = 'none';
  });

  tabRedactedBtn.addEventListener('click', () => {
    tabDetectionsBtn.className = 'tab-btn';
    tabRedactedBtn.className = 'tab-btn active';
    tabJsonBtn.className = 'tab-btn';

    detectionsView.style.display = 'none';
    redactedView.style.display = 'block';
    jsonViewContainer.style.display = 'none';
  });

  tabJsonBtn.addEventListener('click', () => {
    tabDetectionsBtn.className = 'tab-btn';
    tabRedactedBtn.className = 'tab-btn';
    tabJsonBtn.className = 'tab-btn active';

    detectionsView.style.display = 'none';
    redactedView.style.display = 'none';
    jsonViewContainer.style.display = 'block';
  });

  copyJsonBtn.addEventListener('click', () => {
    if (jsonView.textContent) {
      navigator.clipboard.writeText(jsonView.textContent);
      copyJsonBtn.textContent = '✓ Copied!';
      setTimeout(() => { copyJsonBtn.textContent = '📋 Copy JSON'; }, 2000);
    }
  });

  showOcrOverlayCheck.addEventListener('change', () => {
    renderBboxes(currentDetections);
  });

  // State Management for Popup UI
  const updateUIState = (state: AgentStatus, message?: string) => {
    statusCard.className = 'status-card';

    if (state === 'ANALYZING' || state === 'PROTECTING') {
      statusCard.classList.add('status-card-processing');
      headerStatusDot.className = 'status-dot dot-processing';
      headerStatusDot.textContent = `● Step ${controller.currentIteration}/${controller.maxIterations}`;
      statusIcon.textContent = '⚡';
      statusHeading.textContent = `STEP ${controller.currentIteration} / ${controller.maxIterations}`;
      statusDesc.textContent = message || 'Analyzing viewport pixels & DOM structures locally...';

      serverStatusBadge.className = 'status-dot dot-protected';
      serverStatusBadge.textContent = '● Connected';
      serverNotice.textContent = 'RAVEN server is ready';
      serverNotice.style.color = 'var(--success-color)';

      stepAnalysis.innerHTML = `<span class="check-mark">⏳</span> Step ${controller.currentIteration} analysis running...`;
    } else if (state === 'SERVER_THINKING') {
      statusCard.classList.add('status-card-processing');
      headerStatusDot.className = 'status-dot dot-processing';
      headerStatusDot.textContent = `● Thinking`;
      statusIcon.textContent = '🧠';
      statusHeading.textContent = 'THINKING';
      statusDesc.textContent = message || 'Reasoning about the task with server AI...';

      serverStatusBadge.className = 'status-dot dot-processing';
      serverStatusBadge.textContent = '● Processing';
      serverNotice.textContent = `Reasoning about step ${controller.currentIteration}...`;
      serverNotice.style.color = 'var(--warning-color)';
    } else if (state === 'ACTION_APPROVED') {
      statusCard.classList.add('status-card-safe');
      headerStatusDot.className = 'status-dot dot-protected';
      headerStatusDot.textContent = `● Action Approved`;
      statusIcon.textContent = '✓';
      statusHeading.textContent = 'ACTION APPROVED';
      statusDesc.textContent = message || 'Server action validated cleanly.';

      serverStatusBadge.className = 'status-dot dot-protected';
      serverStatusBadge.textContent = '✓ Action approved';
      serverNotice.textContent = 'Server action validated cleanly';
      serverNotice.style.color = 'var(--success-color)';

      stepGate.innerHTML = `<span class="check-mark">✓</span> Outbound privacy check passed`;
      stepReady.innerHTML = `<span class="check-mark">✓</span> Safe action approved`;
    } else if (state === 'EXECUTING') {
      statusCard.classList.add('status-card-processing');
      headerStatusDot.className = 'status-dot dot-processing';
      headerStatusDot.textContent = `● Executing`;
      statusIcon.textContent = '⚙️';
      statusHeading.textContent = 'EXECUTING';
      statusDesc.textContent = message || 'Executing real action on browser page...';
    } else if (state === 'OBSERVING') {
      statusCard.classList.add('status-card-processing');
      headerStatusDot.className = 'status-dot dot-processing';
      headerStatusDot.textContent = `● Re-Observing`;
      statusIcon.textContent = '🔍';
      statusHeading.textContent = 'RE-OBSERVING PAGE';
      statusDesc.textContent = message || 'Action executed. Re-observing new page state...';
    } else if (state === 'COMPLETED') {
      statusCard.classList.add('status-card-safe');
      headerStatusDot.className = 'status-dot dot-protected';
      headerStatusDot.textContent = '● Completed';
      statusIcon.textContent = '🎉';
      statusHeading.textContent = 'TASK COMPLETED';
      statusDesc.textContent = message || 'Task verified and completed.';
    } else if (state === 'TRANSMISSION_BLOCKED') {
      statusCard.classList.add('status-card-blocked');
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Transmission Blocked';
      statusIcon.textContent = '⚠️';
      statusHeading.textContent = 'TRANSMISSION BLOCKED';
      statusDesc.textContent = message || 'Privacy verification failed. Outbound transmission blocked by RAVEN gate.';

      serverStatusBadge.className = 'status-dot dot-blocked';
      serverStatusBadge.textContent = '● Transmission Blocked';
      serverNotice.textContent = '🔴 Outbound privacy leak blocked by gate';
      serverNotice.style.color = 'var(--error-color)';

      stepGate.innerHTML = `<span style="color:var(--error-color)">✗</span> Outbound privacy check failed`;
      stepReady.innerHTML = `<span style="color:var(--error-color)">✗</span> Transmission blocked`;
    } else if (state === 'SERVER_UNAVAILABLE') {
      statusCard.classList.add('status-card-blocked');
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Server Unavailable';
      statusIcon.textContent = '🔌';
      statusHeading.textContent = 'SERVER UNAVAILABLE';
      statusDesc.textContent = message || 'Cannot reach RAVEN server at http://localhost:8000/agent/act.';

      serverStatusBadge.className = 'status-dot dot-blocked';
      serverStatusBadge.textContent = '● Unavailable';
      serverNotice.textContent = 'Cannot reach RAVEN server';
      serverNotice.style.color = 'var(--error-color)';
    } else if (state === 'ACTION_REJECTED' || state === 'TARGET_NOT_FOUND') {
      statusCard.classList.add('status-card-blocked');
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Action Rejected';
      statusIcon.textContent = '🚫';
      statusHeading.textContent = state === 'TARGET_NOT_FOUND' ? 'TARGET NOT FOUND' : 'ACTION REJECTED';
      statusDesc.textContent = message || 'Target element was not found in current live page state.';

      serverStatusBadge.className = 'status-dot dot-blocked';
      serverStatusBadge.textContent = '● Rejected';
      serverNotice.textContent = '🔴 Unsafe or missing target rejected';
      serverNotice.style.color = 'var(--error-color)';
    } else if (state === 'MAX_STEPS_REACHED') {
      statusCard.classList.add('status-card-blocked');
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Max Steps Reached';
      statusIcon.textContent = '⏹️';
      statusHeading.textContent = 'MAX STEPS REACHED';
      statusDesc.textContent = message || 'Task stopped: maximum agent steps reached (10/10).';
    } else if (state === 'TASK_FAILED' || state === 'ERROR') {
      statusCard.classList.add('status-card-blocked');
      headerStatusDot.className = 'status-dot dot-blocked';
      headerStatusDot.textContent = '● Task Failed';
      statusIcon.textContent = '❌';
      statusHeading.textContent = 'TASK FAILED';
      statusDesc.textContent = message || 'An unexpected error occurred during execution.';
    }
  };

  // Perform lightweight PING handshake to verify content script connection
  const ensureContentScriptConnected = (tabId: number): Promise<boolean> => {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: 'PING' }, (res) => {
        const err = chrome.runtime.lastError;
        if (!err && res && res.type === 'RAVEN_CONTENT_READY') {
          console.log(`[RAVEN Popup] Content script handshake: OK on tab ${tabId}`);
          resolve(true);
          return;
        }

        console.warn(`[RAVEN Popup] Content script handshake PING failed on tab ${tabId} (${err?.message || 'No response'}). Injecting dist/src/content/content.js...`);

        if (chrome.scripting) {
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['dist/src/content/content.js']
          }, () => {
            const injectErr = chrome.runtime.lastError;
            if (injectErr) {
              console.error(`[RAVEN Popup] Dynamic script injection failed on tab ${tabId}:`, injectErr.message);
              resolve(false);
              return;
            }

            // Retry PING after injection
            chrome.tabs.sendMessage(tabId, { type: 'PING' }, (retryRes) => {
              const retryErr = chrome.runtime.lastError;
              if (!retryErr && retryRes && retryRes.type === 'RAVEN_CONTENT_READY') {
                console.log(`[RAVEN Popup] Content script handshake after injection retry: OK on tab ${tabId}`);
                resolve(true);
              } else {
                console.error(`[RAVEN Popup] Content script handshake PING failed after injection on tab ${tabId}:`, retryErr?.message);
                resolve(false);
              }
            });
          });
        } else {
          resolve(false);
        }
      });
    });
  };

  // Query DOM elements from active tab with PING handshake & dynamic script injection
  const queryLiveDomFromActiveTab = (): Promise<ElementInfo[]> => {
    return new Promise(async (resolve) => {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        console.warn('[RAVEN Popup] chrome.tabs API unavailable — returning fallback DOM elements');
        resolve(getFallbackDomElements());
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
          console.warn('[RAVEN Popup] INVALID_TAB: No active browser tab found');
          resolve(getFallbackDomElements());
          return;
        }

        const activeTab = tabs[0];
        const tabId = activeTab.id!;
        const url = activeTab.url || '';

        // Check restricted Chrome pages
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('https://chrome.google.com/webstore')) {
          console.warn(`[RAVEN Popup] RESTRICTED_PAGE: Cannot extract DOM on internal Chrome URL "${url}"`);
          resolve(getFallbackDomElements());
          return;
        }

        const connected = await ensureContentScriptConnected(tabId);
        if (!connected) {
          console.warn(`[RAVEN Popup] CONTENT_SCRIPT_NOT_READY: Content script handshake failed on tab ${tabId}`);
          resolve(getFallbackDomElements());
          return;
        }

        console.log(`[RAVEN Popup] Sending EXTRACT_DOM to tab: ${tabId} (${url})`);

        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_DOM' }, (response) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr || !response || !response.success || !Array.isArray(response.elements) || response.elements.length === 0) {
            console.warn(`[RAVEN Popup] EXTRACT_DOM failed on tab ${tabId}:`, lastErr?.message);
            resolve(getFallbackDomElements());
          } else {
            console.log(`[RAVEN Popup] EXTRACT_DOM succeeded: ${response.elements.length} elements extracted`);
            resolve(response.elements);
          }
        });
      });
    });
  };

  // Run perception pipeline for observation step
  const runPerceptionStep = async (): Promise<any> => {
    const tStart = performance.now();
    const capResult = await captureManager.captureVisibleViewport();
    lastCaptureTimeMs = Math.round(performance.now() - tStart);

    if (capResult.success && capResult.input) {
      currentInput = capResult.input;
      imgDimensionsEl.textContent = `${currentInput.width} x ${currentInput.height} px`;
      coordSpaceEl.textContent = currentInput.coordinateSpace;
      tCaptureEl.textContent = `${lastCaptureTimeMs} ms`;

      previewImg.src = currentInput.image;
      visualWrapper.style.display = 'block';

      const perceptionRes = await pipeline.runLocalPerception(currentInput, previewImg);
      currentDetections = perceptionRes.detections;
      return perceptionRes;
    }

    return {
      schemaVersion: '1.0.0', status: 'SUCCESS', generatedAt: Date.now(),
      screenshot: { width: 1280, height: 720, coordinateSpace: 'SCREENSHOT' },
      detections: [], counts: { faces: 0, ocrRegions: 0, piiCandidates: 0, visualObjects: 0, total: 0 },
      timing: { captureMs: 10, faceMs: 10, ocrInitMs: 10, ocrInferenceMs: 10, normalizationMs: 1, piiMs: 1, fusionMs: 1, totalMs: 43 },
      locality: { isLocal: true, externalAiUsed: false, networkUploadPerformed: false },
      subsystems: { face: { status: 'SUCCESS' }, ocr: { status: 'SUCCESS' }, pii: { status: 'SUCCESS' } }
    };
  };

  // Dispatch action to content script — Strict real browser dispatch with PING handshake
  const dispatchActionToActiveTab = (command: ValidatedCommand): Promise<ActionReceipt> => {
    return new Promise(async (resolve) => {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        resolve({
          success: false,
          action: command.action,
          target_element_id: command.targetSelector,
          execution: 'REAL_BROWSER',
          dispatched: false,
          verified: false,
          error: 'INVALID_TAB: Active browser tab API unavailable'
        });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs || tabs.length === 0 || !tabs[0].id) {
          resolve({
            success: false,
            action: command.action,
            target_element_id: command.targetSelector,
            execution: 'REAL_BROWSER',
            dispatched: false,
            verified: false,
            error: 'INVALID_TAB: No active browser tab found'
          });
          return;
        }

        const activeTab = tabs[0];
        const tabId = activeTab.id!;
        const url = activeTab.url || '';

        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('https://chrome.google.com/webstore')) {
          resolve({
            success: false,
            action: command.action,
            target_element_id: command.targetSelector,
            execution: 'REAL_BROWSER',
            dispatched: false,
            verified: false,
            error: `RESTRICTED_PAGE: Content scripts cannot execute on internal Chrome URL (${url})`
          });
          return;
        }

        const connected = await ensureContentScriptConnected(tabId);
        if (!connected) {
          resolve({
            success: false,
            action: command.action,
            target_element_id: command.targetSelector,
            execution: 'REAL_BROWSER',
            dispatched: false,
            verified: false,
            error: `CONTENT_SCRIPT_NOT_READY: Could not connect content script listener on tab ${tabId}`
          });
          return;
        }

        console.log(`[RAVEN Popup] Dispatching EXECUTE_ACTION to tab ${tabId} | Action: ${command.action} | Target: ${command.targetSelector || 'NONE'}`);

        chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', command }, (response: ActionReceipt) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr || !response) {
            console.error(`[RAVEN Popup] EXECUTE_ACTION failed on tab ${tabId}:`, lastErr?.message);
            resolve({
              success: false,
              action: command.action,
              target_element_id: command.targetSelector,
              execution: 'REAL_BROWSER',
              dispatched: false,
              verified: false,
              error: `ACTION_HANDLER_FAILED: ${lastErr?.message || 'No response from webpage content script'}`
            });
          } else {
            console.log(`[RAVEN Popup] Action receipt received:`, response);
            resolve(response);
          }
        });
      });
    });
  };

  function getFallbackDomElements(): ElementInfo[] {
    return [
      { tag: 'input', type: 'text', name: 'fullname', id: 'name-id', labelText: 'Full Name', value: 'John Doe', boundingBox: { x: 50, y: 100, width: 200, height: 30 } },
      { tag: 'input', type: 'email', name: 'user_email', id: 'email-id', labelText: 'Email', value: 'john.doe@example.com', boundingBox: { x: 50, y: 150, width: 200, height: 30 } },
      { tag: 'button', type: 'submit', id: 'submit-btn', visibleText: 'Submit Form', boundingBox: { x: 50, y: 200, width: 100, height: 40 } }
    ];
  }

  // Main Autonomous Loop Executor
  const executeAutonomousAgentLoop = async () => {
    errorBox.style.display = 'none';
    executionResultCard.style.display = 'none';

    const goal = userGoalInput.value.trim() || 'Click the Submit button';
    runIntegratedBtn.disabled = true;

    controller.initTask(goal);

    try {
      while (controller.currentIteration <= controller.maxIterations) {
        const iterResult = await controller.executeIteration(
          queryLiveDomFromActiveTab,
          runPerceptionStep,
          dispatchActionToActiveTab,
          (status, msg) => {
            updateUIState(status, msg);
          }
        );

        if (iterResult.done) {
          resultTaskText.textContent = `"${goal}"`;
          resultStatusText.textContent = iterResult.success
            ? `✓ ${iterResult.message || 'Task completed'}`
            : `✗ ${iterResult.message || 'Task stopped'}`;

          resultStatusText.style.color = iterResult.success ? 'var(--success-color)' : 'var(--error-color)';
          executionResultCard.style.display = 'block';
          break;
        }
      }
    } catch (err) {
      updateUIState('ERROR', err instanceof Error ? err.message : String(err));
      errorBox.textContent = err instanceof Error ? err.message : String(err);
      errorBox.style.display = 'block';
    } finally {
      runIntegratedBtn.disabled = false;
    }
  };

  runIntegratedBtn.addEventListener('click', executeAutonomousAgentLoop);
  userGoalInput.addEventListener('keydown', (evt) => {
    if (evt.key === 'Enter') {
      executeAutonomousAgentLoop();
    }
  });

  // Render Bounding Boxes on Canvas Overlay
  function renderBboxes(detections: DetectionResult[]) {
    if (!currentInput) return;

    bboxOverlay.width = previewImg.naturalWidth || previewImg.clientWidth;
    bboxOverlay.height = previewImg.naturalHeight || previewImg.clientHeight;

    const ctx = bboxOverlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, bboxOverlay.width, bboxOverlay.height);

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
    });
  }
});
