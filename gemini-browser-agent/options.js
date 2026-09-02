const keysEl = document.getElementById('keys');
const modelsEl = document.getElementById('models');
const baseUrlEl = document.getElementById('baseUrl');
const maxIterationsEl = document.getElementById('maxIterations');
const stepDelayMsEl = document.getElementById('stepDelayMs');
const maxStepRetriesEl = document.getElementById('maxStepRetries');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');
const resetBtn = document.getElementById('resetBtn');
const savedMsg = document.getElementById('savedMsg');

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-1.5-pro'];
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

async function load() {
  const data = await chrome.storage.local.get([
    'geminiApiKeys',
    'geminiModels',
    'geminiBaseUrl',
    'maxIterations',
    'stepDelayMs',
    'maxStepRetries'
  ]);

  keysEl.value = (data.geminiApiKeys || []).join('\n');
  modelsEl.value = (data.geminiModels && data.geminiModels.length ? data.geminiModels : DEFAULT_MODELS).join('\n');
  baseUrlEl.value = data.geminiBaseUrl || DEFAULT_BASE_URL;
  maxIterationsEl.value = data.maxIterations ?? 25;
  stepDelayMsEl.value = data.stepDelayMs ?? 400;
  maxStepRetriesEl.value = data.maxStepRetries ?? 3;
}

saveBtn.addEventListener('click', async () => {
  const keys = keysEl.value
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);

  const models = modelsEl.value
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean);

  const baseUrl = baseUrlEl.value.trim() || DEFAULT_BASE_URL;
  const maxIterations = parseInt(maxIterationsEl.value, 10) || 25;
  const stepDelayMs = parseInt(stepDelayMsEl.value, 10) || 400;
  const maxStepRetries = parseInt(maxStepRetriesEl.value, 10) || 3;

  await chrome.storage.local.set({
    geminiApiKeys: keys,
    geminiKeyIndex: 0,
    geminiModels: models.length ? models : DEFAULT_MODELS,
    geminiBaseUrl: baseUrl,
    maxIterations,
    stepDelayMs,
    maxStepRetries
  });

  showMessage(`Saved! (${keys.length} key${keys.length === 1 ? '' : 's'}, ${models.length} model${models.length === 1 ? '' : 's'})`, 'success');
});

testBtn.addEventListener('click', async () => {
  const keys = keysEl.value
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean);

  if (!keys.length) {
    showMessage('Please enter at least one API key first.', 'error');
    return;
  }

  const models = modelsEl.value
    .split('\n')
    .map((m) => m.trim())
    .filter(Boolean);
  const testModel = models[0] || 'gemini-2.5-flash';
  const baseUrl = baseUrlEl.value.trim() || DEFAULT_BASE_URL;

  showMessage('Testing connection to Gemini API...', 'info');
  testBtn.disabled = true;

  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'TEST_API_KEY', key: keys[0], model: testModel, baseUrl },
        resolve
      );
    });

    if (res && res.ok) {
      showMessage(`Connection successful with ${testModel}!`, 'success');
    } else {
      showMessage(`Connection failed: ${res?.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    showMessage(`Error: ${err.message}`, 'error');
  } finally {
    testBtn.disabled = false;
  }
});

resetBtn.addEventListener('click', async () => {
  modelsEl.value = DEFAULT_MODELS.join('\n');
  baseUrlEl.value = DEFAULT_BASE_URL;
  maxIterationsEl.value = 25;
  stepDelayMsEl.value = 400;
  maxStepRetriesEl.value = 3;
  showMessage('Reset form to defaults. Click "Save Settings" to persist.', 'info');
});

function showMessage(msg, type = 'info') {
  savedMsg.textContent = msg;
  savedMsg.className = `status-msg ${type}`;
  if (type === 'success') {
    setTimeout(() => {
      if (savedMsg.textContent === msg) savedMsg.textContent = '';
    }, 4000);
  }
}

load();
