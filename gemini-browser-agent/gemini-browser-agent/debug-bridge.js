/**
 * debug-bridge.js — Extension-to-Dashboard Telemetry Forwarder
 * Injected strictly into RAVEN Debug Center tabs (http://localhost:5173/* and http://127.0.0.1:5173/*).
 * Bidirectional bridge:
 * 1. Extension -> Window: Forwards telemetry packets to window.postMessage.
 * 2. Window -> Extension: Allows the Debug Center to trigger actions (like M1 capture) via chrome.runtime.
 */
(function () {
  // 1. Extension -> Window postMessage
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.ravenTelemetry) {
      window.postMessage({ raven: true, payload: msg.payload }, '*');
    }
  });

  // 2. Window postMessage -> Extension
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'RAVEN_TRIGGER_M1') {
      chrome.runtime.sendMessage({ type: 'TRIGGER_M1' });
    } else if (event.data && event.data.type === 'RAVEN_TRIGGER_M2') {
      chrome.runtime.sendMessage({ type: 'TRIGGER_M2' });
    } else if (event.data && event.data.type === 'RAVEN_TRIGGER_M5') {
      chrome.runtime.sendMessage({ type: 'TRIGGER_M5' });
    }
  });
})();