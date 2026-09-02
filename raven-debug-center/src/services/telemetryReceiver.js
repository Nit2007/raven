/**
 * RAVEN Debug Center — Telemetry Receiver Service
 * Bridges incoming events via WebSocket, BroadcastChannel, and window.postMessage.
 */

import { store } from '../models/store.js';
import { CONNECTION_STATUS, MILESTONE_STATUS, PRIVACY_GATE_STATUS, EVENT_TYPES } from '../models/types.js';

class TelemetryReceiver {
  constructor() {
    this.ws = null;
    this.broadcastChannel = null;
    this.reconnectTimer = null;
    this.wsEndpoint = 'ws://localhost:8765';
    this.channelName = 'raven-telemetry';
    this.autoReconnect = true;
  }

  init() {
    this.setupBroadcastChannel();
    this.setupPostMessage();
    // Initially we remain disconnected as required by specification,
    // ready for user to connect or auto-connect when configured.
  }

  setupBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channelName);
        this.broadcastChannel.onmessage = (event) => {
          this.handleIncomingPayload(event.data, 'BroadcastChannel');
        };
        console.log(`[RAVEN Receiver] Listening on BroadcastChannel: ${this.channelName}`);
      } catch (e) {
        console.warn('[RAVEN Receiver] BroadcastChannel error:', e);
      }
    }
  }

  setupPostMessage() {
    window.addEventListener('message', (event) => {
      // Validate structure to avoid random window noise
      if (event.data && typeof event.data === 'object' && (event.data.raven || event.data.source === 'raven')) {
        this.handleIncomingPayload(event.data.payload || event.data, 'postMessage');
      }
    });
  }

  connectWebSocket(endpoint = this.wsEndpoint) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.wsEndpoint = endpoint;
    store.setConnectionStatus(CONNECTION_STATUS.CONNECTING, { endpoint: this.wsEndpoint });

    try {
      this.ws = new WebSocket(this.wsEndpoint);

      this.ws.onopen = () => {
        store.setConnectionStatus(CONNECTION_STATUS.CONNECTED, {
          endpoint: this.wsEndpoint,
          error: null
        });
        store.addEvent({
          component: 'TELEMETRY_BRIDGE',
          event: 'WEBSOCKET_CONNECTED',
          status: 'success',
          metadata: { endpoint: this.wsEndpoint }
        });
      };

      this.ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          this.handleIncomingPayload(data, 'WebSocket');
        } catch (err) {
          console.error('[RAVEN Receiver] Invalid JSON over WebSocket:', err);
        }
      };

      this.ws.onerror = (err) => {
        store.setConnectionStatus(CONNECTION_STATUS.ERROR, {
          error: 'Connection failed or server unreachable'
        });
      };

      this.ws.onclose = () => {
        store.setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
        if (this.autoReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      store.setConnectionStatus(CONNECTION_STATUS.ERROR, { error: e.message });
    }
  }

  disconnectWebSocket() {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    store.setConnectionStatus(CONNECTION_STATUS.DISCONNECTED);
    store.addEvent({
      component: 'TELEMETRY_BRIDGE',
      event: 'WEBSOCKET_DISCONNECTED',
      status: 'info'
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket(this.wsEndpoint);
    }, 3000);
  }

  /**
   * Universal message dispatcher for real incoming RAVEN events
   */
  handleIncomingPayload(data, source = 'Unknown') {
    if (!data || typeof data !== 'object') return;

    // Record incoming event to timeline if specified
    if (data.event || data.eventType) {
      const eventName = data.event || data.eventType;
      store.addEvent({
        component: data.component || this.inferComponent(eventName),
        event: eventName,
        status: data.status || 'info',
        latencyMs: data.latencyMs,
        metadata: data.metadata || data.payload
      });
    }

    // Route based on data type or milestone tag
    switch (data.type) {
      case 'BROWSER_STATE':
      case 'BROWSER_STATE_CHANGED':
        store.updateBrowserState(data.payload || data);
        break;

      case 'MILESTONE_UPDATE':
        if (data.milestoneId) {
          store.updateMilestone(data.milestoneId, data.payload || data);
        }
        break;

      case 'M1_CAPTURE':
      case 'M1_RESULT':
        store.updateMilestone('M1', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || 'Viewport captured',
          details: data.details || null
        });
        if (data.screenshotUrl) {
          store.updateBrowserState({ screenshotUrl: data.screenshotUrl });
        }
        break;

      case 'M2_DOM':
      case 'M2_RESULT':
        store.updateMilestone('M2', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || `${data.totalElements || 0} DOM elements indexed`,
          details: data.details || null
        });
        store.updateDomData({
          status: data.status || MILESTONE_STATUS.SUCCESS,
          perceptionCycleId: data.details?.perceptionCycleId || null,
          latencyMs: data.executionTimeMs || 0,
          totalElements: data.totalElements || data.details?.counts?.total || 0,
          interactiveElements: data.interactiveElements || data.details?.counts?.interactive || 0,
          visibleElements: data.visibleElements || data.details?.counts?.visible || 0,
          editableElements: data.details?.counts?.editable || 0,
          occludedElements: data.details?.counts?.occluded || 0,
          roles: data.roles || data.details?.roles || {},
          tree: data.tree || [],
          elements: data.tree || [],
          viewport: data.details?.viewport || null,
          error: data.details?.error || null,
          rawSummary: data.summary || null
        });
        break;

      case 'M3_VISION':
      case 'M3_RESULT':
        store.updateMilestone('M3', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || `${(data.regions || []).length} visual regions identified`,
          details: data.details || null
        });
        store.updateVisionData({
          regions: data.regions || [],
          categories: data.categories || {},
          sourceScreenshotUrl: data.screenshotUrl || null
        });
        break;

      case 'M4_OCR':
      case 'M4_RESULT':
        store.updateMilestone('M4', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || `${(data.blocks || []).length} OCR text blocks extracted`,
          details: data.details || null
        });
        store.updateOcrData({
          blocks: data.blocks || [],
          totalWords: data.totalWords || 0,
          averageConfidence: data.averageConfidence || 0
        });
        break;

      case 'M5_PII':
      case 'M5_RESULT':
        store.updateMilestone('M5', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || `${(data.items || []).length} sensitive entities tagged`,
          details: data.details || null
        });
        store.updatePrivacyData({
          items: data.items || [],
          facesDetected: data.facesDetected || 0,
          piiDetected: data.piiDetected || 0,
          sensitiveRegions: data.sensitiveRegions || 0,
          gateStatus: data.gateStatus || PRIVACY_GATE_STATUS.WAITING
        });
        break;

      case 'M6_FUSION':
      case 'M6_RESULT':
        store.updateMilestone('M6', {
          status: data.status || MILESTONE_STATUS.SUCCESS,
          executionTimeMs: data.executionTimeMs || 0,
          summary: data.summary || 'Perception fused & sanitized observation prepared',
          details: data.details || null
        });
        store.updateFusionData({
          inputsReceived: data.inputsReceived || [],
          regionsMerged: data.regionsMerged || 0,
          sensitiveRedacted: data.sensitiveRedacted || 0,
          sanitizedObservation: data.sanitizedObservation || null,
          privacyGatePassed: data.privacyGatePassed || false,
          leakCheckPassed: data.leakCheckPassed || true
        });
        break;

      case 'AGENT_TELEMETRY':
      case 'GEMINI_DECISION':
        store.updateAgentTelemetry(data.payload || data);
        break;

      case 'HEALTH_UPDATE':
        store.updateHealthLinks(data.payload || data);
        break;

      default:
        // Generic telemetry or unmapped payload
        break;
    }
  }

  inferComponent(eventName) {
    if (!eventName) return 'SYSTEM';
    if (eventName.startsWith('M1')) return 'M1_SCREENSHOT';
    if (eventName.startsWith('M2')) return 'M2_DOM';
    if (eventName.startsWith('M3')) return 'M3_VISION';
    if (eventName.startsWith('M4')) return 'M4_OCR';
    if (eventName.startsWith('M5')) return 'M5_PII';
    if (eventName.startsWith('M6')) return 'M6_FUSION';
    if (eventName.includes('SANITIZ') || eventName.includes('PRIVACY')) return 'PRIVACY_GATE';
    if (eventName.includes('AGENT') || eventName.includes('GEMINI')) return 'SIMPLE_UI_GEMINI';
    if (eventName.includes('ACTION') || eventName.includes('BROWSER')) return 'BROWSER_ACTION';
    return 'RAVEN_CORE';
  }

  /**
   * Diagnostic Link Probe — Sends a real ping probe through WebSocket or BroadcastChannel
   * to verify if a daemon/bridge is listening on the other side.
   */
  sendProbePing() {
    const pingMsg = {
      type: 'RAVEN_PROBE_PING',
      timestamp: new Date().toISOString(),
      client: 'RAVEN_DEBUG_CENTER'
    };

    let sent = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(pingMsg));
      sent = true;
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(pingMsg);
      sent = true;
    }

    store.addEvent({
      component: 'DIAGNOSTICS',
      event: 'LINK_PROBE_PING_SENT',
      status: sent ? 'info' : 'warning',
      metadata: { sent, wsReady: this.ws ? this.ws.readyState : -1 }
    });

    return sent;
  }
}

export const telemetryReceiver = new TelemetryReceiver();
