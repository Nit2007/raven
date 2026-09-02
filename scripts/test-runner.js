import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseJsonLikeAction, normalizeSingleAction, buildSingleActionPrompt } from '../gemini-browser-agent/gemini-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const extDir = join(rootDir, 'gemini-browser-agent');

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  \x1b[32m✔\x1b[0m ${description}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖\x1b[0m ${description}`);
    failed++;
  }
}

console.log('\x1b[36m====================================================\x1b[0m');
console.log('\x1b[36m🧪 Running Gemini Browser Agent Verification Tests\x1b[0m');
console.log('\x1b[36m====================================================\x1b[0m');

console.log('\n\x1b[1m1. Verifying File Existence & Structure\x1b[0m');
const requiredFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'gemini-client.js',
  'options.html',
  'options.js',
  'options.css',
  'popup.html',
  'popup.js',
  'popup.css',
  'vision-redact.js',
  'vendor/mediapipe/vision_bundle.mjs',
  'vendor/mediapipe/models/blaze_face_short_range.tflite',
  'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'vendor/mediapipe/wasm/vision_wasm_module_internal.wasm'
];

for (const f of requiredFiles) {
  const p = join(extDir, f);
  assert(existsSync(p), `Required file exists: ${f}`);
}

console.log('\n\x1b[1m2. Validating manifest.json\x1b[0m');
try {
  const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version is 3');
  assert(manifest.background?.service_worker === 'background.js', 'Service worker defined');
  assert(manifest.action?.default_popup === 'popup.html', 'Default popup defined');
  assert(manifest.permissions?.includes('storage'), 'Storage permission declared');
  assert(manifest.permissions?.includes('scripting'), 'Scripting permission declared');
} catch (e) {
  assert(false, `manifest.json parsing: ${e.message}`);
}

console.log('\n\x1b[1m3. Syntax Check on JavaScript Files\x1b[0m');
const jsFiles = [
  'background.js',
  'content.js',
  'gemini-client.js',
  'options.js',
  'popup.js',
  'vision-redact.js'
];

for (const js of jsFiles) {
  try {
    execSync(`node --check "${join(extDir, js)}"`, { stdio: 'pipe' });
    assert(true, `Syntax valid: ${js}`);
  } catch (err) {
    assert(false, `Syntax error in ${js}: ${err.message}`);
  }
}

console.log('\n\x1b[1m4. Testing Gemini Client Parsing & Normalization\x1b[0m');
try {
  const rawResponse = '```json\n{"thought": "Click the submit button", "action": "click", "target_id": "el-5", "iterations_remaining": 2, "memory": "Clicked submit"}\n```';
  const parsed = parseJsonLikeAction(rawResponse);
  assert(parsed.action === 'click' && parsed.target_id === 'el-5', 'parseJsonLikeAction handles fenced JSON correctly');

  const normalized = normalizeSingleAction(parsed);
  assert(normalized.action === 'click' && normalized.target_id === 'el-5' && normalized.iterations_remaining === 2, 'normalizeSingleAction produces normalized object');
} catch (err) {
  assert(false, `JSON parsing / normalization failed: ${err.message}`);
}

console.log('\n\x1b[1m5. Testing Prompt Builder (Zero-Hardcoding Check)\x1b[0m');
try {
  const prompt = buildSingleActionPrompt(
    'Search for laptops',
    { url: 'https://example.com', title: 'Example Store', elements: [{ target_id: 'el-1', tag: 'button', text: 'Search' }] },
    ['Looked at search field earlier']
  );
  assert(prompt.includes('USER TASK:\nSearch for laptops'), 'Prompt includes dynamic user task');
  assert(prompt.includes('YOUR MEMORY'), 'Prompt includes injected agent memory');
  assert(prompt.includes('https://example.com'), 'Prompt includes dynamic URL');
} catch (err) {
  assert(false, `Prompt builder test failed: ${err.message}`);
}

console.log('\n\x1b[36m====================================================\x1b[0m');
if (failed === 0) {
  console.log(`\x1b[32m🎉 All ${passed} tests passed successfully!\x1b[0m`);
  process.exit(0);
} else {
  console.error(`\x1b[31m❌ ${failed} test(s) failed (${passed} passed).\x1b[0m`);
  process.exit(1);
}
