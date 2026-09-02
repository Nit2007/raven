/**
 * RAVEN Debug Center — Overview View
 * Gives developers an immediate, high-density answer to:
 * "Is every component working and communicating correctly?"
 */

import { store } from '../models/store.js';
import { MILESTONE_STATUS, PRIVACY_GATE_STATUS, CONNECTION_STATUS } from '../models/types.js';

export function renderOverviewView(container) {
  function update() {
    const state = store.getState();
    const conn = state.connection;
    const m = state.milestones;
    const gate = state.privacy.gateStatus;
    const agent = state.agent;
    const timeline = state.timeline;

    // Component operational status calculation
    const allMilestones = Object.values(m);
    const hasErrors = allMilestones.some(x => x.status === MILESTONE_STATUS.ERROR);
    const hasRunning = allMilestones.some(x => x.status === MILESTONE_STATUS.RUNNING);
    const allSuccess = allMilestones.every(x => x.status === MILESTONE_STATUS.SUCCESS);
    const allWaiting = allMilestones.every(x => x.status === MILESTONE_STATUS.WAITING);

    let systemVerdict = {
      title: 'System Inactive / Waiting for Pipeline Events',
      desc: 'Telemetry receiver is listening. Once RAVEN executes on an active page, milestone telemetry will illuminate here in real-time.',
      badgeClass: 'badge-waiting',
      verdictClass: 'waiting'
    };

    if (conn.status === CONNECTION_STATUS.DISCONNECTED && allWaiting) {
      systemVerdict = {
        title: 'Telemetry Stream Disconnected',
        desc: 'No local daemon or WebSocket server detected on configured port. Click "Connection" to configure or use the BroadcastChannel bridge.',
        badgeClass: 'badge-disconnected',
        verdictClass: 'disconnected'
      };
    } else if (hasErrors) {
      systemVerdict = {
        title: 'Pipeline Degraded — Component Error Detected',
        desc: 'One or more perception or execution milestones failed during the active iteration cycle. Inspect the error logs below.',
        badgeClass: 'badge-error',
        verdictClass: 'error'
      };
    } else if (hasRunning) {
      systemVerdict = {
        title: 'Perception Pipeline Executing Cycle',
        desc: 'RAVEN is actively processing the current page state through M1-M6 and privacy verification.',
        badgeClass: 'badge-running',
        verdictClass: 'running'
      };
    } else if (allSuccess && gate === PRIVACY_GATE_STATUS.PASSED) {
      systemVerdict = {
        title: 'All Components Operational & Privacy Gate Verified',
        desc: 'Full M1–M6 perception cycle completed successfully. Observation was sanitized and verified before reaching Simple-UI/Gemini.',
        badgeClass: 'badge-success',
        verdictClass: 'success'
      };
    }

    const totalPipelineLatency = allMilestones.reduce((acc, curr) => acc + (curr.executionTimeMs || 0), 0);

    container.innerHTML = `
      <div class="panel-container">
        <!-- Top Health Verdict Banner -->
        <div class="debug-card" style="border-left: 4px solid ${hasErrors ? 'var(--color-rose)' : allSuccess ? 'var(--color-emerald)' : 'var(--color-cyan)'};">
          <div class="card-header-row">
            <div>
              <div class="card-title" style="font-size: 16px;">${systemVerdict.title}</div>
              <div class="panel-subtitle">${systemVerdict.desc}</div>
            </div>
            <span class="badge-pill ${systemVerdict.badgeClass}">
              ${systemVerdict.verdictClass.toUpperCase()}
            </span>
          </div>

          <div class="stat-group-row" style="margin-top: 8px;">
            <div class="stat-box">
              <span class="stat-box-label">Current Cycle</span>
              <span class="stat-box-value cyan">#${state.telemetry.iteration}</span>
            </div>
            <div class="stat-box">
              <span class="stat-box-label">Pipeline Latency</span>
              <span class="stat-box-value">${totalPipelineLatency > 0 ? totalPipelineLatency + ' ms' : '0 ms'}</span>
            </div>
            <div class="stat-box">
              <span class="stat-box-label">Privacy Gate</span>
              <span class="stat-box-value ${gate === PRIVACY_GATE_STATUS.PASSED ? 'emerald' : 'rose'}">
                ${gate === PRIVACY_GATE_STATUS.PASSED ? 'VERIFIED' : gate.toUpperCase()}
              </span>
            </div>
            <div class="stat-box">
              <span class="stat-box-label">Gemini Latency</span>
              <span class="stat-box-value violet">
                ${agent.responseLatencyMs ? agent.responseLatencyMs + ' ms' : '—'}
              </span>
            </div>
            <div class="stat-box">
              <span class="stat-box-label">Events Logged</span>
              <span class="stat-box-value">${timeline.length}</span>
            </div>
          </div>
        </div>

        <!-- Two Column Main Layout: Milestone Matrix & Live Browser/Agent State -->
        <div class="card-grid-2">
          <!-- Column 1: M1-M6 Milestone Status Overview -->
          <div class="debug-card">
            <div class="card-header-row">
              <div class="card-title">Perception Pipeline Health (M1–M6)</div>
              <span class="badge-pill">${allMilestones.filter(x => x.status === MILESTONE_STATUS.SUCCESS).length}/6 Complete</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${allMilestones.map(milestone => {
                let badgeClass = 'badge-waiting';
                if (milestone.status === MILESTONE_STATUS.SUCCESS) badgeClass = 'badge-success';
                else if (milestone.status === MILESTONE_STATUS.RUNNING) badgeClass = 'badge-running';
                else if (milestone.status === MILESTONE_STATUS.ERROR) badgeClass = 'badge-error';

                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="milestone-code">${milestone.id}</span>
                      <span style="font-weight: 500; font-size: 12.5px;">${milestone.name}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                        ${milestone.executionTimeMs ? milestone.executionTimeMs + 'ms' : '—'}
                      </span>
                      <span class="badge-pill ${badgeClass}">${milestone.status.toUpperCase()}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Column 2: Live Browser & Agent Decision Snapshot -->
          <div class="debug-card">
            <div class="card-header-row">
              <div class="card-title">Target Browser & Agent Telemetry</div>
              <span class="badge-pill ${state.browser.url ? 'badge-success' : 'badge-disconnected'}">
                ${state.browser.url ? 'ACTIVE TAB' : 'NO CONNECTION'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span class="stat-box-label">Target Webpage</span>
                <span style="font-family: var(--font-mono); font-size: 12px; color: var(--text-cyan); word-break: break-all;">
                  ${state.browser.url || 'Waiting for browser connection...'}
                </span>
                <span style="font-size: 11.5px; color: var(--text-muted);">
                  ${state.browser.title ? `Title: ${state.browser.title}` : 'Page title: (none)'}
                </span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 4px; padding: 10px; background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
                <span class="stat-box-label">Simple-UI / Gemini Last Decision</span>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
                  <span style="font-family: var(--font-mono); font-size: 12px;">
                    Action: <strong>${agent.selectedAction || 'Awaiting agent loop'}</strong>
                  </span>
                  ${agent.actionType ? `<span class="action-type-chip ${agent.actionType.toLowerCase()}">${agent.actionType}</span>` : ''}
                </div>
                ${agent.targetInfo ? `
                  <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                    Target: ${agent.targetInfo}
                  </span>
                ` : ''}
              </div>

              <!-- Mini Event Stream -->
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <span class="stat-box-label">Recent Trace Events</span>
                <div style="display: flex; flex-direction: column; gap: 4px; max-height: 140px; overflow-y: auto;">
                  ${timeline.length === 0 ? `
                    <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11.5px; font-family: var(--font-mono);">
                      No events recorded yet.
                    </div>
                  ` : timeline.slice(0, 5).map(evt => `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 8px; background: var(--bg-input); border-radius: var(--radius-sm); font-family: var(--font-mono); font-size: 11px;">
                      <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: var(--text-cyan); font-weight: 600;">${evt.component}</span>
                        <span style="color: var(--text-secondary);">${evt.event}</span>
                      </div>
                      <span style="color: var(--text-muted); font-size: 10px;">${new Date(evt.timestamp).toLocaleTimeString()}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Privacy Boundary Demarcation -->
        <div class="privacy-boundary-strip">
          <div class="boundary-side">
            <div class="boundary-icon-badge danger">
              <span>🛑</span>
              <span>RAW BROWSER DATA</span>
            </div>
            <div style="font-size: 11.5px; color: var(--text-muted); max-width: 320px;">
              Raw DOM nodes, full viewport screenshots, credentials, and cookies are captured strictly locally on-device.
            </div>
          </div>

          <div class="boundary-divider">
            <div class="gate-shield">
              <span>🛡️ PRIVACY GATE / SANITIZER</span>
            </div>
            <span style="font-size: 10px; color: var(--text-muted); font-family: var(--font-mono);">
              M6 Verification & PII Stripping
            </span>
          </div>

          <div class="boundary-side" style="justify-content: flex-end;">
            <div style="font-size: 11.5px; color: var(--text-muted); max-width: 320px; text-align: right;">
              Only sanitized and verified observations cross the boundary to the external Gemini LLM.
            </div>
            <div class="boundary-icon-badge safe">
              <span>🟢</span>
              <span>SANITIZED TO GEMINI</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  store.subscribe(update);
  update();
}
