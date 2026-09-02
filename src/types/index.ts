// src/types/index.ts
// Core generic data types for PilotRaven browser agent

export type UniversalActionType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'navigate'
  | 'select'
  | 'check'
  | 'press'
  | 'wait'
  | 'back'
  | 'forward'
  | 'look'
  | 'done';

export type AgentStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RECOVERING'
  | 'WAITING_FOR_USER'
  | 'BLOCKED'
  | 'AI_UNAVAILABLE'
  | 'STOPPED';

export interface PageElement {
  id: string; // el_1, el_2, ...
  tag: string; // button, input, a, select, textarea, div, etc.
  role: string; // button, textbox, link, combobox, heading, dialog, checkbox, etc.
  text: string; // visible text content
  aria_label?: string; // aria-label attribute
  placeholder?: string; // input placeholder
  name?: string; // form field name attribute
  type?: string; // input type (text, email, search, submit, etc.)
  value?: string; // current value (redacted if sensitive)
  href?: string; // link destination
  visible: boolean; // whether element is visible in viewport
  enabled: boolean; // whether element is enabled / not disabled
  editable: boolean; // whether element accepts text input
  bbox?: [number, number, number, number]; // [x, y, width, height]
  parent_text?: string; // nearby/parent text for context
  ordinal?: number; // position in lists (1st, 2nd, 3rd)
}

export interface CompactPageState {
  url: string;
  title: string;
  elements: PageElement[];
  headings?: string[];
  text_snippet?: string;
  has_modal?: boolean;
  modal_text?: string;
  observation_id?: string;
  timestamp?: number;
}

export interface AgentAction {
  action: UniversalActionType;
  target_element_id?: string;
  target_hint?: string;
  value?: string;
  text?: string;
  url?: string;
  direction?: 'up' | 'down';
  wait_ms?: number;
  thought?: string;
  reason?: string;
  confidence?: number;
  memory?: string;
  iterations_remaining?: number;
}

export interface ActionHistoryEntry {
  step: number;
  action: UniversalActionType;
  target_id?: string;
  value?: string;
  result: 'success' | 'failed' | 'no_change';
  url_before?: string;
  url_after?: string;
  thought?: string;
  error?: string;
}
