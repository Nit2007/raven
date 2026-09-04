/**
 * RAVEN Debug Center — Central Reactive State Store
 */

import { MILESTONES, MILESTONE_STATUS, PRIVACY_GATE_STATUS, CONNECTION_STATUS } from './types.js';

class RavenStore {
  constructor() {
    this.listeners = new Set();
    this.state = this.getInitialState();
  }

  getInitialState() {
    return {
      connection: {
        status: CONNECTION_STATUS.DISCONNECTED,
        endpoint: 'ws://localhost:8765',
        lastHeartbeat: null,
        error: null,
        reconnectAttempts: 0
      },
      telemetry: {
        iteration: 0,
        currentUrl: null,
        pageTitle: null,
        browserState: 'Waiting for browser connection',
        lastAction: null,
        lastStateChange: null,
        timestamp: new Date().toISOString()
      },
      milestones: {
        M1: {
          id: 'M1',
          name: MILESTONES.M1.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting viewport capture trigger',
          details: null
        },
        M2: {
          id: 'M2',
          name: MILESTONES.M2.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting DOM tree traversal',
          details: null
        },
        M3: {
          id: 'M3',
          name: MILESTONES.M3.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting visual region segmentation',
          details: null
        },
        M4: {
          id: 'M4',
          name: MILESTONES.M4.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting OCR text recognition',
          details: null
        },
        M5: {
          id: 'M5',
          name: MILESTONES.M5.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting sensitive entity & PII scan',
          details: null
        },
        M6: {
          id: 'M6',
          name: MILESTONES.M6.name,
          status: MILESTONE_STATUS.WAITING,
          executionTimeMs: 0,
          lastUpdated: null,
          summary: 'Awaiting perception fusion & sanitization pass',
          details: null
        }
      },
      browser: {
        url: null,
        title: null,
        state: 'Disconnected',
        iteration: 0,
        lastAction: null,
        lastStateChange: null,
        screenshotUrl: null
      },
      dom: {
        totalElements: 0,
        interactiveElements: 0,
        visibleElements: 0,
        roles: {},
        tree: [],
        rawSummary: null
      },
      vision: {
        regions: [],
        categories: {},
        activeLayer: 'annotated',
        sourceScreenshotUrl: null
      },
      privacy: {
        items: [],
        facesDetected: 0,
        piiDetected: 0,
        sensitiveRegions: 0,
        gateStatus: PRIVACY_GATE_STATUS.WAITING,
        // FIX: previously missing from initial state. This is the M5-redacted
        // (faces-blurred) full-page screenshot URL — VisionView prefers it
        // over the raw M1/M3 screenshot so the dashboard never shows an
        // un-redacted frame. See telemetryReceiver.js's M5_RESULT handler.
        screenshotUrl: null
      },
      ocr: {
        blocks: [],
        totalWords: 0,
        averageConfidence: 0
      },
      fusion: {
        inputsReceived: [],
        regionsMerged: 0,
        sensitiveRedacted: 0,
        sanitizedObservation: null,
        privacyGatePassed: false,
        leakCheckPassed: null
      },
      agent: {
        observationSent: null,
        requestTimestamp: null,
        geminiResponse: null,
        selectedAction: null,
        actionType: null,
        targetInfo: null,
        actionExecutionStatus: null,
        responseLatencyMs: null
      },
      timeline: [],
      health: {
        browser: CONNECTION_STATUS.DISCONNECTED,
        ravenCore: CONNECTION_STATUS.DISCONNECTED,
        milestones: CONNECTION_STATUS.WAITING,
        sanitization: CONNECTION_STATUS.WAITING,
        simpleUi: CONNECTION_STATUS.WAITING,
        gemini: CONNECTION_STATUS.WAITING,
        browserActions: CONNECTION_STATUS.WAITING
      }
    };
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('Error in store listener:', err);
      }
    }
  }

  // --- Store Actions ---

  setConnectionStatus(status, details = {}) {
    this.state.connection = {
      ...this.state.connection,
      status,
      lastHeartbeat: new Date().toISOString(),
      ...details
    };
    if (status === CONNECTION_STATUS.CONNECTED) {
      this.state.health.ravenCore = CONNECTION_STATUS.CONNECTED;
      this.state.health.browser = CONNECTION_STATUS.CONNECTED;
    } else if (status === CONNECTION_STATUS.DISCONNECTED) {
      this.state.health.ravenCore = CONNECTION_STATUS.DISCONNECTED;
      this.state.health.browser = CONNECTION_STATUS.DISCONNECTED;
    }
    this.notify();
  }

  updateMilestone(id, updateData) {
    if (this.state.milestones[id]) {
      this.state.milestones[id] = {
        ...this.state.milestones[id],
        ...updateData,
        lastUpdated: new Date().toISOString()
      };
      this.notify();
    }
  }

  updateBrowserState(data) {
    this.state.browser = {
      ...this.state.browser,
      ...data,
      lastStateChange: new Date().toISOString()
    };
    if (data.url) this.state.telemetry.currentUrl = data.url;
    if (data.title) this.state.telemetry.pageTitle = data.title;
    if (data.iteration !== undefined) this.state.telemetry.iteration = data.iteration;
    if (data.state) this.state.telemetry.browserState = data.state;
    if (data.lastAction) this.state.telemetry.lastAction = data.lastAction;
    this.notify();
  }

  updateDomData(data) {
    this.state.dom = {
      ...this.state.dom,
      ...data
    };
    this.notify();
  }

  updateVisionData(data) {
    this.state.vision = {
      ...this.state.vision,
      ...data
    };
    this.notify();
  }

  updateOcrData(data) {
    this.state.ocr = {
      ...this.state.ocr,
      ...data
    };
    this.notify();
  }

  updatePrivacyData(data) {
    this.state.privacy = {
      ...this.state.privacy,
      ...data
    };
    this.notify();
  }

  updateFusionData(data) {
    this.state.fusion = {
      ...this.state.fusion,
      ...data
    };
    this.notify();
  }

  updateAgentTelemetry(data) {
    this.state.agent = {
      ...this.state.agent,
      ...data
    };
    this.notify();
  }

  updateHealthLinks(links) {
    this.state.health = {
      ...this.state.health,
      ...links
    };
    this.notify();
  }

  addEvent(event) {
    const fullEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      component: event.component || 'SYSTEM',
      event: event.event || 'GENERIC_EVENT',
      status: event.status || 'info',
      latencyMs: event.latencyMs !== undefined ? event.latencyMs : null,
      metadata: event.metadata || null
    };
    // Keep up to 250 events in memory
    this.state.timeline = [fullEvent, ...this.state.timeline.slice(0, 249)];
    this.notify();
  }

  clearSession() {
    this.state = this.getInitialState();
    this.notify();
  }
}

export const store = new RavenStore();