/**
 * tests/code-editor-typing.test.js — Generic Code Editor Perception & Typing Test Suite
 * 
 * Verifies:
 * - Test 1: Monaco Editor discovery in extractElements (type="code-editor", actionable=true, clickable=true)
 * - Test 2: CodeMirror 6 and Ace Editor discovery
 * - Test 3: Typing code into Monaco Editor via native text insertion (does NOT throw "Target element is not editable")
 * - Test 4: Typing targeted at inner .view-line resolves to parent Monaco editor and types successfully
 * - Test 5: Typing into CodeMirror 6 (contenteditable)
 * - Test 6: Typing into Ace Editor (proxy textarea)
 * - Test 7: Press action (e.g. ENTER, TAB) inside code editor dispatches directly to proxy input
 * - Test 8: Click action inside code editor focuses proxy inputarea
 * - Test 9: Regression safety: normal <input>, <textarea>, and standard [contenteditable] work identically
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to construct lightweight mock DOM Node
function createMockElement(tag, options = {}) {
  const attributes = new Map(Object.entries(options.attrs || {}));
  const classList = new Set((options.classes || []));
  const style = {
    display: options.style?.display || 'block',
    visibility: options.style?.visibility || 'visible',
    opacity: options.style?.opacity !== undefined ? String(options.style.opacity) : '1',
    cursor: options.style?.cursor || 'default'
  };

  const listeners = new Map();
  const children = [];
  let parent = null;

  const el = {
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    nodeType: 1,
    id: options.id || '',
    get innerText() {
      if (options.text !== undefined) return options.text;
      return children.map(c => c.innerText).filter(Boolean).join(' ').trim();
    },
    set innerText(v) {
      options.text = v;
    },
    get textContent() {
      if (options.text !== undefined) return options.text;
      return children.map(c => c.textContent).filter(Boolean).join(' ').trim();
    },
    set textContent(v) {
      options.text = v;
    },
    get value() {
      return this._value !== undefined ? this._value : '';
    },
    set value(v) {
      this._value = v;
    },
    checked: options.checked || false,
    selected: options.selected || false,
    isContentEditable: options.isContentEditable || false,
    form: options.form || null,

    get classList() {
      return {
        contains: (c) => classList.has(c),
        add: (c) => classList.add(c),
        remove: (c) => classList.delete(c)
      };
    },

    getAttribute(name) {
      if (name === 'class') return Array.from(classList).join(' ');
      return attributes.get(name) || null;
    },
    setAttribute(name, val) {
      if (name === 'class') {
        classList.clear();
        (val || '').split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
      }
      attributes.set(name, String(val));
    },
    hasAttribute(name) {
      if (name === 'class') return classList.size > 0;
      return attributes.has(name);
    },
    removeAttribute(name) {
      if (name === 'class') classList.clear();
      attributes.delete(name);
    },

    getBoundingClientRect() {
      return {
        left: options.rect?.left ?? 100,
        top: options.rect?.top ?? 100,
        right: (options.rect?.left ?? 100) + (options.rect?.width ?? 400),
        bottom: (options.rect?.top ?? 100) + (options.rect?.height ?? 300),
        width: options.rect?.width ?? 400,
        height: options.rect?.height ?? 300
      };
    },

    get parentElement() {
      return parent;
    },
    get children() {
      return children;
    },

    appendChild(child) {
      child._setParent(this);
      children.push(child);
      return child;
    },
    _setParent(p) {
      parent = p;
    },

    matches(selector) {
      const parts = selector.split(',').map(s => s.trim());
      for (const part of parts) {
        if (part.startsWith('.')) {
          if (classList.has(part.slice(1))) return true;
        } else if (part.startsWith('#')) {
          if (this.id === part.slice(1)) return true;
        } else if (part.startsWith('[') && part.endsWith(']')) {
          const attrExp = part.slice(1, -1);
          if (attrExp.includes('=')) {
            const [k, v] = attrExp.split('=');
            const cleanVal = v.replace(/["']/g, '');
            if (this.getAttribute(k) === cleanVal) return true;
          } else if (this.hasAttribute(attrExp)) {
            return true;
          }
        } else if (part.toLowerCase() === tag.toLowerCase()) {
          return true;
        }
      }
      return false;
    },

    closest(selector) {
      let curr = this;
      while (curr) {
        if (curr.matches && curr.matches(selector)) return curr;
        curr = curr.parentElement;
      }
      return null;
    },

    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    },

    querySelectorAll(selector) {
      const results = [];
      function recurse(node) {
        for (const c of node.children) {
          if (c.matches && c.matches(selector)) results.push(c);
          recurse(c);
        }
      }
      recurse(this);
      return results;
    },

    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter(f => f !== fn));
    },

    dispatchEvent(evt) {
      evt.target = this;
      evt.currentTarget = this;
      const fns = listeners.get(evt.type) || [];
      for (const fn of fns) fn.call(this, evt);
      if (evt.bubbles && parent) {
        parent.dispatchEvent(evt);
      }
      return !evt.defaultPrevented;
    },

    scrollIntoView(opts) {
      this._scrolled = true;
    },

    focus() {
      this._focused = true;
      if (globalThis._mockDocument) {
        globalThis._mockDocument.activeElement = this;
      }
    },

    click() {
      this._clicked = true;
      this.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
    },

    _style: style,
    _listeners: listeners
  };

  return el;
}

// Setup full mock browser environment
function setupMockBrowser() {
  const root = createMockElement('body');
  const allNodes = [root];

  const doc = {
    body: root,
    documentElement: createMockElement('html'),
    title: 'LeetCode Two Sum',
    activeElement: root,
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => allNodes.find(n => n.id === id) || null,
    querySelector: (sel) => root.querySelector(sel),
    querySelectorAll: (sel) => root.querySelectorAll(sel),
    createTreeWalker: (rootNode) => {
      const textNodes = [];
      function collectText(node) {
        if (node.innerText) textNodes.push({ textContent: node.innerText });
        for (const c of node.children) collectText(c);
      }
      collectText(rootNode);
      let idx = 0;
      return {
        nextNode: () => idx < textNodes.length ? textNodes[idx++] : null
      };
    },
    execCommandHistory: [],
    execCommand(cmd, showUI, value) {
      this.execCommandHistory.push({ cmd, value, target: this.activeElement });
      if (cmd === 'insertText' && this.activeElement) {
        if ('value' in this.activeElement) {
          this.activeElement.value = value;
        } else {
          this.activeElement.innerText = value;
        }
        this.activeElement.dispatchEvent({ type: 'input', bubbles: true, inputType: 'insertText', data: value });
      }
      return true;
    },
    queryCommandSupported: () => true
  };

  globalThis._mockDocument = doc;

  const win = {
    document: doc,
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    scrollX: 0,
    scrollY: 0,
    scrollBy: () => {},
    getComputedStyle: (el) => el._style || { display: 'block', visibility: 'visible', opacity: '1', cursor: 'default' },
    Event: class MockEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = opts.bubbles || false;
      }
    },
    CustomEvent: class MockCustomEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.detail = opts.detail;
        this.bubbles = opts.bubbles || false;
      }
    },
    MouseEvent: class MockMouseEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.bubbles = opts.bubbles || false;
      }
    },
    KeyboardEvent: class MockKeyboardEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.key = opts.key;
        this.code = opts.code;
        this.bubbles = opts.bubbles || false;
      }
    },
    InputEvent: class MockInputEvent {
      constructor(type, opts = {}) {
        this.type = type;
        this.inputType = opts.inputType;
        this.data = opts.data;
        this.bubbles = opts.bubbles || false;
      }
    },
    location: { href: 'https://leetcode.com/problems/two-sum/description/' }
  };

  const chromeMock = {
    runtime: {
      onMessage: {
        addListener: () => {},
        removeListener: () => {}
      }
    }
  };

  class MockHTMLTextAreaElement {}
  class MockHTMLInputElement {}
  class MockElement {}
  class MockNode {}

  Object.defineProperty(MockHTMLTextAreaElement.prototype, 'value', {
    get() { return this._value !== undefined ? this._value : ''; },
    set(v) { this._value = v; },
    configurable: true
  });
  Object.defineProperty(MockHTMLInputElement.prototype, 'value', {
    get() { return this._value !== undefined ? this._value : ''; },
    set(v) { this._value = v; },
    configurable: true
  });

  win.HTMLTextAreaElement = MockHTMLTextAreaElement;
  win.HTMLInputElement = MockHTMLInputElement;
  win.Element = MockElement;
  win.Node = MockNode;

  return { root, doc, win, chromeMock, MockHTMLTextAreaElement, MockHTMLInputElement };
}

// Load content.js script in isolated context
function loadContentScript(env) {
  const contentJsPath = path.resolve(__dirname, '../gemini-browser-agent/gemini-browser-agent/content.js');
  const code = fs.readFileSync(contentJsPath, 'utf8');

  const fn = new Function(
    'window', 'document', 'chrome', 'location', 'CSS',
    'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent',
    'HTMLTextAreaElement', 'HTMLInputElement', 'Element', 'Node',
    `
    ${code}
    return window.__ravenContentHelpers;
  `);

  return fn(
    env.win, env.doc, env.chromeMock, env.win.location, { escape: (s) => s },
    env.win.Event, env.win.CustomEvent, env.win.MouseEvent, env.win.KeyboardEvent, env.win.InputEvent,
    env.MockHTMLTextAreaElement, env.MockHTMLInputElement, env.win.Element, env.win.Node
  );
}

// --- TESTS ---

test('Test 1: Monaco Editor discovery in extractElements', () => {
  const env = setupMockBrowser();

  // Create Monaco Editor structure as found on LeetCode
  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    attrs: { 'data-mode-id': 'cpp', 'aria-label': 'C++ Code Editor' },
    rect: { left: 800, top: 120, width: 800, height: 600 }
  });

  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea', 'monaco-mouse-cursor-text'],
    style: { opacity: 0 },
    rect: { left: 800, top: 120, width: 1, height: 1 }
  });

  const viewLines = createMockElement('div', {
    classes: ['view-lines'],
    text: 'class Solution { public: vector<int> twoSum... }'
  });

  monacoContainer.appendChild(hiddenTextarea);
  monacoContainer.appendChild(viewLines);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  const elements = helpers.extractElements();

  const editorItem = elements.find(e => e.type === 'code-editor' || e.role === 'code-editor');
  assert.ok(editorItem, 'Monaco editor must be indexed in elements');
  assert.equal(editorItem.type, 'code-editor');
  assert.equal(editorItem.actionable, true);
  assert.equal(editorItem.clickable, true);
  assert.ok(editorItem.text.includes('class Solution'), 'Should extract preview code');
  assert.ok(editorItem.accessible_name.includes('Code Editor'), 'Should identify Code Editor');
});

test('Test 2: CodeMirror 6 and Ace Editor discovery', () => {
  const env = setupMockBrowser();

  // CodeMirror 6
  const cm6Container = createMockElement('div', {
    classes: ['cm-editor'],
    attrs: { 'data-mode-id': 'python' },
    rect: { left: 50, top: 50, width: 600, height: 400 }
  });
  const cm6Content = createMockElement('div', {
    classes: ['cm-content'],
    attrs: { contenteditable: 'true', role: 'textbox' },
    text: 'def twoSum(nums, target): pass'
  });
  cm6Container.appendChild(cm6Content);
  env.root.appendChild(cm6Container);

  // Ace Editor
  const aceContainer = createMockElement('div', {
    classes: ['ace_editor'],
    attrs: { 'aria-label': 'Ace Python' },
    rect: { left: 50, top: 500, width: 600, height: 400 }
  });
  const aceTextarea = createMockElement('textarea', {
    classes: ['ace_text-input'],
    style: { opacity: 0 }
  });
  const aceScroller = createMockElement('div', {
    classes: ['ace_scroller'],
    text: 'x = 42'
  });
  aceContainer.appendChild(aceTextarea);
  aceContainer.appendChild(aceScroller);
  env.root.appendChild(aceContainer);

  const helpers = loadContentScript(env);
  const elements = helpers.extractElements();

  const cm6Item = elements.find(e => e.tag.toLowerCase() === 'div' && (e.accessible_name?.includes('PYTHON') || e.text?.includes('def twoSum')));
  const aceItem = elements.find(e => e.accessible_name?.includes('Ace Python') || e.text?.includes('x = 42'));

  assert.ok(cm6Item, 'CodeMirror 6 editor must be extracted');
  assert.equal(cm6Item.type, 'code-editor');
  assert.ok(aceItem, 'Ace editor must be extracted');
  assert.equal(aceItem.type, 'code-editor');
});

test('Test 3: Typing code into Monaco Editor succeeds via native text insertion', async () => {
  const env = setupMockBrowser();

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    attrs: { 'data-mode-id': 'cpp' },
    rect: { left: 800, top: 120, width: 800, height: 600 }
  });
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea', 'monaco-mouse-cursor-text'],
    style: { opacity: 0 }
  });
  monacoContainer.appendChild(hiddenTextarea);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  const elements = helpers.extractElements();
  const editorTargetId = elements[0].target_id;

  const codeToType = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); ++i) {
            int comp = target - nums[i];
            if (seen.count(comp)) return {seen[comp], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};`;

  // Must NOT throw "Target element is not editable"
  await helpers.executeAction({
    action: 'type',
    target_id: editorTargetId,
    value: codeToType
  });

  // Verify that document.execCommand was invoked with selectAll and insertText
  const history = env.doc.execCommandHistory;
  const selectAll = history.find(h => h.cmd === 'selectAll');
  const insertText = history.find(h => h.cmd === 'insertText');

  assert.ok(selectAll, 'Should selectAll existing code prior to typing');
  assert.ok(insertText, 'Should call insertText');
  assert.equal(insertText.value, codeToType, 'Exact code content must be inserted');
  assert.equal(hiddenTextarea._focused, true, 'Proxy textarea must receive focus');
});

test('Test 4: Typing targeted at inner .view-line resolves to parent Monaco editor', async () => {
  const env = setupMockBrowser();

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    rect: { left: 800, top: 120, width: 800, height: 600 }
  });
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea'],
    style: { opacity: 0 }
  });
  const lineDiv = createMockElement('div', {
    classes: ['view-line'],
    text: 'return {};'
  });
  monacoContainer.appendChild(hiddenTextarea);
  monacoContainer.appendChild(lineDiv);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  
  // Assign target_id to the inner line div
  lineDiv.setAttribute('data-agent-id', 'el-inner-line');

  // Typing on the inner line must cleanly resolve to the containing Monaco editor
  await helpers.executeAction({
    action: 'type',
    target_id: 'el-inner-line',
    value: 'return {0, 1};'
  });

  const insertText = env.doc.execCommandHistory.find(h => h.cmd === 'insertText');
  assert.ok(insertText, 'Should type into editor even when targeting inner view line');
  assert.equal(insertText.value, 'return {0, 1};');
});

test('Test 5: Typing into CodeMirror 6 contenteditable editor', async () => {
  const env = setupMockBrowser();

  const cm6Container = createMockElement('div', {
    classes: ['cm-editor'],
    rect: { left: 100, top: 100, width: 600, height: 400 }
  });
  const cm6Content = createMockElement('div', {
    classes: ['cm-content'],
    attrs: { contenteditable: 'true' },
    isContentEditable: true
  });
  cm6Container.appendChild(cm6Content);
  env.root.appendChild(cm6Container);

  const helpers = loadContentScript(env);
  const elements = helpers.extractElements();
  const targetId = elements[0].target_id;

  await helpers.executeAction({
    action: 'type',
    target_id: targetId,
    value: 'print("hello world")'
  });

  const insertText = env.doc.execCommandHistory.find(h => h.cmd === 'insertText');
  assert.ok(insertText, 'Should insert text into CodeMirror 6');
  assert.equal(insertText.value, 'print("hello world")');
});

test('Test 6: Typing into Ace Editor proxy textarea', async () => {
  const env = setupMockBrowser();

  const aceContainer = createMockElement('div', {
    classes: ['ace_editor'],
    rect: { left: 100, top: 100, width: 600, height: 400 }
  });
  const aceTextarea = createMockElement('textarea', {
    classes: ['ace_text-input'],
    style: { opacity: 0 }
  });
  aceContainer.appendChild(aceTextarea);
  env.root.appendChild(aceContainer);

  const helpers = loadContentScript(env);
  const elements = helpers.extractElements();
  const targetId = elements[0].target_id;

  await helpers.executeAction({
    action: 'type',
    target_id: targetId,
    value: 'select * from users;'
  });

  const insertText = env.doc.execCommandHistory.find(h => h.cmd === 'insertText');
  assert.ok(insertText, 'Should insert text into Ace editor');
  assert.equal(insertText.value, 'select * from users;');
});

test('Test 7: Press action inside code editor dispatches directly to proxy input', async () => {
  const env = setupMockBrowser();

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    rect: { left: 800, top: 120, width: 800, height: 600 }
  });
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea'],
    style: { opacity: 0 }
  });
  monacoContainer.appendChild(hiddenTextarea);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  monacoContainer.setAttribute('data-agent-id', 'el-editor');

  const keyEvents = [];
  hiddenTextarea.addEventListener('keydown', (e) => keyEvents.push(e));

  await helpers.executeAction({
    action: 'press',
    target_id: 'el-editor',
    value: 'ENTER'
  });

  assert.equal(keyEvents.length, 1, 'Proxy textarea must receive keydown event');
  assert.equal(keyEvents[0].key, 'Enter');
});

test('Test 8: Click action inside code editor focuses proxy inputarea', async () => {
  const env = setupMockBrowser();

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    rect: { left: 800, top: 120, width: 800, height: 600 }
  });
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea'],
    style: { opacity: 0 }
  });
  monacoContainer.appendChild(hiddenTextarea);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  monacoContainer.setAttribute('data-agent-id', 'el-editor');

  await helpers.executeAction({
    action: 'click',
    target_id: 'el-editor'
  });

  assert.equal(monacoContainer._clicked, true, 'Container should be clicked');
  assert.equal(hiddenTextarea._focused, true, 'Proxy textarea should receive focus');
});

test('Test 9: Regression safety: normal <input>, <textarea>, and [contenteditable] work identically', async () => {
  const env = setupMockBrowser();

  const normalInput = createMockElement('input', {
    attrs: { type: 'text', name: 'search_field' },
    value: 'old_value',
    rect: { left: 20, top: 20, width: 200, height: 30 }
  });
  Object.setPrototypeOf(normalInput, env.MockHTMLInputElement.prototype);
  normalInput._value = 'old_value';
  normalInput.setAttribute('data-agent-id', 'el-normal-input');
  env.root.appendChild(normalInput);

  const normalTextarea = createMockElement('textarea', {
    value: 'old_text',
    rect: { left: 20, top: 70, width: 300, height: 100 }
  });
  Object.setPrototypeOf(normalTextarea, env.MockHTMLTextAreaElement.prototype);
  normalTextarea._value = 'old_text';
  normalTextarea.setAttribute('data-agent-id', 'el-normal-textarea');
  env.root.appendChild(normalTextarea);

  const helpers = loadContentScript(env);

  // Type into normal input
  await helpers.executeAction({
    action: 'type',
    target_id: 'el-normal-input',
    value: 'two sum solution'
  });
  assert.equal(normalInput.value, 'two sum solution', 'Standard input value must update');

  // Type into normal textarea
  await helpers.executeAction({
    action: 'type',
    target_id: 'el-normal-textarea',
    value: 'notes about algorithm'
  });
  assert.equal(normalTextarea.value, 'notes about algorithm', 'Standard textarea value must update');
});

test('Test 10: Solution code auto-wrapping preserves and formats class Solution for LeetCode', async () => {
  const env = setupMockBrowser();

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor'],
    attrs: { 'role': 'code' }
  });
  const lines = createMockElement('div', {
    classes: ['view-lines'],
    text: 'class Solution {\npublic:\n    int minimumDistance(vector<int>& nums) {\n        \n    }\n};'
  });
  monacoContainer.appendChild(lines);
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea'],
    style: { opacity: 0 }
  });
  Object.setPrototypeOf(hiddenTextarea, env.MockHTMLTextAreaElement.prototype);
  monacoContainer.appendChild(hiddenTextarea);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  monacoContainer.setAttribute('data-agent-id', 'el-solution-editor');

  // Case A: Model outputs raw function without class Solution
  const unwrappedCode = 'int minimumDistance(vector<int>& nums) {\n    return 6;\n}';
  await helpers.executeAction({
    action: 'type',
    target_id: 'el-solution-editor',
    value: unwrappedCode
  });

  assert.match(hiddenTextarea.value, /class\s+Solution\s*\{/, 'Must auto-wrap with class Solution');
  assert.match(hiddenTextarea.value, /public:/, 'Must contain public:');
  assert.match(hiddenTextarea.value, /int minimumDistance/, 'Must contain function');
  assert.match(hiddenTextarea.value, /\};/, 'Must close class Solution with };');

  // Case B: Model outputs code already wrapped in class Solution
  const fullCode = 'class Solution {\npublic:\n    int minimumDistance(vector<int>& nums) {\n        return 6;\n    }\n};';
  await helpers.executeAction({
    action: 'type',
    target_id: 'el-solution-editor',
    value: fullCode
  });
  // Should NOT duplicate class Solution
  const count = (hiddenTextarea.value.match(/class\s+Solution/g) || []).length;
  assert.equal(count, 1, 'Must not duplicate class Solution if already present');
});

test('Test 11: Main-world messaging SET_EDITOR_VALUE_MAIN_WORLD succeeds', async () => {
  const env = setupMockBrowser();

  let sentMessage = null;
  env.chromeMock.runtime.sendMessage = (msg, callback) => {
    sentMessage = msg;
    if (callback) callback({ ok: true, result: { ok: true, engine: 'monaco-models' } });
  };

  const monacoContainer = createMockElement('div', {
    classes: ['monaco-editor']
  });
  const hiddenTextarea = createMockElement('textarea', {
    classes: ['inputarea']
  });
  Object.setPrototypeOf(hiddenTextarea, env.MockHTMLTextAreaElement.prototype);
  monacoContainer.appendChild(hiddenTextarea);
  env.root.appendChild(monacoContainer);

  const helpers = loadContentScript(env);
  monacoContainer.setAttribute('data-agent-id', 'el-mainworld-editor');

  await helpers.executeAction({
    action: 'type',
    target_id: 'el-mainworld-editor',
    value: 'class Solution { public: int test() { return 0; } };'
  });

  assert.ok(sentMessage, 'Must send SET_EDITOR_VALUE_MAIN_WORLD message');
  assert.equal(sentMessage.type, 'SET_EDITOR_VALUE_MAIN_WORLD');
  assert.match(sentMessage.code, /class Solution/);
});
