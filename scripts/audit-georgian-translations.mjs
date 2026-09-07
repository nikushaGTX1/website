import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const appRoot = join(root, 'src', 'app');
const dictionaryPath = join(appRoot, 'i18n', 'georgian-translations.ts');

function filesIn(directory, extension) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesIn(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

function normalized(value) {
  return value.replace(/\{\{[\s\S]*?\}\}/g, ' ').replace(/\s+/g, ' ').trim();
}

function isCandidate(value) {
  return /[A-Za-z]/.test(value) && !/^(https?:|\/|[\w.+-]+@[\w.-]+$)/.test(value);
}

const dictionarySource = readFileSync(dictionaryPath, 'utf8');
const dictionaryFile = ts.createSourceFile(dictionaryPath, dictionarySource, ts.ScriptTarget.Latest, true);
const translated = new Set();

function collectDictionary(node) {
  if (
    ts.isArrayLiteralExpression(node) &&
    node.elements.length === 2 &&
    (ts.isStringLiteral(node.elements[0]) || ts.isNoSubstitutionTemplateLiteral(node.elements[0]))
  ) {
    translated.add(node.elements[0].text);
  }
  ts.forEachChild(node, collectDictionary);
}
collectDictionary(dictionaryFile);

const found = new Map();
function record(value, path) {
  const text = normalized(value);
  if (!isCandidate(text) || translated.has(text)) return;
  if (!found.has(text)) found.set(text, new Set());
  found.get(text).add(relative(root, path));
}

for (const path of filesIn(appRoot, '.html')) {
  const source = readFileSync(path, 'utf8');
  for (const match of source.matchAll(/>([^<>]+)</g)) record(match[1], path);
  for (const match of source.matchAll(/\b(?:placeholder|title|aria-label)="([^"]+)"/g)) record(match[1], path);
}

const rows = [...found.entries()].sort(([left], [right]) => left.localeCompare(right));
for (const [text, paths] of rows) {
  console.log(`${text}\t${[...paths].join(', ')}`);
}
console.error(`Missing static Georgian translations: ${rows.length}`);
process.exitCode = rows.length ? 1 : 0;
