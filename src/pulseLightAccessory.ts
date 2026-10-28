import type { AccessoryConfig, AccessoryPlugin, API, Logging, Service } from 'homebridge';

import { parseConfig } from './config.js';
import { PulseScheduler } from './pulseScheduler.js';

/**
 * A virtual HomeKit button (Stateless Programmable Switch) that reports a single press every interval.
 * Button events are delivered to the home hub immediately and are the event type HomeKit
 * automations are designed to trigger on.
 */
export class PulseLightAccessory implements AccessoryPlugin {
  private readonly informationService: Service;
  private readonly buttonService: Service;
  private readonly scheduler: PulseScheduler;

  constructor(
    private readonly log: Logging,
    config: AccessoryConfig,
    api: API,
  ) {
    const { name, intervalSeconds } = parseConfig(config, log);
    const { Characteristic, Service } = api.hap;

    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Manufacturer, 'homebridge-pulse-light')
      .setCharacteristic(Characteristic.Model, 'Pulse Button')
      .setCharacteristic(Characteristic.SerialNumber, `pulse-light-${name}`);

    this.buttonService = new Service.StatelessProgrammableSwitch(name);
    const switchEvent = this.buttonService.getCharacteristic(Characteristic.ProgrammableSwitchEvent);
    // Offer only "Single Press" in the Home app; this button never reports double or long presses.
    const singlePress = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
    switchEvent.setProps({ minValue: singlePress, maxValue: singlePress, validValues: [singlePress] });

    this.scheduler = new PulseScheduler(Math.round(intervalSeconds * 1000), () => {
      this.log.debug('Pulse: single press');
      switchEvent.sendEventNotification(singlePress);
    });

    api.on('didFinishLaunching', () => this.scheduler.start());
    api.on('shutdown', () => this.scheduler.stop());

    this.log.info(`Pressing the button every ${intervalSeconds} s.`);
  }

  getServices(): Service[] {
    return [this.informationService, this.buttonService];
  }
}
