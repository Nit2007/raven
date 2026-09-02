import { execSync } from 'child_process';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const extDir = join(rootDir, 'gemini-browser-agent');
const zipPath = join(rootDir, 'gemini-browser-agent.zip');

console.log('Building gemini-browser-agent.zip...');

if (existsSync(zipPath)) {
  unlinkSync(zipPath);
}

if (process.platform === 'win32') {
  execSync(`powershell -Command "Compress-Archive -Path '${extDir}\\*' -DestinationPath '${zipPath}' -Force"`, {
    stdio: 'inherit'
  });
} else {
  execSync(`cd "${extDir}" && zip -r "${zipPath}" ./*`, {
    stdio: 'inherit'
  });
}

console.log(`Successfully created ${zipPath}`);
