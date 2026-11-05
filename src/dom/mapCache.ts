import { revokeBlobUrl, type UrlRevoker } from './encodeImage.js';

type Entry = { url: string | null; refs: number; pending: Promise<string> | null };

/**
 * Reference-counted registry of generated map URLs keyed by the parameters that produced them.
 * Handles with identical geometry share one image (a list of same-size cards costs one map);
 * a URL is revoked when its last holder releases it. Concurrent requests for the same key share
 * the in-flight encode.
 */
export class MapRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly revoke: UrlRevoker) {}

  /** Number of distinct maps currently held. */
  get size(): number {
    return this.entries.size;
  }

  /** Take a reference to `key`, producing the URL only if nobody holds it yet. */
  async acquire(key: string, produce: () => Promise<string>): Promise<string> {
    let e = this.entries.get(key);
    if (!e) {
      const entry: Entry = { url: null, refs: 0, pending: null };
      this.entries.set(key, entry);
      entry.pending = produce().then(
        (url) => {
          entry.url = url;
          entry.pending = null;
          if (entry.refs <= 0) {
            // every holder gave up while we were encoding
            this.entries.delete(key);
            this.revoke(url);
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
    e.refs += 1;
    try {
      return e.url ?? (await e.pending!);
    } catch (err) {
      e.refs -= 1;
      throw err;
    }
  }

  /** Drop one reference to `key`; revokes the URL when none remain. */
  release(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.refs -= 1;
    if (e.refs > 0) return;
    if (e.url !== null) {
      this.entries.delete(key);
      this.revoke(e.url);
    }
    // still encoding: the pending handler sees refs <= 0 and revokes on arrival
  }
}

/** Registry shared by every handle that uses the default blob-URL encoder. */
export const defaultMapRegistry = new MapRegistry(revokeBlobUrl);

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
