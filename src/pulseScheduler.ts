/**
 * Fires a callback once per interval.
 *
 * Pulses are aligned to a fixed grid (start + k * interval) measured on a monotonic clock, so timer
 * lateness never accumulates as drift. A single timer handle is re-armed after each pulse, so pulses
 * can never stack up: if the event loop is blocked past one or more grid slots, those slots are
 * skipped instead of being fired back to back.
 */
export class PulseScheduler {
  private timer: NodeJS.Timeout | undefined;
  private anchor = 0;
  private running = false;

  constructor(
    private readonly intervalMs: number,
    private readonly onPulse: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.anchor = this.now();
    this.scheduleNextPulse();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private scheduleNextPulse(): void {
    const elapsed = this.now() - this.anchor;
    const nextSlot = (Math.floor(elapsed / this.intervalMs) + 1) * this.intervalMs;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.running) {
        return;
      }
      this.onPulse();
      this.scheduleNextPulse();
    }, nextSlot - elapsed);
  }
}
