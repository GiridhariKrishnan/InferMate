#!/usr/bin/env node
/**
 * Builds clean, review-ready ZIP bundles into dist-skill/:
 *  1) infermate-hybrid-intelligence-skill.zip    (ONLY skills/infermate-hybrid-intelligence/)
 *  2) infermate-hybrid-intelligence-selfhost.zip (skill folder + minimal standalone server.ts)
 *
 * Strictly excludes migrated_prompt_history/, bun.lock, .env*, node_modules/, dist/,
 * and optional Hugging Face files so marketplace submissions are clean and minimal.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZipBuffer } from '../services/zipBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(ROOT, 'dist-skill');
const SKILL_NAME = 'infermate-hybrid-intelligence';
const SKILL_DIR = path.resolve(ROOT, 'skills', SKILL_NAME);

const SKILL_FILES = [
  'SKILL.md',
  'references/api-reference.md',
  'references/integrations.md',
  'scripts/infermate.mjs'
];

const SELFHOST_SERVER_FILES = [
  'server.ts',
  'services/agentTools.ts',
  'services/zipBuilder.ts',
  'package.json',
  'tsconfig.json',
  '.env.example',
  'README.md'
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const skillEntries = SKILL_FILES.map((rel) => ({
  name: `${SKILL_NAME}/${rel}`,
  content: fs.readFileSync(path.resolve(SKILL_DIR, rel))
}));

const skillZipPath = path.resolve(OUT_DIR, `${SKILL_NAME}-skill.zip`);
fs.writeFileSync(skillZipPath, buildZipBuffer(skillEntries));

const selfHostEntries = [
  ...skillEntries,
  ...SELFHOST_SERVER_FILES.map((rel) => ({
    name: `${SKILL_NAME}-server/${rel}`,
    content: fs.readFileSync(path.resolve(ROOT, rel))
  }))
];

const selfHostZipPath = path.resolve(OUT_DIR, `${SKILL_NAME}-selfhost.zip`);
fs.writeFileSync(selfHostZipPath, buildZipBuffer(selfHostEntries));

console.log(`Built ${path.relative(ROOT, skillZipPath)} (${skillEntries.length} files)`);
console.log(`Built ${path.relative(ROOT, selfHostZipPath)} (${selfHostEntries.length} files)`);
