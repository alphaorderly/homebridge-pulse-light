/**
 * Drives the OFF -> ON -> OFF pulse cycle.
 *
 * Pulses are aligned to a fixed grid (start + k * interval) measured on a monotonic clock, so timer
 * lateness never accumulates as drift. A single timer handle walks a strict ON -> OFF -> next-ON
 * sequence, which makes overlapping pulses impossible: if the event loop is blocked past one or
 * more grid slots, those slots are skipped instead of being fired back to back.
 */
export class PulseScheduler {
  private timer: NodeJS.Timeout | undefined;
  private anchor = 0;
  private running = false;
  private on = false;

  constructor(
    private readonly intervalMs: number,
    private readonly onMs: number,
    private readonly onChange: (on: boolean) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get isOn(): boolean {
    return this.on;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.anchor = this.now();
    this.setState(false);
    this.scheduleNextPulse();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.setState(false);
  }

  private scheduleNextPulse(): void {
    const elapsed = this.now() - this.anchor;
    const nextSlot = (Math.floor(elapsed / this.intervalMs) + 1) * this.intervalMs;
    this.arm(nextSlot - elapsed, () => this.pulseOn());
  }

  private pulseOn(): void {
    this.setState(true);
    this.arm(this.onMs, () => this.pulseOff());
  }

  private pulseOff(): void {
    this.setState(false);
    this.scheduleNextPulse();
  }

  private arm(delayMs: number, fire: () => void): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.running) {
        fire();
      }
    }, delayMs);
  }

  private setState(on: boolean): void {
    if (this.on === on) {
      return;
    }
    this.on = on;
    this.onChange(on);
  }
}
