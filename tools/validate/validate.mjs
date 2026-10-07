#!/usr/bin/env node
// Checks every JSON file under data/rules against data/schema/rules.schema.json,
// then checks the things a schema can't: unique ids, references, version folders
// and feature pages. Run with `npm run validate`.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rulesDir = join(root, 'data', 'rules');
const schema = JSON.parse(readFileSync(join(root, 'data', 'schema', 'rules.schema.json'), 'utf8'));
const validateFile = new Ajv2020({ allErrors: true, allowUnionTypes: true }).compile(schema);

const files = readdirSync(rulesDir, { recursive: true })
  .filter((name) => name.endsWith('.json'))
  .map((name) => join(rulesDir, name))
  .sort();

const problems = [];
const entries = [];

for (const path of files) {
  const shown = relative(root, path);
  const version = relative(rulesDir, path).split(sep)[0];
  const report = (message) => problems.push(`${shown}: ${message}`);
  let file;
  try {
    file = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    report(`not valid JSON (${error.message})`);
    continue;
  }
  if (!validateFile(file)) {
    for (const error of validateFile.errors) {
      if (error.keyword === 'if') continue;
      if (error.keyword === 'false schema') {
        report(`${error.instancePath} is a Devil Fruit: those are secret and never go in data/rules`);
        continue;
      }
      const extra = error.params?.additionalProperty ? ` "${error.params.additionalProperty}"` : '';
      report(`${error.instancePath || '/'} ${error.message}${extra}`);
    }
    continue;
  }
  for (const entry of file.entries) {
    entries.push({ entry, report, version });
    if (!entry.versions.includes(version)) {
      report(`${entry.id} sits in the ${version} folder but its versions are [${entry.versions.join(', ')}]`);
    }
  }
}

// An id may appear once per rules version (per-version copies of a changed entry share an id).
const seen = new Map();
for (const { entry, report } of entries) {
  for (const version of entry.versions) {
    const key = `${version} ${entry.id}`;
    if (seen.has(key)) report(`${entry.id} is defined twice for ${version}`);
    seen.set(key, entry);
  }
}

for (const { entry, report } of entries) {
  const resolves = (id, kind) => entry.versions.every((v) => seen.get(`${v} ${id}`)?.kind === kind);
  if (entry.kind === 'subclass' && !resolves(entry.parent, 'class')) {
    report(`${entry.id} has parent "${entry.parent}", which is not a class in the same version`);
  }
  const parent = entry.kind === 'subclass' ? seen.get(`${entry.versions[0]} ${entry.parent}`) : entry;
  const resources = new Set((parent?.resources ?? []).map((r) => r.id));
  const optionIds = new Set();
  for (const option of entry.options ?? []) {
    if (optionIds.has(option.id)) report(`${entry.id} has two options with id "${option.id}"`);
    optionIds.add(option.id);
  }
  for (const feature of entry.features ?? []) {
    const where = `${entry.id} "${feature.name}"`;
    if (feature.page < entry.source.page) {
      report(`${where} cites p.${feature.page}, before its entry starts on p.${entry.source.page}`);
    }
    if (feature.choices && !resolves(feature.choices.from, 'optionGroup')) {
      report(`${where} chooses from "${feature.choices.from}", which is not an optionGroup in the same version`);
    }
    if (typeof feature.uses === 'string' && !resources.has(feature.uses.slice(4))) {
      report(`${where} uses "${feature.uses}", but the class defines no such resource`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${files.length} rules file(s).`);
  process.exit(1);
}
console.log(`OK: ${entries.length} entries in ${files.length} rules file(s).`);
