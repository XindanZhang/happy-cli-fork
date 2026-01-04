import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

export type CodexModelHints = {
  defaultModel?: string;
  migratedModel?: string;
};

function parseQuotedString(value: string): string | null {
  const trimmed = value.trim();
  const matchDouble = trimmed.match(/^"([^"]+)"\s*$/);
  if (matchDouble) return matchDouble[1];
  const matchSingle = trimmed.match(/^'([^']+)'\s*$/);
  if (matchSingle) return matchSingle[1];
  return null;
}

function readCodexConfigToml(): string | null {
  const codexHomeDir = process.env.CODEX_HOME || join(os.homedir(), '.codex');
  const configPath = join(codexHomeDir, 'config.toml');
  try {
    return fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
}

function extractDefaultModel(toml: string): string | undefined {
  const lines = toml.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) return undefined; // top-level section ended
    const match = trimmed.match(/^model\s*=\s*(.+)\s*$/);
    if (!match) continue;
    return parseQuotedString(match[1]) || undefined;
  }
  return undefined;
}

function extractModelMigrations(toml: string): Record<string, string> {
  const migrations: Record<string, string> = {};
  const lines = toml.split('\n');
  let inSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      inSection = line === '[notice.model_migrations]';
      continue;
    }
    if (!inSection) continue;

    const match = line.match(/^("([^"]+)"|'([^']+)')\s*=\s*("([^"]+)"|'([^']+)')\s*$/);
    if (!match) continue;
    const from = match[2] || match[3];
    const to = match[5] || match[6];
    if (from && to) migrations[from] = to;
  }
  return migrations;
}

export function readCodexModelHints(): CodexModelHints {
  const toml = readCodexConfigToml();
  if (!toml) return {};

  const defaultModel = extractDefaultModel(toml);
  const migrations = extractModelMigrations(toml);
  const migratedModel = defaultModel ? migrations[defaultModel] : undefined;

  return { defaultModel, migratedModel };
}

