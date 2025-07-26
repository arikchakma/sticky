import path from 'path';
import fs from 'fs';

const version = process.env.STICKY_VERSION?.replace('v', '');
if (!version) {
  throw new Error('STICKY_VERSION environment variable not set');
}

const tauriConfigPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));

tauriConfig.version = version;

console.log('Writing version ' + version + ' to ' + tauriConfigPath);
fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
