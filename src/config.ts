import type { AccessoryConfig, Logging } from 'homebridge';

export const DEFAULT_NAME = 'Pulse Light';
export const DEFAULT_INTERVAL_SECONDS = 30;
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 86400;

export interface PulseLightConfig {
  name: string;
  intervalSeconds: number;
}

function readSeconds(config: AccessoryConfig, key: string, min: number, max: number, fallback: number, log: Logging): number {
  const raw: unknown = config[key];
  if (raw === undefined) {
    log.warn(`"${key}" is not set; using ${fallback}.`);
    return fallback;
  }
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    log.error(`"${key}" must be a number between ${min} and ${max} (got ${JSON.stringify(raw)}); using ${fallback}.`);
    return fallback;
  }
  return value;
}

/**
 * Validates the user's accessory config. Invalid values are logged and replaced with defaults
 * rather than thrown, so a typo never stops Homebridge or other plugins from starting.
 */
export function parseConfig(config: AccessoryConfig, log: Logging): PulseLightConfig {
  let name = DEFAULT_NAME;
  if (typeof config.name === 'string' && config.name.trim() !== '') {
    name = config.name.trim();
  } else {
    log.warn(`"name" is missing or empty; using "${DEFAULT_NAME}".`);
  }

  const intervalSeconds = readSeconds(
    config, 'intervalSeconds', MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS, DEFAULT_INTERVAL_SECONDS, log,
  );

  // onSeconds belonged to the light (1.x); a button press has no duration.
  if (config.onSeconds !== undefined) {
    log.warn('"onSeconds" is no longer used: the accessory is now a button. You can remove it from the config.');
  }

  return { name, intervalSeconds };
}
