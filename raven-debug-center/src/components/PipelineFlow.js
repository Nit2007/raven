/**
 * RAVEN Debug Center — Pipeline DAG Flow Ribbon
 * Renders the top visual pipeline chain and state progression.
 */

import { store } from '../models/store.js';
import { MILESTONE_STATUS, PRIVACY_GATE_STATUS } from '../models/types.js';

export function renderPipelineFlow(container) {
  function update() {
    const state = store.getState();
    const m = state.milestones;
    const gate = state.privacy.gateStatus;
    const agent = state.agent;
    const browser = state.browser;

    function getStatusSymbol(status) {
      switch (status) {
        case MILESTONE_STATUS.SUCCESS: return '✓';
        case MILESTONE_STATUS.RUNNING: return '⟳';
        case MILESTONE_STATUS.ERROR: return '✕';
        default: return '⏳';
      }
    }

    const m1Status = m.M1.status;
    const m2Status = m.M2.status;
    const m3Status = m.M3.status;
    const m4Status = m.M4.status;
    const m5Status = m.M5.status;
    const m6Status = m.M6.status;

    const gatePassed = gate === PRIVACY_GATE_STATUS.PASSED;
    const gateSymbol = gatePassed ? '✓' : (gate === PRIVACY_GATE_STATUS.BREACH_DETECTED ? '✕' : '🔒');

    const agentReady = !!agent.selectedAction;
    const agentSymbol = agentReady ? '✓' : '🤖';

    const actionDone = agent.actionExecutionStatus === 'executed' || agent.actionExecutionStatus === 'success';
    const actionSymbol = actionDone ? '✓' : '⚡';

    container.innerHTML = `
      <div class="pipeline-dag-bar">
        <!-- M1 -->
        <div class="dag-node ${m1Status}" title="M1: ${m.M1.name}">
          <span class="dag-node-id">M1</span>
          <span>Screenshot</span>
          <span class="badge-pill">${getStatusSymbol(m1Status)}</span>
        </div>
        <span class="dag-arrow">→</span>

        <!-- M2 -->
        <div class="dag-node ${m2Status}" title="M2: ${m.M2.name}">
          <span class="dag-node-id">M2</span>
          <span>DOM</span>
          <span class="badge-pill">${getStatusSymbol(m2Status)}</span>
        </div>
        <span class="dag-arrow">→</span>

        <!-- M3 -->
        <div class="dag-node ${m3Status}" title="M3: ${m.M3.name}">
          <span class="dag-node-id">M3</span>
          <span>Vision</span>
          <span class="badge-pill">${getStatusSymbol(m3Status)}</span>
        </div>
        <span class="dag-arrow">→</span>

        <!-- M4 -->
        <div class="dag-node ${m4Status}" title="M4: ${m.M4.name}">
          <span class="dag-node-id">M4</span>
          <span>OCR</span>
          <span class="badge-pill">${getStatusSymbol(m4Status)}</span>
        </div>
        <span class="dag-arrow">→</span>

        <!-- M5 -->
        <div class="dag-node ${m5Status}" title="M5: ${m.M5.name}">
          <span class="dag-node-id">M5</span>
          <span>PII / Sensitive</span>
          <span class="badge-pill">${getStatusSymbol(m5Status)}</span>
        </div>
        <span class="dag-arrow">→</span>

        <!-- M6 -->
        <div class="dag-node ${m6Status}" title="M6: ${m.M6.name}">
          <span class="dag-node-id">M6</span>
          <span>Fusion / Sanitize</span>
          <span class="badge-pill">${getStatusSymbol(m6Status)}</span>
        </div>
        <span class="dag-arrow">↓</span>

        <!-- Privacy Gate -->
        <div class="dag-node privacy-gate ${gatePassed ? 'passed' : ''}" title="Mandatory Security Filter Boundary">
          <span>PRIVACY GATE</span>
          <span class="badge-pill">${gateSymbol}</span>
        </div>
        <span class="dag-arrow">↓</span>

        <!-- Simple-UI -->
        <div class="dag-node agent-node" title="Simple-UI Browser Agent (Observability)">
          <span>SIMPLE-UI</span>
          <span class="badge-pill">${agentSymbol}</span>
        </div>
        <span class="dag-arrow">↓</span>

        <!-- Gemini Decision -->
        <div class="dag-node agent-node" title="Gemini LLM Single-Action Selection">
          <span>GEMINI</span>
          <span class="badge-pill">${agent.selectedAction ? '✓' : '...'}</span>
        </div>
        <span class="dag-arrow">↓</span>

        <!-- Browser Action -->
        <div class="dag-node" title="Target Webpage Mutation / Action">
          <span>ACTION</span>
          <span class="badge-pill">${actionSymbol}</span>
        </div>
        <span class="dag-arrow">↺</span>
        <span style="font-size: 10.5px; color: var(--text-muted); font-family: var(--font-mono);">(Loop to M1)</span>
      </div>
    `;
  }

  store.subscribe(update);
  update();
}
