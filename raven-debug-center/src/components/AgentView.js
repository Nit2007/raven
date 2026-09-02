/**
 * RAVEN Debug Center — Simple-UI / Gemini Integration Monitoring Panel
 * Observability only: monitors data passed to and decisions returned by Simple-UI and Gemini.
 * Does NOT execute decisions or replace the agent planner.
 */

import { store } from '../models/store.js';

export function renderAgentView(container) {
  function update() {
    const state = store.getState();
    const agent = state.agent;
    const hasData = !!agent.selectedAction || !!agent.geminiResponse || !!agent.requestTimestamp;

    container.innerHTML = `
      <div class="panel-container">
        <div class="panel-section-header">
          <div>
            <div class="panel-title">
              <span>🤖</span>
              <span>Simple-UI & Gemini Integration Monitor</span>
            </div>
            <div class="panel-subtitle">
              Passive observability interface: monitors sanitized observations sent to Simple-UI and the single-action decisions returned by Google's Gemini API.
            </div>
          </div>
          <span class="badge-pill ${hasData ? 'badge-success' : 'badge-waiting'}">
            ${hasData ? 'DECISION RECORDED' : 'WAITING FOR AGENT'}
          </span>
        </div>

        <div class="stat-group-row">
          <div class="stat-box">
            <span class="stat-box-label">Selected Action</span>
            <span class="stat-box-value cyan">
              ${agent.selectedAction || '—'}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Action Type</span>
            <span class="stat-box-value">
              ${agent.actionType || '—'}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Gemini API Latency</span>
            <span class="stat-box-value violet">
              ${agent.responseLatencyMs ? `${agent.responseLatencyMs} ms` : '—'}
            </span>
          </div>
          <div class="stat-box">
            <span class="stat-box-label">Execution Status</span>
            <span class="stat-box-value emerald">
              ${agent.actionExecutionStatus || 'WAITING'}
            </span>
          </div>
        </div>

        ${!hasData ? `
          <div class="empty-state">
            <div class="empty-state-icon">🤖</div>
            <div class="empty-state-title">Awaiting Simple-UI / Gemini Activity</div>
            <div class="empty-state-desc">
              When Simple-UI submits the sanitized observation to Gemini and executes the chosen browser action, the request timestamps, model responses, and action receipts will populate here.
            </div>
          </div>
        ` : `
          <div class="card-grid-2">
            <!-- Left: Action Decision Card -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">Gemini Model Action Decision</div>
                ${agent.actionType ? `<span class="action-type-chip ${agent.actionType.toLowerCase()}">${agent.actionType}</span>` : ''}
              </div>

              <div class="agent-telemetry-box">
                <div style="display: flex; justify-content: space-between;">
                  <span class="stat-box-label">Target ID:</span>
                  <span style="color: var(--text-cyan); font-weight: 600;">${agent.targetInfo || 'None / Page-level'}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span class="stat-box-label">Timestamp:</span>
                  <span style="color: var(--text-muted);">${agent.requestTimestamp ? new Date(agent.requestTimestamp).toLocaleTimeString() : '—'}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span class="stat-box-label">Execution Status:</span>
                  <span style="color: var(--text-emerald);">${agent.actionExecutionStatus || 'Pending execution'}</span>
                </div>
              </div>

              <div class="card-title" style="font-size: 12.5px; margin-top: 6px;">Parsed Action Payload:</div>
              <div style="background: var(--bg-input); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); max-height: 220px; overflow-y: auto;">
                <pre style="margin: 0; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); white-space: pre-wrap;">
${agent.geminiResponse ? JSON.stringify(agent.geminiResponse, null, 2) : '(Waiting for model JSON)'}
                </pre>
              </div>
            </div>

            <!-- Right: Observation Transmitted Metadata -->
            <div class="debug-card">
              <div class="card-header-row">
                <div class="card-title">Sanitized Input Observation Fed to Model</div>
                <span class="badge-pill badge-success">M6 SANITIZED</span>
              </div>

              <div style="background: var(--bg-input); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); max-height: 380px; overflow-y: auto;">
                <pre style="margin: 0; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary); white-space: pre-wrap; word-break: break-all;">
${agent.observationSent ? JSON.stringify(agent.observationSent, null, 2) : '(No observation dispatched for this step yet)'}
                </pre>
              </div>
            </div>
          </div>
        `}
      </div>
    `;
  }

  store.subscribe(update);
  update();
}
