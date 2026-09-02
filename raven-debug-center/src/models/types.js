/**
 * RAVEN Debug Center — Data Types, Milestone Constants & Status Enums
 */

export const MILESTONES = {
  M1: {
    id: 'M1',
    code: 'M1',
    name: 'Screenshot / Viewport Capture',
    shortName: 'Screenshot',
    description: 'Captures full active tab viewport or screen bitmap for perception inputs'
  },
  M2: {
    id: 'M2',
    code: 'M2',
    name: 'DOM Analysis',
    shortName: 'DOM',
    description: 'Traverses interactive/visible DOM nodes, extracts ARIA roles, semantics and layout bounds'
  },
  M3: {
    id: 'M3',
    code: 'M3',
    name: 'Local Vision Perception',
    shortName: 'Vision',
    description: 'Local computer-vision models detect visual clusters, UI icons, banners, and layout blocks'
  },
  M4: {
    id: 'M4',
    code: 'M4',
    name: 'OCR (Text Detection)',
    shortName: 'OCR',
    description: 'Local Optical Character Recognition extracts on-screen text coordinates and text blocks'
  },
  M5: {
    id: 'M5',
    code: 'M5',
    name: 'Face + PII / Sensitive Detection',
    shortName: 'Privacy / PII',
    description: 'Detects personal identifiable data, faces, financial entries, and secrets prior to LLM release'
  },
  M6: {
    id: 'M6',
    code: 'M6',
    name: 'Perception Fusion + Redaction + Sanitization',
    shortName: 'Fusion & Sanitization',
    description: 'Merges multi-modal perception streams, redacts sensitive bounding boxes and validates privacy gate'
  }
};

export const MILESTONE_STATUS = {
  WAITING: 'waiting',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
};

export const PRIVACY_GATE_STATUS = {
  WAITING: 'waiting',
  VERIFYING: 'verifying',
  PASSED: 'passed',
  BREACH_DETECTED: 'breach_detected',
  BYPASSED: 'bypassed_error'
};

export const PII_STAGE = {
  DETECTED: 'detected',
  REDACTED: 'redacted',
  SANITIZED: 'sanitized'
};

export const EVENT_TYPES = {
  M1_CAPTURE_STARTED: 'M1_CAPTURE_STARTED',
  M1_CAPTURE_COMPLETED: 'M1_CAPTURE_COMPLETED',
  M2_DOM_STARTED: 'M2_DOM_STARTED',
  M2_DOM_COMPLETED: 'M2_DOM_COMPLETED',
  M3_VISION_COMPLETED: 'M3_VISION_COMPLETED',
  M4_OCR_COMPLETED: 'M4_OCR_COMPLETED',
  M5_PII_COMPLETED: 'M5_PII_COMPLETED',
  M6_FUSION_COMPLETED: 'M6_FUSION_COMPLETED',
  SANITIZED_OBSERVATION_CREATED: 'SANITIZED_OBSERVATION_CREATED',
  OBSERVATION_SENT_TO_AGENT: 'OBSERVATION_SENT_TO_AGENT',
  GEMINI_DECISION_RECEIVED: 'GEMINI_DECISION_RECEIVED',
  ACTION_STARTED: 'ACTION_STARTED',
  ACTION_COMPLETED: 'ACTION_COMPLETED',
  BROWSER_STATE_CHANGED: 'BROWSER_STATE_CHANGED',
  NEW_PERCEPTION_CYCLE: 'NEW_PERCEPTION_CYCLE',
  SYSTEM_STATUS_CHANGE: 'SYSTEM_STATUS_CHANGE',
  SECURITY_WARNING: 'SECURITY_WARNING'
};

export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  WAITING: 'waiting'
};
