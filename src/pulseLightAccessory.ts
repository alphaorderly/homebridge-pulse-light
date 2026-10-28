import type { AccessoryConfig, AccessoryPlugin, API, Characteristic, CharacteristicValue, Logging, Service } from 'homebridge';

import { parseConfig } from './config.js';
import { PULSE_DURATION_MS, PulseScheduler } from './pulseScheduler.js';

export class PulseLightAccessory implements AccessoryPlugin {
  private readonly informationService: Service;
  private readonly lightbulbService: Service;
  private readonly onCharacteristic: Characteristic;
  private readonly scheduler: PulseScheduler;

  constructor(
    private readonly log: Logging,
    config: AccessoryConfig,
    api: API,
  ) {
    const { name, intervalSeconds } = parseConfig(config, log);

    this.informationService = new api.hap.Service.AccessoryInformation()
      .setCharacteristic(api.hap.Characteristic.Manufacturer, 'homebridge-pulse-light')
      .setCharacteristic(api.hap.Characteristic.Model, 'Pulse Light')
      .setCharacteristic(api.hap.Characteristic.SerialNumber, `pulse-light-${name}`);

    this.lightbulbService = new api.hap.Service.Lightbulb(name);
    this.onCharacteristic = this.lightbulbService.getCharacteristic(api.hap.Characteristic.On);

    this.scheduler = new PulseScheduler(intervalSeconds * 1000, (on) => {
      this.log.debug(on ? 'Pulse ON' : 'Pulse OFF');
      this.onCharacteristic.updateValue(on);
    });

    this.onCharacteristic
      .onGet(() => this.scheduler.isOn)
      .onSet((value) => this.handleManualSet(value));
    this.onCharacteristic.updateValue(false);

    api.on('didFinishLaunching', () => this.scheduler.start());
    api.on('shutdown', () => this.scheduler.stop());

    this.log.info(`Pulsing ON for ${PULSE_DURATION_MS} ms every ${intervalSeconds} s.`);
  }

  getServices(): Service[] {
    return [this.informationService, this.lightbulbService];
  }

  /**
   * The light is driven only by the schedule. A manual toggle from the Home app is accepted (so
   * the request does not error) and then reverted to the scheduler's state once HAP has stored it.
   */
  private handleManualSet(value: CharacteristicValue): void {
    if (value === this.scheduler.isOn) {
      return;
    }
    this.log.info('Manual change ignored; the pulse schedule is unchanged.');
    setImmediate(() => this.onCharacteristic.updateValue(this.scheduler.isOn));
  }
}
