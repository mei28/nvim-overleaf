// Local .overleaf/ metadata management.
// Stores project config and state for reconnection.

import { logger } from '../util/logger.ts';

const OVERLEAF_DIR = '.overleaf';
const CONFIG_FILE = 'config.json';

export interface ProjectConfig {
  projectId: string;
  projectName: string;
  serverUrl: string;
  cookie?: string; // Stored only if user opts in
}

/** Read .overleaf/config.json from the given directory. */
export async function readProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  const path = `${cwd}/${OVERLEAF_DIR}/${CONFIG_FILE}`;
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text) as ProjectConfig;
  } catch {
    return null;
  }
}

/** Write .overleaf/config.json to the given directory. */
export async function writeProjectConfig(cwd: string, config: ProjectConfig): Promise<void> {
  const dir = `${cwd}/${OVERLEAF_DIR}`;
  await Deno.mkdir(dir, { recursive: true });

  const path = `${dir}/${CONFIG_FILE}`;
  await Deno.writeTextFile(path, JSON.stringify(config, null, 2) + '\n');
  logger.info('Saved project config to %s', path);
}
