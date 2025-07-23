import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'url';

function slugify(str: string) {
  return str.toLowerCase().replace(/ /g, '_');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

try {
  const migrationName = await new Promise((resolve) => {
    rl.question('Enter migration name: ', resolve);
  });

  const timestamp = generateTimestamp();
  const fileName = `${timestamp}_${slugify(String(migrationName))}.sql`;
  const migrationsDir = path.join(
    __dirname,
    '../src-tauri/sticky-models/migrations'
  );
  const filePath = path.join(migrationsDir, fileName);

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  fs.writeFileSync(filePath, '-- Add migration SQL here\n');
  console.log(`Created migration file: ${fileName}`);
} catch (error) {
  console.error('Error creating migration:', error);
} finally {
  rl.close();
}
