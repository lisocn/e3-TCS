import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const profile = (process.argv[2] || '').trim();
const allowed = new Set(['stable', 'adaptive']);
if (!allowed.has(profile)) {
    console.error('Usage: node tools/select_runtime_config.mjs <stable|adaptive>');
    process.exit(1);
}

const root = process.cwd();
const src = path.join(root, 'public', `config.${profile}.js`);
const dest = path.join(root, 'public', 'config.js');

if (!fs.existsSync(src)) {
    console.error(`Config profile file not found: ${src}`);
    process.exit(2);
}

fs.copyFileSync(src, dest);
console.log(`Runtime config switched to '${profile}': ${dest}`);
