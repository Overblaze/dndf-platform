#!/usr/bin/env node
// Checks every JSON file under data/rules against data/schema/rules.schema.json
// (and every one under data/reference against data/schema/reference.schema.json),
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
  if (entry.kind === 'subrace' && !resolves(entry.parent, 'race')) {
    report(`${entry.id} has parent "${entry.parent}", which is not a race in the same version`);
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

// Reference books (data/reference): kept for looking things up, never offered when building a character.
const referenceDir = join(root, 'data', 'reference');
const referenceSchema = JSON.parse(readFileSync(join(root, 'data', 'schema', 'reference.schema.json'), 'utf8'));
const validateReference = new Ajv2020({ allErrors: true }).compile(referenceSchema);
const referenceFiles = readdirSync(referenceDir, { recursive: true }).filter((name) => name.endsWith('.json')).map((name) => join(referenceDir, name)).sort();
const referenceIds = new Set();
let referenceEntries = 0;
for (const path of referenceFiles) {
  const shown = relative(root, path);
  let file;
  try {
    file = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push(`${shown}: not valid JSON (${error.message})`);
    continue;
  }
  if (!validateReference(file)) {
    for (const error of validateReference.errors.filter((e) => e.keyword !== 'oneOf').slice(0, 10)) problems.push(`${shown}: ${error.instancePath || '/'} ${error.message}`);
    if (validateReference.errors.every((e) => e.keyword === 'oneOf')) problems.push(`${shown}: ${validateReference.errors[0].instancePath} is not a block this schema knows`);
    continue;
  }
  if (!file.$note.includes('Creative Commons Attribution 4.0')) problems.push(`${shown}: the $note does not carry the licence attribution`);
  for (const entry of file.entries) {
    referenceEntries += 1;
    if (referenceIds.has(entry.id)) problems.push(`${shown}: ${entry.id} is defined twice`);
    referenceIds.add(entry.id);
    if (seen.has(`dndf-10 ${entry.id}`) || seen.has(`dndf-8.8 ${entry.id}`)) problems.push(`${shown}: ${entry.id} is also a rules entry; reference books stay out of data/rules`);
    for (const block of entry.blocks) {
      if (block.page !== 0 && block.page < entry.page) problems.push(`${shown}: ${entry.id} has text from p.${block.page}, before it starts on p.${entry.page}`);
      if (block.t === 'table' && new Set(block.rows.map((row) => row.length)).size !== 1) problems.push(`${shown}: ${entry.id} has a table (p.${block.page}) whose rows differ in length`);
      for (const over of block.over ?? []) {
        if (over.to < over.from || over.to >= block.rows[0].length) problems.push(`${shown}: ${entry.id} has a header set over columns its table does not have`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s) in ${files.length} rules file(s) and ${referenceFiles.length} reference file(s).`);
  process.exit(1);
}
console.log(`OK: ${entries.length} entries in ${files.length} rules file(s); ${referenceEntries} entries in ${referenceFiles.length} reference file(s).`);
