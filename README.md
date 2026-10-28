# homebridge-pulse-light

[![npm](https://img.shields.io/npm/v/homebridge-pulse-light)](https://www.npmjs.com/package/homebridge-pulse-light)
[![Build and Test](https://github.com/alphaorderly/homebridge-pulse-light/actions/workflows/build.yml/badge.svg)](https://github.com/alphaorderly/homebridge-pulse-light/actions/workflows/build.yml)

A [Homebridge](https://homebridge.io) plugin that adds one **virtual light** to HomeKit. The light is OFF, and every
`intervalSeconds` it turns **ON for `onSeconds`** (0.5 s by default), then OFF again. It repeats for as long as Homebridge runs.

There is no real hardware. The plugin only reports state changes to HomeKit, so you can use the pulse as a
recurring trigger for HomeKit automations, such as "every 5 minutes, check X" or "every 30 seconds, do Y".

## How it behaves

With `intervalSeconds: 30` and `onSeconds: 0.5`:

| Time   | Light |
| ------ | ----- |
| 0 s    | OFF   |
| 30 s   | ON    |
| 30.5 s | OFF   |
| 60 s   | ON    |
| 60.5 s | OFF   |
| 90 s   | ON    |
| 90.5 s | OFF   |

- The light starts OFF when Homebridge starts. The first pulse fires one full interval later.
- Pulses stay on a fixed grid (start + n × interval), so they don't drift over time.
- If Homebridge is blocked long enough to miss a pulse, the missed pulse is skipped. Pulses never stack up or overlap.
- If you toggle the light in the Home app, the plugin reverts it to its real state. The schedule doesn't change.
- When Homebridge shuts down, the timer is cleared and the light is set to OFF.

## Installation

### Homebridge UI (recommended)

1. Open the Homebridge UI and go to **Plugins**.
2. Search for `homebridge-pulse-light` and click **Install**.
3. Fill in the settings form (see below), click **Save**, and restart Homebridge.

### Command line

```sh
npm install -g homebridge-pulse-light
```

Requires Node.js 22, 24 or 26 and Homebridge 1.8 or later (Homebridge 2.x supported).

## Configuration

| Key               | Type   | Required | Default | Description                                                                         |
| ----------------- | ------ | -------- | ------- | ----------------------------------------------------------------------------------- |
| `name`            | string | yes      |         | Accessory name shown in the Home app.                                               |
| `intervalSeconds` | number | yes      | `30`    | Seconds between pulses. Decimals allowed. Minimum `1`, maximum `86400` (24 hours).  |
| `onSeconds`       | number | no       | `0.5`   | Seconds the light stays ON per pulse. Decimals allowed. Minimum `0.1`, maximum `3600`, and must be shorter than `intervalSeconds`. |

Add an entry to the `accessories` array in `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "PulseLight",
      "name": "Pulse Light",
      "intervalSeconds": 30,
      "onSeconds": 0.5
    }
  ]
}
```

You can add several entries with different names and intervals. Each entry becomes its own light.

If `intervalSeconds` is missing or invalid (not a number, or outside 1 to 86400), the plugin logs an error and uses 30 seconds.
If `onSeconds` is invalid or not shorter than the interval, the plugin logs an error and uses 0.5 seconds (or half the interval,
whichever is shorter). If `onSeconds` is left out, 0.5 seconds is used. Homebridge and your other plugins keep running.

### Using the Homebridge UI

1. Go to **Plugins → Pulse Light → Settings** (the gear icon).
2. Enter a **Name**, an **Interval (seconds)** and an **ON time (seconds)**. Both time fields are number inputs.
3. Click **Save**, then restart Homebridge from the UI to apply the change.

## Using it as an automation trigger

1. In the Home app, add the Homebridge bridge if you haven't yet. The light appears under the name you configured.
2. Go to **Automation → + → An Accessory is Controlled**.
3. Choose the Pulse Light and select **Turns On**.
4. Pick the scenes or accessories to control, or use **Convert to Shortcut** in the Home app for more complex logic.

Each pulse fires the automation once, so you get a periodic trigger at your chosen interval.

> **Tip:** Turn off notifications for this accessory in the Home app. Otherwise you'll get a notification for every pulse.

## Caveats

- **A short pulse doesn't guarantee that every automation runs.** HomeKit automations run on your home hub (Apple TV,
  HomePod or iPad). A pulse can be missed if the hub is busy, asleep, restarting or offline, or if the network or Homebridge is
  slow. In that case the automation doesn't run for that pulse. Don't rely on this plugin for safety-critical or must-run tasks.
- Very short intervals (a few seconds) create a lot of HomeKit traffic and may be throttled. Use the longest interval that works for you.
- Timing is accurate to within normal Node.js timer precision (a few milliseconds). It isn't a hardware clock.
- The light appears in the Home app as a normal lightbulb. Turning it on or off by hand has no lasting effect.

## Development

```sh
npm install
npm run lint
npm test          # builds, then runs the timer-mocked test suite
npm pack --dry-run
```

## License

[Apache-2.0](LICENSE)
