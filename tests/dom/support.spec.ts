import { describe, it, expect } from 'vitest';
import {
  detectGlassSupport,
  isChromiumEngine,
  isLiquidGlassSupported,
  isWebKitEngine,
  safariMajorVersion,
  needsFilterIdBump,
  detectContentFilterSupport,
} from '../../src/dom/support';

const yes = () => true;
const no = () => false;
const onlyWebkitPrefix = (p: string) => p === '-webkit-backdrop-filter';

const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0',
  edgeHtml: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0.0.0 Mobile/15E148 Safari/604.1',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0',
};

describe('isChromiumEngine', () => {
  it('prefers Client Hints brands when present', () => {
    expect(isChromiumEngine({ brands: ['Not A;Brand', 'Chromium', 'Google Chrome'], userAgent: UA.firefox })).toBe(true);
    expect(isChromiumEngine({ brands: ['Brave', 'Chromium'] })).toBe(true);
    expect(isChromiumEngine({ brands: ['Firefox'] })).toBe(false);
  });

  it('falls back to the UA string: Chrome, Chromium Edge, Opera yes; Safari, Firefox, iOS Chrome, EdgeHTML no', () => {
    expect(isChromiumEngine({ userAgent: UA.chrome })).toBe(true);
    expect(isChromiumEngine({ userAgent: UA.edge })).toBe(true);
    expect(isChromiumEngine({ userAgent: UA.chrome + ' OPR/120.0' })).toBe(true);
    expect(isChromiumEngine({ userAgent: UA.safari })).toBe(false);
    expect(isChromiumEngine({ userAgent: UA.firefox })).toBe(false);
    expect(isChromiumEngine({ userAgent: UA.iosChrome })).toBe(false);
    expect(isChromiumEngine({ userAgent: UA.edgeHtml })).toBe(false);
    expect(isChromiumEngine({})).toBe(false);
  });
});

describe('detectGlassSupport', () => {
  it("'full' only for Chromium with backdrop-filter", () => {
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: yes })).toBe('full');
    expect(detectGlassSupport({ brands: ['Chromium'], supports: yes })).toBe('full');
  });

  it("'frost' where backdrop-filter parses but the engine is not Chromium", () => {
    expect(detectGlassSupport({ userAgent: UA.safari, supports: yes })).toBe('frost');
    expect(detectGlassSupport({ userAgent: UA.safari, supports: onlyWebkitPrefix })).toBe('frost');
    expect(detectGlassSupport({ userAgent: UA.firefox, supports: yes })).toBe('frost');
    expect(detectGlassSupport({ userAgent: UA.iosChrome, supports: yes })).toBe('frost');
  });

  it("'frost' when the engine is Chromium but url() does not parse in backdrop-filter", () => {
    const noUrl = (_p: string, v: string) => !v.startsWith('url(');
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: noUrl })).toBe('frost');
  });

  it('the page-level override wins over detection', () => {
    expect(detectGlassSupport({ userAgent: UA.safari, supports: yes, override: 'force' })).toBe('full');
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: yes, override: 'off' })).toBe('frost');
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: no, override: 'force' })).toBe('full');
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: yes, override: null })).toBe('full');
  });

  it("'none' without backdrop-filter or without CSS.supports, and when supports() throws", () => {
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: no })).toBe('none');
    expect(detectGlassSupport({ userAgent: UA.chrome })).toBe('none');
    expect(detectGlassSupport({ userAgent: UA.chrome, supports: () => { throw new Error('nope'); } })).toBe('none');
  });

  it('isLiquidGlassSupported is the boolean view; the default environment here (Node) is unsupported', () => {
    expect(isLiquidGlassSupported({ userAgent: UA.chrome, supports: yes })).toBe(true);
    expect(isLiquidGlassSupported({ userAgent: UA.safari, supports: yes })).toBe(false);
    expect(isLiquidGlassSupported()).toBe(false);
    expect(detectGlassSupport()).toBe('none');
  });
});

describe('content-side filter helpers', () => {
  const safari26 = UA.safari.replace('Version/27.2', 'Version/26.1');

  it('isWebKitEngine: Safari and iOS browsers, not Chromium (even with AppleWebKit in the UA), not Gecko', () => {
    expect(isWebKitEngine({ userAgent: UA.safari })).toBe(true);
    expect(isWebKitEngine({ userAgent: UA.iosChrome })).toBe(true);
    expect(isWebKitEngine({ userAgent: UA.chrome })).toBe(false);
    expect(isWebKitEngine({ userAgent: UA.edge })).toBe(false);
    expect(isWebKitEngine({ userAgent: UA.firefox })).toBe(false);
    expect(isWebKitEngine({ userAgent: UA.safari, brands: ['Chromium'] })).toBe(false);
    expect(isWebKitEngine({})).toBe(false);
  });

  it('safariMajorVersion reads the Version token', () => {
    expect(safariMajorVersion({ userAgent: UA.safari })).toBe(27);
    expect(safariMajorVersion({ userAgent: safari26 })).toBe(26);
    expect(safariMajorVersion({ userAgent: UA.iosChrome })).toBeNull();
    expect(safariMajorVersion({ userAgent: UA.chrome })).toBeNull();
  });

  it('needsFilterIdBump: WebKit before 27 or of unknown version; never Chromium or Gecko', () => {
    expect(needsFilterIdBump({ userAgent: UA.safari })).toBe(false);
    expect(needsFilterIdBump({ userAgent: safari26 })).toBe(true);
    expect(needsFilterIdBump({ userAgent: UA.iosChrome })).toBe(true);
    expect(needsFilterIdBump({ userAgent: UA.chrome })).toBe(false);
    expect(needsFilterIdBump({ userAgent: UA.firefox })).toBe(false);
  });

  it('detectContentFilterSupport: filter: url() must parse; the page override wins', () => {
    const filterUrl = (p: string, v: string) => p === 'filter' && v.startsWith('url(');
    expect(detectContentFilterSupport({ userAgent: UA.safari, supports: filterUrl })).toBe(true);
    expect(detectContentFilterSupport({ userAgent: UA.firefox, supports: yes })).toBe(true);
    expect(detectContentFilterSupport({ userAgent: UA.chrome, supports: no })).toBe(false);
    expect(detectContentFilterSupport({ userAgent: UA.chrome, supports: yes, override: 'off' })).toBe(false);
    expect(detectContentFilterSupport({ userAgent: UA.chrome, supports: no, override: 'force' })).toBe(true);
    expect(detectContentFilterSupport({})).toBe(false);
  });
});
