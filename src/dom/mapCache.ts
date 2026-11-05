import type { UrlRevoker } from './encodeImage.js';

/**
 * Holds one generated image URL keyed by the parameters that produced it. Owned by exactly
 * one filter handle, so instances never revoke each other's URLs (the 1.x defect).
 */
export class UrlSlot {
  key: string | null = null;
  url: string | null = null;

  constructor(private readonly revoke: UrlRevoker) {}

  /** Store a new key/URL pair, releasing the previous URL if it differs. */
  set(key: string, url: string | null): void {
    if (this.url && this.url !== url) this.revoke(this.url);
    this.key = key;
    this.url = url;
  }

  dispose(): void {
    if (this.url) this.revoke(this.url);
    this.url = null;
    this.key = null;
  }
}
