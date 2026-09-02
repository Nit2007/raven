/**
 * RAVEN Debug Center — Export Service
 * Exports the active debugging session snapshot and event timeline to a downloadable JSON trace.
 */

import { store } from '../models/store.js';

export function exportDebugTrace() {
  const currentState = store.getState();
  const sessionDump = {
    exportedAt: new Date().toISOString(),
    tool: 'RAVEN Debug Center v1.0',
    system: {
      url: currentState.telemetry.currentUrl,
      iteration: currentState.telemetry.iteration,
      browserState: currentState.telemetry.browserState
    },
    milestones: currentState.milestones,
    domSummary: {
      totalElements: currentState.dom.totalElements,
      interactiveElements: currentState.dom.interactiveElements,
      visibleElements: currentState.dom.visibleElements,
      roles: currentState.dom.roles
    },
    ocrSummary: {
      totalWords: currentState.ocr.totalWords,
      averageConfidence: currentState.ocr.averageConfidence,
      blocksCount: currentState.ocr.blocks.length
    },
    privacySummary: {
      facesDetected: currentState.privacy.facesDetected,
      piiDetected: currentState.privacy.piiDetected,
      sensitiveRegions: currentState.privacy.sensitiveRegions,
      gateStatus: currentState.privacy.gateStatus
    },
    fusionSummary: currentState.fusion,
    agentTelemetry: currentState.agent,
    timeline: currentState.timeline
  };

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(sessionDump, null, 2));
  const downloadAnchor = document.createElement('a');
  const filename = `raven-trace-iter${currentState.telemetry.iteration}-${Date.now()}.json`;
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();

  store.addEvent({
    component: 'DEBUG_CENTER',
    event: 'TRACE_DUMP_EXPORTED',
    status: 'success',
    metadata: { filename, eventCount: currentState.timeline.length }
  });
}
