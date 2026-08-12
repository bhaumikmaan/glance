type Job = {
  id: string;
  run: () => Promise<void>;
  intervalMs: number;
};

export class PollingScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();

  start(job: Job): void {
    if (this.timers.has(job.id)) {
      return;
    }

    const runOnce = async (): Promise<void> => {
      if (this.running.has(job.id)) {
        return;
      }
      this.running.add(job.id);
      try {
        await job.run();
      } finally {
        this.running.delete(job.id);
      }
    };

    void runOnce();
    const timer = setInterval(() => {
      void runOnce();
    }, withJitter(job.intervalMs));

    this.timers.set(job.id, timer);
  }

  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running.clear();
  }
}

function withJitter(intervalMs: number): number {
  const jitter = Math.floor(intervalMs * 0.1);
  const min = intervalMs - jitter;
  const max = intervalMs + jitter;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
