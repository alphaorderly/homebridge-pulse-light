import type { API } from 'homebridge';

import { PulseLightAccessory } from './pulseLightAccessory.js';

export const ACCESSORY_NAME = 'PulseLight';

/**
 * This method registers the accessory with Homebridge
 */
export default (api: API) => {
  api.registerAccessory(ACCESSORY_NAME, PulseLightAccessory);
};
