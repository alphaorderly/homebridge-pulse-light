# homebridge-pulse-light

[![npm](https://img.shields.io/npm/v/homebridge-pulse-light)](https://www.npmjs.com/package/homebridge-pulse-light)
[![Build and Test](https://github.com/alphaorderly/homebridge-pulse-light/actions/workflows/build.yml/badge.svg)](https://github.com/alphaorderly/homebridge-pulse-light/actions/workflows/build.yml)

A [Homebridge](https://homebridge.io) plugin that adds one **virtual button** to HomeKit. Every `intervalSeconds` the
button reports a **single press**. It repeats for as long as Homebridge runs.

There is no real hardware. The plugin only sends button events to HomeKit, so you can use them as a recurring trigger for
HomeKit automations, such as "every 5 minutes, check X" or "every 30 seconds, do Y".

## How it behaves

With `intervalSeconds: 30`, the button is pressed at 30 s, 60 s, 90 s, and so on.

- The first press fires one full interval after Homebridge starts.
- Presses stay on a fixed grid (start + n × interval), so they don't drift over time.
- If Homebridge is blocked long enough to miss a press, the missed press is skipped. Presses never stack up.
- When Homebridge shuts down, the timer is cleared.

### Why a button and not a light

Version 1.x exposed a light that turned on briefly, and its "Turns On" automations didn't fire reliably in practice.
Homebridge batches light changes for up to 250 ms before sending them to the home hub, while button presses are sent
immediately and are the event HomeKit automations are built to trigger on. So 2.0 uses a button (a Stateless Programmable Switch).

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
| `intervalSeconds` | number | yes      | `30`    | Seconds between presses. Decimals allowed. Minimum `1`, maximum `86400` (24 hours). |

Add an entry to the `accessories` array in `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "PulseLight",
      "name": "Pulse Light",
      "intervalSeconds": 30
    }
  ]
}
```

You can add several entries with different names and intervals. Each entry becomes its own button.

If `intervalSeconds` is missing or invalid (not a number, or outside 1 to 86400), the plugin logs an error and uses 30 seconds.
Homebridge and your other plugins keep running. The 1.x `onSeconds` setting is no longer used; if it's still in your config,
the plugin logs a warning and ignores it.

### Using the Homebridge UI

1. Go to **Plugins → Pulse Light → Settings** (the gear icon).
2. Enter a **Name** and an **Interval (seconds)**.
3. Click **Save**, then restart Homebridge from the UI to apply the change.

### Upgrading from 1.x

The accessory changes from a light to a button, so automations that used **Turns On** stop working. After upgrading,
open each automation and set its trigger again to the button's **Single Press** (see below). The `accessory` value
(`PulseLight`) and the accessory's name stay the same.

## Using it as an automation trigger

1. In the Home app, add the Homebridge bridge if you haven't yet. The button appears under the name you configured.
2. Go to **Automation → + → An Accessory is Controlled**.
3. Choose the Pulse Light button and select **Single Press**.
4. Pick the scenes or accessories to control, or use **Convert to Shortcut** in the Home app for more complex logic.

Each press fires the automation once, so you get a periodic trigger at your chosen interval.

## Caveats

- **A press doesn't guarantee that every automation runs.** HomeKit automations run on your home hub (Apple TV,
  HomePod or iPad). A press can be missed if the hub is busy, asleep, restarting or offline, or if the network or Homebridge
  is slow. Don't rely on this plugin for safety-critical or must-run tasks.
- Very short intervals (a few seconds) create a lot of HomeKit traffic and may be throttled. Use the longest interval that works for you.
- Timing is accurate to within normal Node.js timer precision (a few milliseconds). It isn't a hardware clock.
- A Stateless Programmable Switch has no state to show, so the Home app shows the button without an on/off tile.

## Development

```sh
npm install
npm run lint
npm test          # builds, then runs the timer-mocked test suite
npm pack --dry-run
```

## License

[Apache-2.0](LICENSE)
