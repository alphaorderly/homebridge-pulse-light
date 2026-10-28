import type { AccessoryConfig, Logging } from 'homebridge';

export const DEFAULT_NAME = 'Pulse Light';
export const DEFAULT_INTERVAL_SECONDS = 30;
export const MIN_INTERVAL_SECONDS = 1;
export const MAX_INTERVAL_SECONDS = 86400;

export interface PulseLightConfig {
  name: string;
  intervalSeconds: number;
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

  let intervalSeconds = DEFAULT_INTERVAL_SECONDS;
  const raw: unknown = config.intervalSeconds;
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (raw === undefined) {
    log.warn(`"intervalSeconds" is not set; using ${DEFAULT_INTERVAL_SECONDS}.`);
  } else if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_INTERVAL_SECONDS ||
    value > MAX_INTERVAL_SECONDS
  ) {
    log.error(
      `"intervalSeconds" must be an integer between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS} ` +
      `(got ${JSON.stringify(raw)}); using ${DEFAULT_INTERVAL_SECONDS}.`,
    );
  } else {
    intervalSeconds = value;
  }

  return { name, intervalSeconds };
}
