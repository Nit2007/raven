import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const extensionDir = join(rootDir, 'gemini-browser-agent');

// Candidate executable paths for Chrome and Edge
function findBrowser(preferred = 'chrome') {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const chromeCandidates = isWindows
    ? [
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]
    : isMac
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];

  const edgeCandidates = isWindows
    ? [
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      ]
    : isMac
    ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : ['/usr/bin/microsoft-edge'];

  const candidates = preferred === 'edge' ? [...edgeCandidates, ...chromeCandidates] : [...chromeCandidates, ...edgeCandidates];

  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

const args = process.argv.slice(2);
const isEdge = args.includes('--browser=edge') || args.includes('-edge');
const browserPath = findBrowser(isEdge ? 'edge' : 'chrome');

if (!browserPath) {
  console.error('\x1b[31mError: Could not locate Chrome or Edge browser executable on your system.\x1b[0m');
  console.log('You can load the unpacked extension manually in Chrome via chrome://extensions');
  console.log(`Extension folder path: ${extensionDir}`);
  process.exit(1);
}

// Dedicated temporary profile so it doesn't conflict with existing browser windows
const profileDir = join(os.tmpdir(), 'gemini-agent-test-profile');
if (!existsSync(profileDir)) {
  mkdirSync(profileDir, { recursive: true });
}

const playgroundUrl = `file:///${join(extensionDir, 'test-playground.html').replace(/\\/g, '/')}`;

console.log('\x1b[36m====================================================\x1b[0m');
console.log('\x1b[32m🚀 Launching Browser with Gemini Browser Agent\x1b[0m');
console.log('\x1b[36m====================================================\x1b[0m');
console.log(`Browser:       ${browserPath}`);
console.log(`Extension:     ${extensionDir}`);
console.log(`Playground:    ${playgroundUrl}`);
console.log(`User Profile:  ${profileDir}`);
console.log('\n\x1b[33mInstructions:\x1b[0m');
console.log('1. Click the Gemini Browser Agent extension icon in the toolbar.');
console.log('2. Click "API keys / Settings" to enter your Gemini API key (stored locally).');
console.log('3. Enter a prompt and click Start on the test playground page!\n');

const browserProcess = spawn(
  browserPath,
  [
    `--load-extension=${extensionDir}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    playgroundUrl
  ],
  {
    detached: true,
    stdio: 'ignore'
  }
);

browserProcess.unref();
console.log('\x1b[32mBrowser started successfully!\x1b[0m');
