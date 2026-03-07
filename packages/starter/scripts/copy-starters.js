import {cpSync, rmSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, '../../../starters');
const dest = resolve(__dirname, '../starters');

if (existsSync(dest)) rmSync(dest, {recursive: true});

cpSync(src, dest, {
    recursive: true,
    filter: (source) => !source.includes('node_modules') && !source.includes('.next'),
});

console.log('Copied starters/ into packages/starter/starters/');
