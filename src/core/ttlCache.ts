type CacheRecord<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private readonly map = new Map<string, CacheRecord<T>>();

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.map.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }
}
