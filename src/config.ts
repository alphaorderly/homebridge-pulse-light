import type { AccessoryConfig, Logging } from 'homebridge';

export const DEFAULT_NAME = 'Pulse Light';
export const DEFAULT_INTERVAL_SECONDS = 30;
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 86400;
export const DEFAULT_ON_SECONDS = 0.5;
export const MIN_ON_SECONDS = 0.1;
export const MAX_ON_SECONDS = 3600;

export interface PulseLightConfig {
  name: string;
  intervalSeconds: number;
  onSeconds: number;
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

  // The light must have time to turn OFF before the next pulse, so ON time is capped below the interval.
  const onFallback = Math.min(DEFAULT_ON_SECONDS, intervalSeconds / 2);
  // onSeconds is optional (added in 1.1.0), so a missing value silently keeps the original 0.5 s pulse.
  let onSeconds = config.onSeconds === undefined
    ? onFallback
    : readSeconds(config, 'onSeconds', MIN_ON_SECONDS, MAX_ON_SECONDS, onFallback, log);
  if (onSeconds >= intervalSeconds) {
    log.error(`"onSeconds" (${onSeconds}) must be shorter than "intervalSeconds" (${intervalSeconds}); using ${onFallback}.`);
    onSeconds = onFallback;
  }

  return { name, intervalSeconds, onSeconds };
}
