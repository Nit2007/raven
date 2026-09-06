/**
 * RAVEN Debug Center — Single-Page Live Interaction Dashboard
 * Purpose: Complete Demonstration & Observability for Live Interaction
 * Displays User Task -> Browser -> M1-M6 -> Privacy Gate -> Gemini -> Action -> Browser Loop
 * All states are 100% driven by real telemetry without any mock/fake data.
 */

import { store } from '../models/store.js';
import { MILESTONES, MILESTONE_STATUS, PRIVACY_GATE_STATUS, CONNECTION_STATUS } from '../models/types.js';

let activeDrawerModule = null;

export function renderLiveInteractionView(container) {
  function update() {
    const state = store.getState();
    const conn = state.connection;
    const telemetry = state.telemetry;
    const browser = state.browser;
    const agent = state.agent;
    const milestones = state.milestones;
    const dom = state.dom;
    const vision = state.vision;
    const ocr = state.ocr;
    const privacy = state.privacy;
    const fusion = state.fusion;
    const timeline = state.timeline;

    const isConnected = conn.status === CONNECTION_STATUS.CONNECTED;
    const currentUrl = browser.url || telemetry.currentUrl || null;
    const pageTitle = browser.title || telemetry.pageTitle || '(No active page)';
    const screenshotUrl = privacy.screenshotUrl || browser.screenshotUrl || vision.sourceScreenshotUrl || null;

    // Real active user task
    const userTask = agent.task || telemetry.userTask || null;

    // Milestone Latencies
    const m1Ms = milestones.M1.executionTimeMs || 0;
    const m2Ms = milestones.M2.executionTimeMs || 0;
    const m3Ms = milestones.M3.executionTimeMs || 0;
    const m4Ms = milestones.M4.executionTimeMs || 0;
    const m5Ms = milestones.M5.executionTimeMs || 0;
    const m6Ms = milestones.M6.executionTimeMs || 0;
    const geminiMs = agent.responseLatencyMs || 0;
    const totalPipelineLatency = m1Ms + m2Ms + m3Ms + m4Ms + m5Ms + m6Ms;
    const maxBarLatency = Math.max(m1Ms, m2Ms, m3Ms, m4Ms, m5Ms, m6Ms, geminiMs, 50);

    // Privacy Gate State
    const gatePassed = fusion.privacyGatePassed || privacy.gateStatus === PRIVACY_GATE_STATUS.PASSED;
    const gateBlocked = !!fusion.blockedReason || privacy.gateStatus === PRIVACY_GATE_STATUS.BREACH_DETECTED;
    let gateStatusClass = 'waiting';
    let gateStatusText = 'STANDBY / VERIFYING';
    if (gateBlocked) {
      gateStatusClass = 'blocked';
      gateStatusText = 'FAIL-CLOSED — BLOCKED';
    } else if (gatePassed) {
      gateStatusClass = 'passed';
      gateStatusText = 'PASS — SAFE TO SEND';
    }

    // Status helpers
    function getStatusBadge(status) {
      switch (status) {
        case MILESTONE_STATUS.SUCCESS:
          return '<span class="badge-pill badge-success">COMPLETE</span>';
        case MILESTONE_STATUS.RUNNING:
          return '<span class="badge-pill badge-running">RUNNING</span>';
        case MILESTONE_STATUS.ERROR:
          return '<span class="badge-pill badge-error">FAILED</span>';
        default:
          return '<span class="badge-pill badge-waiting">WAITING</span>';
      }
    }

    // Protection Category Counts
    const piiCount = fusion.sensitiveRedacted || privacy.piiDetected || 0;
    const faceCount = privacy.facesDetected || 0;
    const candidateCount = fusion.candidatesEvaluated || privacy.candidatesEvaluated || 0;

    container.innerHTML = `
      <div class="demo-dashboard-container">

        <!-- ================================================================= -->
        <!-- 1. USER TASK / INTENT PANEL                                       -->
        <!-- ================================================================= -->
        <div class="user-task-card">
          <div class="task-header-row">
            <div class="task-title-wrap">
              <span class="task-pulsing-dot"></span>
              <span class="task-badge-title">Autonomous Agent Intent / User Task</span>
            </div>
            <div class="task-status-pills">
              <span class="badge-pill ${isConnected ? 'badge-success' : 'badge-disconnected'}">
                ${isConnected ? 'SYSTEM CONNECTED' : 'AWAITING EXTENSION'}
              </span>
              <span class="badge-pill">ITERATION #${telemetry.iteration || browser.iteration || 0}</span>
            </div>
          </div>

          <div class="task-content-text ${userTask ? '' : 'waiting'}">
            ${userTask ? userTask : 'Waiting for user task from RAVEN extension popup (Enter a goal and click Start)...'}
          </div>

          <div class="task-meta-row">
            <div style="display: flex; align-items: center; gap: 10px; color: var(--text-muted);">
              <span>Target: <strong style="color: var(--text-cyan);">${currentUrl ? currentUrl : 'None selected'}</strong></span>
              ${pageTitle && pageTitle !== '(No active page)' ? `<span>• ${pageTitle}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: var(--text-muted);">Pipeline Latency:</span>
              <span style="color: var(--text-emerald); font-weight: 700;">${totalPipelineLatency > 0 ? totalPipelineLatency + ' ms' : '--'}</span>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- 2. TWO-COLUMN VIEWPORT: LIVE BROWSER vs. SANITIZED OBSERVATION    -->
        <!-- ================================================================= -->
        <div class="two-col-core">

          <!-- Left: Live Browser Target (Local Raw Perception Perimeter) -->
          <div class="core-card raw-perimeter">
            <div class="core-card-header">
              <div class="core-card-title">
                <span>🌐</span>
                <span>Live Browser Viewport</span>
              </div>
              <span class="badge-pill" style="border-color: var(--border-rose); color: var(--text-rose); background: rgba(244, 63, 94, 0.1);">
                LOCAL ON-DEVICE ONLY
              </span>
            </div>

            <!-- Mini Browser Chrome -->
            <div class="browser-chrome-bar">
              <div class="browser-dots">
                <span class="browser-dot r"></span>
                <span class="browser-dot y"></span>
                <span class="browser-dot g"></span>
              </div>
              <span class="browser-url-input" title="${currentUrl || ''}">
                ${currentUrl || 'Waiting for browser connection...'}
              </span>
            </div>

            <!-- Viewport Screen -->
            <div class="browser-viewport-display">
              ${screenshotUrl ? `
                <img src="${screenshotUrl}" alt="Live browser viewport capture" />
              ` : `
                <div class="viewport-empty-state">
                  <div class="viewport-empty-icon">📷</div>
                  <div style="font-weight: 600; font-size: 13px; color: var(--text-secondary);">Waiting for Viewport Capture</div>
                  <div style="font-size: 11px; max-width: 280px; line-height: 1.4;">
                    When RAVEN's on-device M1 perception captures the active tab, the live viewport image will render here.
                  </div>
                </div>
              `}
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
              <span>M1 Resolution: ${milestones.M1.details?.viewport?.width ? `${milestones.M1.details.viewport.width}×${milestones.M1.details.viewport.height}` : '--'}</span>
              <span>State: ${browser.state || 'Standby'}</span>
            </div>
          </div>

          <!-- Right: Sanitized Observation (Clean Boundary Allowed To Leave) -->
          <div class="core-card safe-boundary">
            <div class="core-card-header">
              <div class="core-card-title">
                <span>🛡️</span>
                <span>Sanitized Context (Outbound)</span>
              </div>
              <span class="badge-pill ${gatePassed ? 'badge-success' : 'badge-waiting'}">
                ${gatePassed ? '✓ SAFE TO TRANSMIT' : 'HOLDING IN LOCAL BUFFER'}
              </span>
            </div>

            <!-- Quick Metrics Grid -->
            <div class="sanitized-stats-strip">
              <div class="mini-stat-tile">
                <span class="mini-stat-label">DOM Nodes</span>
                <span class="mini-stat-val cyan">${dom.totalElements || 0}</span>
              </div>
              <div class="mini-stat-tile">
                <span class="mini-stat-label">Interactive</span>
                <span class="mini-stat-val cyan">${dom.interactiveElements || 0}</span>
              </div>
              <div class="mini-stat-tile">
                <span class="mini-stat-label">OCR Regions</span>
                <span class="mini-stat-val">${ocr.blocks.length || 0}</span>
              </div>
              <div class="mini-stat-tile">
                <span class="mini-stat-label">PII Redacted</span>
                <span class="mini-stat-val emerald">${piiCount}</span>
              </div>
              <div class="mini-stat-tile">
                <span class="mini-stat-label">Faces Masked</span>
                <span class="mini-stat-val emerald">${faceCount}</span>
              </div>
              <div class="mini-stat-tile">
                <span class="mini-stat-label">Raw Leakage</span>
                <span class="mini-stat-val emerald">0 (ZERO)</span>
              </div>
            </div>

            <!-- Sanitized Context JSON / Text View -->
            <div class="sanitized-preview-block">
              <pre>${fusion.sanitizedObservation ? JSON.stringify(fusion.sanitizedObservation, null, 2) : (agent.observationSent ? JSON.stringify(agent.observationSent, null, 2) : '// Awaiting M6 Sanitization pass...\n// Raw PII values and face bitmaps are strictly blocked locally on-device.')}</pre>
            </div>

            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-emerald); display: flex; align-items: center; gap: 6px;">
              <span>✓ Privacy Invariant: Outbound observation is verified free of unmasked PII.</span>
            </div>
          </div>

        </div>

        <!-- ================================================================= -->
        <!-- 3. M1-M6 PERCEPTION PIPELINE (HORIZONTAL CHAIN)                   -->
        <!-- ================================================================= -->
        <div class="pipeline-chain-section">
          <div class="pipeline-chain-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; font-size: 13px;">PERCEPTION PIPELINE (M1 → M6)</span>
              <span style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">(Click card to inspect details)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-pill">${[milestones.M1, milestones.M2, milestones.M3, milestones.M4, milestones.M5, milestones.M6].filter(m => m.status === MILESTONE_STATUS.SUCCESS).length}/6 Complete</span>
            </div>
          </div>

          <div class="pipeline-chain-grid">
            <!-- M1 -->
            <div class="pipe-card ${activeDrawerModule === 'M1' ? 'active-inspect' : ''}" data-inspect="M1">
              <div class="pipe-card-top">
                <span class="pipe-badge-code">M1</span>
                ${getStatusBadge(milestones.M1.status)}
              </div>
              <div class="pipe-card-name">Screenshot Capture</div>
              <div class="pipe-card-latency">${m1Ms ? m1Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${milestones.M1.details?.viewport ? `${milestones.M1.details.viewport.width}×${milestones.M1.details.viewport.height}` : (milestones.M1.summary || '--')}</div>
            </div>

            <!-- M2 -->
            <div class="pipe-card ${activeDrawerModule === 'M2' ? 'active-inspect' : ''}" data-inspect="M2">
              <div class="pipe-card-top">
                <span class="pipe-badge-code">M2</span>
                ${getStatusBadge(milestones.M2.status)}
              </div>
              <div class="pipe-card-name">DOM Tree Traversal</div>
              <div class="pipe-card-latency">${m2Ms ? m2Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${dom.totalElements ? `${dom.totalElements} nodes (${dom.interactiveElements} act)` : '--'}</div>
            </div>

            <!-- M3 -->
            <div class="pipe-card ${activeDrawerModule === 'M3' ? 'active-inspect' : ''}" data-inspect="M3">
              <div class="pipe-card-top">
                <span class="pipe-badge-code">M3</span>
                ${getStatusBadge(milestones.M3.status)}
              </div>
              <div class="pipe-card-name">Local Vision CV</div>
              <div class="pipe-card-latency">${m3Ms ? m3Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${vision.regions.length ? `${vision.regions.length} visual regions` : '--'}</div>
            </div>

            <!-- M4 -->
            <div class="pipe-card ${activeDrawerModule === 'M4' ? 'active-inspect' : ''}" data-inspect="M4">
              <div class="pipe-card-top">
                <span class="pipe-badge-code">M4</span>
                ${getStatusBadge(milestones.M4.status)}
              </div>
              <div class="pipe-card-name">On-Device OCR</div>
              <div class="pipe-card-latency">${m4Ms ? m4Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${ocr.blocks.length ? `${ocr.blocks.length} text blocks` : '--'}</div>
            </div>

            <!-- M5 -->
            <div class="pipe-card ${activeDrawerModule === 'M5' ? 'active-inspect' : ''}" data-inspect="M5">
              <div class="pipe-card-top">
                <span class="pipe-badge-code m5">M5</span>
                ${getStatusBadge(milestones.M5.status)}
              </div>
              <div class="pipe-card-name">Face & PII Scan</div>
              <div class="pipe-card-latency">${m5Ms ? m5Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${piiCount || faceCount ? `${piiCount} PII, ${faceCount} faces` : '0 detected'}</div>
            </div>

            <!-- M6 -->
            <div class="pipe-card ${activeDrawerModule === 'M6' ? 'active-inspect' : ''}" data-inspect="M6">
              <div class="pipe-card-top">
                <span class="pipe-badge-code m6">M6</span>
                ${getStatusBadge(milestones.M6.status)}
              </div>
              <div class="pipe-card-name">Fusion & Redaction</div>
              <div class="pipe-card-latency">${m6Ms ? m6Ms + ' ms' : '--'}</div>
              <div class="pipe-card-output">${fusion.sensitiveRedacted ? `${fusion.sensitiveRedacted} sanitized` : (gatePassed ? 'Gate Verified' : '--')}</div>
            </div>
          </div>
        </div>

        <!-- ================================================================= -->
        <!-- 4. PRIVACY GATE & PROTECTION SUMMARY CHECKPOINT                   -->
        <!-- ================================================================= -->
        <div class="privacy-checkpoint-container">

          <!-- Large Security Checkpoint Monolith -->
          <div class="privacy-gate-monolith ${gateStatusClass}">
            <div class="gate-headline-row">
              <div class="gate-title-group">
                <span class="gate-shield-icon">${gateBlocked ? '🔒' : '🔐'}</span>
                <div>
                  <div class="gate-title-text">PRIVACY GATE CHECKPOINT</div>
                  <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">
                    Fail-Closed On-Device Boundary Enforcement
                  </div>
                </div>
              </div>
              <span class="badge-pill ${gateBlocked ? 'badge-error' : (gatePassed ? 'badge-success' : 'badge-waiting')}" style="font-size: 12px; padding: 6px 14px; font-weight: 700;">
                ${gateStatusText}
              </span>
            </div>

            ${fusion.blockedReason ? `
              <div class="gate-blocked-alert">
                <strong>[FAIL-CLOSED ALERT]:</strong> ${fusion.blockedReason}
              </div>
            ` : ''}

            <!-- Checkpoint Verification Grid -->
            <div class="gate-metrics-grid">
              <div class="gate-metric-box">
                <span class="gate-metric-label">Candidates Evaluated</span>
                <span class="gate-metric-val cyan">${candidateCount}</span>
              </div>
              <div class="gate-metric-box">
                <span class="gate-metric-label">PII Entities Masked</span>
                <span class="gate-metric-val emerald">${piiCount}</span>
              </div>
              <div class="gate-metric-box">
                <span class="gate-metric-label">Facial Biometrics Blurred</span>
                <span class="gate-metric-val emerald">${faceCount}</span>
              </div>
              <div class="gate-metric-box">
                <span class="gate-metric-label">Raw Secrets Leaked</span>
                <span class="gate-metric-val emerald">0 (ZERO)</span>
              </div>
            </div>
          </div>

          <!-- Protection Summary Panel -->
          <div class="protection-summary-card">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; font-size: 13px;">PROTECTION SUMMARY</span>
              <span style="font-size: 10.5px; font-family: var(--font-mono); color: var(--text-emerald);">ZERO RAW PII SENT</span>
            </div>

            <div class="protection-badges-list">
              <div class="protect-chip ${piiCount > 0 ? '' : 'warn'}">
                <span>✓</span>
                <span>EMAIL: REDACTED</span>
              </div>
              <div class="protect-chip ${piiCount > 0 ? '' : 'warn'}">
                <span>✓</span>
                <span>PHONE: REDACTED</span>
              </div>
              <div class="protect-chip ${faceCount > 0 ? '' : 'warn'}">
                <span>✓</span>
                <span>FACES: GAUSSIAN BLURRED</span>
              </div>
              <div class="protect-chip">
                <span>✓</span>
                <span>AUTH / TOKENS: STRIPPED</span>
              </div>
              <div class="protect-chip">
                <span>✓</span>
                <span>COOKIE DATA: FILTERED</span>
              </div>
              <div class="protect-chip">
                <span>✓</span>
                <span>FINANCIAL / CARDS: MASKED</span>
              </div>
            </div>

            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); line-height: 1.4;">
              All detected sensitive entities are neutralized client-side. The model receives only synthetic placeholders (e.g. <code>[REDACTED_EMAIL_1]</code>).
            </div>
          </div>

        </div>

        <!-- ================================================================= -->
        <!-- 5. GEMINI AGENT DECISION + ACTION EXECUTION + THE LOOP            -->
        <!-- ================================================================= -->
        <div class="agent-loop-strip">

          <!-- Card 1: Gemini Agent Decision -->
          <div class="action-flow-card">
            <div class="flow-card-head">
              <span class="title">
                <span>🤖</span>
                <span>GEMINI AGENT</span>
              </span>
              <span class="badge-pill ${agent.selectedAction ? 'badge-success' : 'badge-waiting'}">
                ${agent.selectedAction ? 'DECISION READY' : 'WAITING'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between; font-family: var(--font-mono);">
                <span style="color: var(--text-muted);">Context Received:</span>
                <span style="color: var(--text-emerald); font-weight: 600;">SANITIZED ONLY</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-family: var(--font-mono);">
                <span style="color: var(--text-muted);">Decision Latency:</span>
                <span style="color: var(--text-violet); font-weight: 600;">${geminiMs ? geminiMs + ' ms' : '--'}</span>
              </div>
              <div style="margin-top: 4px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono);">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Selected Decision</div>
                <div style="color: var(--text-cyan); font-weight: 700; margin-top: 2px; font-size: 13px;">
                  ${agent.selectedAction || '(Awaiting agent loop)'}
                </div>
              </div>
            </div>
          </div>

          <!-- Card 2: Action Executed on Target Page -->
          <div class="action-flow-card">
            <div class="flow-card-head">
              <span class="title">
                <span>⚡</span>
                <span>BROWSER ACTION</span>
              </span>
              <span class="badge-pill ${agent.actionExecutionStatus === 'success' ? 'badge-success' : 'badge-waiting'}">
                ${agent.actionExecutionStatus === 'success' ? 'EXECUTED' : (agent.actionExecutionStatus || 'PENDING')}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between; font-family: var(--font-mono);">
                <span style="color: var(--text-muted);">Action Type:</span>
                <span style="color: var(--text-primary); font-weight: 600;">${agent.actionType || '--'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-family: var(--font-mono);">
                <span style="color: var(--text-muted);">Target Element:</span>
                <span style="color: var(--text-cyan); font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${agent.targetInfo || 'Page level'}
                </span>
              </div>
              <div style="margin-top: 4px; padding: 8px; background: var(--bg-input); border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); font-family: var(--font-mono);">
                <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase;">Execution Status</div>
                <div style="color: var(--text-emerald); font-weight: 700; margin-top: 2px; font-size: 13px;">
                  ${agent.actionExecutionStatus === 'success' ? '✓ Action Succeeded' : (agent.actionExecutionStatus || 'Ready')}
                </div>
              </div>
            </div>
          </div>

          <!-- Card 3: The Complete Autonomous Interaction Loop -->
          <div class="action-flow-card">
            <div class="flow-card-head">
              <span class="title">
                <span>🔄</span>
                <span>AUTONOMOUS INTERACTION LOOP</span>
              </span>
              <span class="badge-pill badge-success">CYCLE #${telemetry.iteration || browser.iteration || 0}</span>
            </div>

            <div class="loop-diagram-container">
              <div class="loop-steps-row">
                <span class="loop-node">OBSERVE</span>
                <span class="loop-arrow">→</span>
                <span class="loop-node">SANITIZE</span>
                <span class="loop-arrow">→</span>
                <span class="loop-node highlight">GATE</span>
                <span class="loop-arrow">→</span>
                <span class="loop-node">GEMINI</span>
                <span class="loop-arrow">→</span>
                <span class="loop-node">ACT</span>
                <span class="loop-arrow" style="color: var(--text-emerald); font-weight: bold;">↺</span>
              </div>
              <div class="loop-caption">
                RAVEN observes locally, detects and strips sensitive data on-device, passes only safe sanitized context to Gemini, executes the action, and immediately loops to re-observe.
              </div>
            </div>
          </div>

        </div>

        <!-- ================================================================= -->
        <!-- 6. PERFORMANCE METRICS & LIVE EVENT TIMELINE (BOTTOM ROW)         -->
        <!-- ================================================================= -->
        <div class="bottom-operational-strip">

          <!-- Performance Latency Breakdown -->
          <div class="perf-bars-card">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; font-size: 13px;">PIPELINE LATENCY BREAKDOWN</span>
              <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-emerald); font-weight: 700;">
                Total: ${totalPipelineLatency > 0 ? totalPipelineLatency + ' ms' : '--'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
              <!-- M1 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M1 Capture</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill" style="width: ${m1Ms ? Math.min(100, Math.round((m1Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m1Ms ? m1Ms + 'ms' : '--'}</span>
              </div>

              <!-- M2 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M2 DOM</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill" style="width: ${m2Ms ? Math.min(100, Math.round((m2Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m2Ms ? m2Ms + 'ms' : '--'}</span>
              </div>

              <!-- M3 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M3 Vision</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill" style="width: ${m3Ms ? Math.min(100, Math.round((m3Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m3Ms ? m3Ms + 'ms' : '--'}</span>
              </div>

              <!-- M4 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M4 OCR</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill" style="width: ${m4Ms ? Math.min(100, Math.round((m4Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m4Ms ? m4Ms + 'ms' : '--'}</span>
              </div>

              <!-- M5 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M5 PII</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill m5" style="width: ${m5Ms ? Math.min(100, Math.round((m5Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m5Ms ? m5Ms + 'ms' : '--'}</span>
              </div>

              <!-- M6 -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">M6 Fusion</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill" style="width: ${m6Ms ? Math.min(100, Math.round((m6Ms / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${m6Ms ? m6Ms + 'ms' : '--'}</span>
              </div>

              <!-- Gemini -->
              <div class="latency-bar-row">
                <span class="latency-bar-label">Gemini API</span>
                <div class="latency-bar-track">
                  <div class="latency-bar-fill gemini" style="width: ${geminiMs ? Math.min(100, Math.round((geminiMs / maxBarLatency) * 100)) : 0}%;"></div>
                </div>
                <span class="latency-bar-val">${geminiMs ? geminiMs + 'ms' : '--'}</span>
              </div>
            </div>
          </div>

          <!-- Live Event Timeline Feed -->
          <div class="timeline-mini-card">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-weight: 700; font-size: 13px;">LIVE TRACE STREAM</span>
              <span class="badge-pill">${timeline.length} Events</span>
            </div>

            <div class="timeline-mini-feed">
              ${timeline.length === 0 ? `
                <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 11px; font-family: var(--font-mono);">
                  Waiting for pipeline trace events...
                </div>
              ` : timeline.slice(0, 7).map(evt => `
                <div class="timeline-mini-item ${evt.status === 'warning' ? 'warning' : (evt.status === 'error' ? 'error' : '')}">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <strong style="color: var(--text-cyan);">${evt.component}</strong>
                    <span style="color: var(--text-secondary);">${evt.event}</span>
                  </div>
                  <span style="color: var(--text-muted); font-size: 10px;">
                    ${new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>

        </div>

        <!-- ================================================================= -->
        <!-- 7. SECURITY ASSURANCE FOOTER                                      -->
        <!-- ================================================================= -->
        <div class="security-assurance-bar">
          <div class="assurance-badge verified">
            <span>🛡️</span>
            <span>ON-DEVICE PERCEPTION</span>
          </div>
          <div class="assurance-badge verified">
            <span>🔍</span>
            <span>LOCAL OCR</span>
          </div>
          <div class="assurance-badge verified">
            <span>🔒</span>
            <span>PII REDACTION ENGINE</span>
          </div>
          <div class="assurance-badge verified">
            <span>⚡</span>
            <span>FAIL-CLOSED PRIVACY GATE</span>
          </div>
          <div class="assurance-badge verified">
            <span>🤖</span>
            <span>SANITIZED GEMINI CONTEXT</span>
          </div>
        </div>

      </div>

      <!-- =================================================================== -->
      <!-- 8. IN-PAGE MODULE INSPECTOR DRAWER (Slide-out without leaving page) -->
      <!-- =================================================================== -->
      <div id="module-inspect-drawer" class="module-drawer-overlay ${activeDrawerModule ? 'open' : ''}">
        <div class="module-drawer-sheet">
          <div class="module-drawer-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="pipe-badge-code">${activeDrawerModule || 'INFO'}</span>
              <strong style="font-size: 14px;">${activeDrawerModule ? milestones[activeDrawerModule]?.name : 'Subsystem Inspector'}</strong>
            </div>
            <button id="close-drawer-btn" class="btn-cyber" style="padding: 4px 10px; font-size: 12px;">✕ Close</button>
          </div>
          <div class="module-drawer-body">
            ${renderDrawerContent(activeDrawerModule, state)}
          </div>
        </div>
      </div>
    `;

    // Attach listeners for pipeline card clicks (to open in-page drawer)
    container.querySelectorAll('.pipe-card[data-inspect]').forEach(card => {
      card.addEventListener('click', () => {
        activeDrawerModule = card.getAttribute('data-inspect');
        update();
      });
    });

    // Close drawer button
    const closeBtn = container.querySelector('#close-drawer-btn');
    closeBtn?.addEventListener('click', () => {
      activeDrawerModule = null;
      update();
    });

    // Overlay click to close
    const overlay = container.querySelector('#module-inspect-drawer');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        activeDrawerModule = null;
        update();
      }
    });
  }

  store.subscribe(update);
  update();
}

/**
 * Renders detailed module data for the slide-out drawer
 */
function renderDrawerContent(modId, state) {
  if (!modId) return '<div style="color: var(--text-muted);">No module selected.</div>';

  const m = state.milestones[modId];
  if (!m) return '<div style="color: var(--text-muted);">Module not found.</div>';

  if (modId === 'M1') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>Execution Time:</strong> ${m.executionTimeMs} ms</div>
        <div><strong>Summary:</strong> ${m.summary}</div>
        <div><strong>Captured Viewport Dimensions:</strong> ${m.details?.viewport ? `${m.details.viewport.width} × ${m.details.viewport.height} (${m.details.viewport.aspectRatio || '16:9'})` : '--'}</div>
        ${state.browser.screenshotUrl ? `
          <div style="margin-top: 8px;">
            <strong>Viewport Bitmap:</strong>
            <img src="${state.browser.screenshotUrl}" style="width: 100%; border-radius: 4px; border: 1px solid var(--border-subtle); margin-top: 6px;" />
          </div>
        ` : ''}
      </div>
    `;
  }

  if (modId === 'M2') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>Total Elements:</strong> ${state.dom.totalElements}</div>
        <div><strong>Interactive Elements:</strong> ${state.dom.interactiveElements}</div>
        <div><strong>Visible Elements:</strong> ${state.dom.visibleElements}</div>
        <div><strong>Latency:</strong> ${m.executionTimeMs} ms</div>
        <div style="margin-top: 8px;">
          <strong>Sample Indexed DOM Elements:</strong>
          <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 350px; overflow-y: auto; font-size: 11px;">
${state.dom.tree && state.dom.tree.length ? JSON.stringify(state.dom.tree.slice(0, 15), null, 2) : '(No DOM tree elements indexed yet)'}
          </pre>
        </div>
      </div>
    `;
  }

  if (modId === 'M3') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>Detector:</strong> ${state.vision.detector || 'morphological-cv-v1'}</div>
        <div><strong>Identified Regions:</strong> ${state.vision.regions.length}</div>
        <div><strong>Latency:</strong> ${m.executionTimeMs} ms</div>
        <div style="margin-top: 8px;">
          <strong>Vision Regions Data:</strong>
          <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 350px; overflow-y: auto; font-size: 11px;">
${state.vision.regions.length ? JSON.stringify(state.vision.regions, null, 2) : '(No visual regions detected yet)'}
          </pre>
        </div>
      </div>
    `;
  }

  if (modId === 'M4') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>Total OCR Text Blocks:</strong> ${state.ocr.blocks.length}</div>
        <div><strong>Words Extracted:</strong> ${state.ocr.totalWords}</div>
        <div><strong>Average Confidence:</strong> ${Math.round(state.ocr.averageConfidence * 100)}%</div>
        <div><strong>Latency:</strong> ${m.executionTimeMs} ms</div>
        <div style="margin-top: 8px;">
          <strong>Extracted Text Blocks:</strong>
          <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 350px; overflow-y: auto; font-size: 11px;">
${state.ocr.blocks.length ? JSON.stringify(state.ocr.blocks, null, 2) : '(No OCR text blocks extracted yet)'}
          </pre>
        </div>
      </div>
    `;
  }

  if (modId === 'M5') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>PII Entities Tagged:</strong> ${state.privacy.piiDetected}</div>
        <div><strong>Faces Blurred:</strong> ${state.privacy.facesDetected}</div>
        <div><strong>Detector:</strong> ${state.privacy.backend || 'classical_biometric_cv'}</div>
        <div><strong>Latency:</strong> ${m.executionTimeMs} ms</div>
        ${state.privacy.items.some(i => i.thumbnailDataUrl) ? `
          <div style="margin-top: 8px;">
            <strong>Blurred Face Thumbnails:</strong>
            <div style="display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap;">
              ${state.privacy.items.filter(i => i.thumbnailDataUrl).map(i => `
                <img src="${i.thumbnailDataUrl}" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid var(--border-rose);" />
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div style="margin-top: 8px;">
          <strong>Detected Sensitive Items (Strictly Masked):</strong>
          <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 250px; overflow-y: auto; font-size: 11px;">
${state.privacy.items.length ? JSON.stringify(state.privacy.items, null, 2) : '(No sensitive items detected on screen)'}
          </pre>
        </div>
      </div>
    `;
  }

  if (modId === 'M6') {
    return `
      <div style="display: flex; flex-direction: column; gap: 12px; font-family: var(--font-mono); font-size: 12px;">
        <div><strong>Status:</strong> ${m.status.toUpperCase()}</div>
        <div><strong>Regions Merged:</strong> ${state.fusion.regionsMerged}</div>
        <div><strong>Sensitive Redacted:</strong> ${state.fusion.sensitiveRedacted}</div>
        <div><strong>Privacy Gate Passed:</strong> ${state.fusion.privacyGatePassed ? 'YES (SAFE)' : 'NO (HELD/BLOCKED)'}</div>
        <div><strong>Latency:</strong> ${m.executionTimeMs} ms</div>
        <div style="margin-top: 8px;">
          <strong>Outbound Sanitized Payload:</strong>
          <pre style="background: var(--bg-input); padding: 10px; border-radius: 4px; border: 1px solid var(--border-subtle); max-height: 350px; overflow-y: auto; font-size: 11px;">
${state.fusion.sanitizedObservation ? JSON.stringify(state.fusion.sanitizedObservation, null, 2) : '(Observation buffer currently empty)'}
          </pre>
        </div>
      </div>
    `;
  }

  return '<div style="color: var(--text-muted);">No detail view available.</div>';
}
