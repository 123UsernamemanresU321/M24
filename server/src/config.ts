import fs from 'fs';
import path from 'path';
import readline from 'readline';

export type AppConfig = {
  dataDir: string;
  difficultyThresholds?: { t1: number; t2: number; t3: number };
  calibration?: { enabled: boolean; window: number };
};

const defaultConfig: Pick<AppConfig, 'difficultyThresholds' | 'calibration'> = {
  difficultyThresholds: { t1: 0.25, t2: 0.45, t3: 0.65 },
  calibration: { enabled: false, window: 200 }
};

function withDefaults(config: AppConfig): AppConfig {
  return {
    ...config,
    difficultyThresholds: config.difficultyThresholds ?? defaultConfig.difficultyThresholds,
    calibration: config.calibration ?? defaultConfig.calibration
  };
}

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, 'config.json');
}

export function loadConfig(projectRoot: string): AppConfig | null {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return withDefaults(JSON.parse(raw) as AppConfig);
}

export function resolveDataDir(projectRoot: string, config: AppConfig): string {
  return path.isAbsolute(config.dataDir)
    ? config.dataDir
    : path.resolve(projectRoot, config.dataDir);
}

function storeDataDir(projectRoot: string, selected: string): AppConfig {
  const relative = path.relative(projectRoot, selected);
  const stored = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? path.join('.', relative)
    : selected;
  const config: AppConfig = { dataDir: stored, ...defaultConfig };
  const configPath = getConfigPath(projectRoot);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return config;
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export async function ensureConfig(projectRoot: string): Promise<{ config: AppConfig; dataDir: string }> {
  const existing = loadConfig(projectRoot);
  if (existing) {
    const configPath = getConfigPath(projectRoot);
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2));
    return { config: existing, dataDir: resolveDataDir(projectRoot, existing) };
  }

  const defaultDir = path.join(projectRoot, '24-arena-data');
  const answer = await prompt(
    `Select a data folder path for 24 Arena.\n` +
      `Press Enter to accept default: ${defaultDir}\n` +
      `Data folder path: `
  );

  const selected = answer.trim() === '' ? defaultDir : answer.trim();
  const resolved = path.isAbsolute(selected) ? selected : path.resolve(projectRoot, selected);
  const config = storeDataDir(projectRoot, resolved);
  return { config, dataDir: resolved };
}

export function ensureDataDirs(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'exports'), { recursive: true });
}
