import { revokeBlobUrl, type UrlRevoker } from './encodeImage.js';

type Entry = { url: string | null; refs: number; pending: Promise<string> | null };

export interface MapRegistryOptions {
  /**
   * How many released maps to keep warm (insertion-ordered, oldest evicted). A handle that
   * unmounts and remounts, or a list that re-renders, then finds its map instead of regenerating.
   * 0 revokes on the last release. Default 0 (the page-wide registry uses 16).
   */
  maxIdle?: number;
}

/**
 * Reference-counted registry of generated map URLs keyed by the parameters that produced them.
 * Handles with identical geometry share one image (a list of same-size cards costs one map);
 * a URL is revoked when its last holder releases it and the idle cache is full. Concurrent
 * requests for the same key share the in-flight encode.
 */
export class MapRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly idle = new Map<string, string>();
  private readonly maxIdle: number;

  constructor(
    private readonly revoke: UrlRevoker,
    options: MapRegistryOptions = {},
  ) {
    this.maxIdle = Math.max(0, options.maxIdle ?? 0);
  }

  /** Number of distinct maps currently held by at least one handle. */
  get size(): number {
    return this.entries.size;
  }

  /** Number of released maps kept warm. */
  get idleSize(): number {
    return this.idle.size;
  }

  /** Take a reference to `key`, producing the URL only if nobody holds it and it is not warm. */
  async acquire(key: string, produce: () => Promise<string>): Promise<string> {
    let e = this.entries.get(key);
    if (!e) {
      const warm = this.idle.get(key);
      if (warm !== undefined) {
        this.idle.delete(key);
        e = { url: warm, refs: 0, pending: null };
        this.entries.set(key, e);
      } else {
        const entry: Entry = { url: null, refs: 0, pending: null };
        this.entries.set(key, entry);
        entry.pending = produce().then(
          (url) => {
            entry.url = url;
            entry.pending = null;
            if (entry.refs <= 0) {
              // every holder gave up while we were encoding
              this.entries.delete(key);
              this.park(key, url);
            }
            return url;
          },
          (err: unknown) => {
            this.entries.delete(key);
            throw err;
          },
        );
        e = entry;
      }
    }
    e.refs += 1;
    try {
      return e.url ?? (await e.pending!);
    } catch (err) {
      e.refs -= 1;
      throw err;
    }
  }

  /** Drop one reference to `key`; parks or revokes the URL when none remain. */
  release(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.refs -= 1;
    if (e.refs > 0) return;
    if (e.url !== null) {
      this.entries.delete(key);
      this.park(key, e.url);
    }
    // still encoding: the pending handler sees refs <= 0 and parks/revokes on arrival
  }

  /** Revoke every warm map (e.g. on page teardown). Held maps are unaffected. */
  clearIdle(): void {
    for (const url of this.idle.values()) this.revoke(url);
    this.idle.clear();
  }

  private park(key: string, url: string): void {
    if (this.maxIdle <= 0) {
      this.revoke(url);
      return;
    }
    this.idle.delete(key); // re-insert as newest
    this.idle.set(key, url);
    while (this.idle.size > this.maxIdle) {
      const oldest = this.idle.keys().next().value as string;
      const old = this.idle.get(oldest)!;
      this.idle.delete(oldest);
      this.revoke(old);
    }
  }
}

/** Registry shared by every handle that uses the default blob-URL encoder. */
export const defaultMapRegistry = new MapRegistry(revokeBlobUrl, { maxIdle: 16 });

/**
 * One handle's view of the registry: holds at most one key at a time and releases the previous
 * one when it moves on.
 */
export class UrlSlot {
  key: string | null = null;
  url: string | null = null;
  private disposed = false;

  constructor(private readonly registry: MapRegistry) {}

  /** Switch this slot to `key`, producing the image only if the registry lacks it. */
  async acquire(key: string, produce: () => Promise<string>): Promise<string> {
    const url = await this.registry.acquire(key, produce);
    if (this.disposed) {
      this.registry.release(key);
      return url;
    }
    if (this.key !== null && this.key !== key) this.registry.release(this.key);
    this.key = key;
    this.url = url;
    return url;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.key !== null) this.registry.release(this.key);
    this.key = null;
    this.url = null;
  }
}
