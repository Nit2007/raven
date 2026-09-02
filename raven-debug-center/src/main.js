/**
 * RAVEN Debug Center — Application Entry Point
 * Orchestrates views, mounts UI components, and connects the telemetry receiver.
 */

import { store } from './models/store.js';
import { telemetryReceiver } from './services/telemetryReceiver.js';
import { renderHeader } from './components/Header.js';
import { renderPipelineFlow } from './components/PipelineFlow.js';
import { renderOverviewView } from './components/OverviewView.js';
import { renderPipelineView } from './components/PipelineView.js';
import { renderLiveBrowserView } from './components/LiveBrowserView.js';
import { renderDomView } from './components/DomView.js';
import { renderVisionView } from './components/VisionView.js';
import { renderOcrView } from './components/OcrView.js';
import { renderPrivacyView } from './components/PrivacyView.js';
import { renderSanitizationView } from './components/SanitizationView.js';
import { renderAgentView } from './components/AgentView.js';
import { renderTimelineView } from './components/TimelineView.js';
import { renderHealthView } from './components/HealthView.js';
import { renderConnectionModal } from './components/ConnectionModal.js';

let activeView = 'overview';

const viewRenderers = {
  overview: renderOverviewView,
  pipeline: renderPipelineView,
  browser: renderLiveBrowserView,
  dom: renderDomView,
  vision: renderVisionView,
  ocr: renderOcrView,
  privacy: renderPrivacyView,
  sanitization: renderSanitizationView,
  agent: renderAgentView,
  timeline: renderTimelineView,
  health: renderHealthView
};

function switchView(viewName) {
  if (!viewRenderers[viewName]) return;
  activeView = viewName;

  // Update tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    if (tab.getAttribute('data-view') === viewName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Render view into main content
  const mainEl = document.getElementById('main-content');
  if (mainEl) {
    mainEl.innerHTML = '';
    viewRenderers[viewName](mainEl);
  }
}

function initApp() {
  console.log('[RAVEN Debug Center] Initializing...');

  // Mount Header
  const headerEl = document.getElementById('app-header');
  if (headerEl) renderHeader(headerEl);

  // Mount Pipeline Flow Ribbon
  const ribbonEl = document.getElementById('pipeline-ribbon-container');
  if (ribbonEl) renderPipelineFlow(ribbonEl);

  // Mount Connection Modal
  const modalEl = document.getElementById('modal-container');
  if (modalEl) renderConnectionModal(modalEl);

  // Setup Navigation Tab Listeners
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetView = e.currentTarget.getAttribute('data-view');
      switchView(targetView);
    });
  });

  // Event Count Badge in Tab
  const eventBadgeEl = document.getElementById('event-count-badge');
  store.subscribe(state => {
    if (eventBadgeEl) {
      eventBadgeEl.textContent = state.timeline.length;
    }
  });

  // Start Telemetry Ingestion Listeners (BroadcastChannel & postMessage)
  telemetryReceiver.init();
  telemetryReceiver.connectWebSocket('ws://localhost:8765');

  // Render Default View
  switchView('overview');

  console.log('[RAVEN Debug Center] Ready.');
}

window.addEventListener('DOMContentLoaded', initApp);
