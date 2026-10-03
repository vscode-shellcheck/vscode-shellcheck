/**
 * Runs tasks with at most `limit` of them in flight, admitting the rest in
 * arrival order. A limit of 0 means no limit.
 */
export class Semaphore {
  private running = 0;
  private readonly waiters: (() => void)[] = [];

  public constructor(private limit: number) {}

  /** Never stops a running task: a lower limit only holds back new ones. */
  public setLimit(limit: number): void {
    this.limit = limit;
    this.admitWaiters();
  }

  /**
   * Aborting `signal` before the task starts drops it, rejecting with the
   * abort reason. A task already running is unaffected.
   */
  public async run<T>(
    task: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.running--;
      this.admitWaiters();
    }
  }

  private acquire(signal: AbortSignal | undefined): Promise<void> {
    signal?.throwIfAborted();
    if (this.waiters.length === 0 && this.hasRoom()) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        this.waiters.splice(this.waiters.indexOf(admit), 1);
        reject(signal!.reason);
      };
      const admit = () => {
        signal?.removeEventListener("abort", onAbort);
        this.running++;
        resolve();
      };
      this.waiters.push(admit);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  private hasRoom(): boolean {
    return this.limit === 0 || this.running < this.limit;
  }

  private admitWaiters(): void {
    while (this.waiters.length > 0 && this.hasRoom()) {
      this.waiters.shift()!();
    }
  }
}
