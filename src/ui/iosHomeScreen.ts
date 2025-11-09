import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

type DeviceMode = 'iphone' | 'ipad';

type AppIcon = {
  label: string;
  image: string;
  href?: string;
  ipadOnly?: boolean;
  classes?: string[];
};

const DEFAULT_BACKGROUND =
  "https://pbs.twimg.com/media/G5POBXtXcAMF0Uf?format=jpg&name=large";

const HOME_SCREEN_APPS: AppIcon[] = [
  { label: 'Mail', image: 'https://placehold.co/80x80/5856d6/ffffff?text=Mail' },
  { label: 'Notes', image: 'https://placehold.co/80x80/007aff/ffffff?text=Notes' },
  { label: 'Calendar', image: 'https://placehold.co/80x80/ff9500/ffffff?text=Cal' },
  { label: 'Maps', image: 'https://placehold.co/80x80/34c759/ffffff?text=Maps' },
  { label: 'News', image: 'https://placehold.co/80x80/ff3b30/ffffff?text=News', ipadOnly: true },
  { label: 'Photos', image: 'https://placehold.co/80x80/ff2d55/ffffff?text=Photos' },
  { label: 'Weather', image: 'https://placehold.co/80x80/5ac8fa/ffffff?text=Weather' },
  { label: 'Clock', image: 'https://placehold.co/80x80/8e8e93/ffffff?text=Clock' },
  { label: 'Podcasts', image: 'https://placehold.co/80x80/af52de/ffffff?text=Podcasts' },
  { label: 'TV', image: 'https://placehold.co/80x80/5e5ce6/ffffff?text=TV', ipadOnly: true },
  { label: 'Settings', image: 'https://placehold.co/80x80/8e8e93/ffffff?text=Settings' },
  { label: 'Files', image: 'https://placehold.co/80x80/ff9500/ffffff?text=Files' },
  { label: 'Health', image: 'https://placehold.co/80x80/34c759/ffffff?text=Health' },
  { label: 'Wallet', image: 'https://placehold.co/80x80/ff3b30/ffffff?text=Wallet' },
  { label: 'Books', image: 'https://placehold.co/80x80/007aff/ffffff?text=Books', ipadOnly: true },
  { label: 'Translate', image: 'https://placehold.co/80x80/00c7be/ffffff?text=Translate' },
  { label: 'Music', image: 'https://placehold.co/80x80/ff2d55/ffffff?text=Music' },
  { label: 'Find My', image: 'https://placehold.co/80x80/34c759/ffffff?text=Find+My' },
  { label: 'Camera', image: 'https://placehold.co/80x80/8e8e93/ffffff?text=Camera' },
  { label: 'Clips', image: 'https://placehold.co/80x80/ff9500/ffffff?text=Clips', ipadOnly: true },
  { label: 'Shortcuts', image: 'https://placehold.co/80x80/ffcc00/ffffff?text=Shortcuts' },
  { label: 'App Store', image: 'https://placehold.co/80x80/007aff/ffffff?text=Store' },
  { label: 'Utilities', image: 'https://placehold.co/80x80/8e8e93/ffffff?text=Utilities' },
  { label: 'Social', image: 'https://placehold.co/80x80/ff3b30/ffffff?text=Social' },
  { label: 'Games', image: 'https://placehold.co/80x80/34c759/ffffff?text=Games', ipadOnly: true },
  { label: 'Docs', image: 'https://placehold.co/80x80/5ac8fa/ffffff?text=Docs' },
  { label: 'Sheets', image: 'https://placehold.co/80x80/ff9500/ffffff?text=Sheets' },
  { label: 'Slides', image: 'https://placehold.co/80x80/ff2d55/ffffff?text=Slides' },
  { label: 'Chat', image: 'https://placehold.co/80x80/5856d6/ffffff?text=Chat' },
  { label: 'Productivity', image: 'https://placehold.co/80x80/34c759/ffffff?text=Prod', ipadOnly: true },
];

const DOCK_APPS: AppIcon[] = [
  { label: 'Phone', image: 'https://placehold.co/80x80/34c759/ffffff?text=Phone' },
  { label: 'Safari', image: 'https://placehold.co/80x80/5ac8fa/ffffff?text=Safari' },
  { label: 'Messages', image: 'https://placehold.co/80x80/34c759/ffffff?text=Msg' },
  { label: 'Music', image: 'https://placehold.co/80x80/ff2d55/ffffff?text=Music' },
  { label: 'Mail', image: 'https://placehold.co/80x80/5856d6/ffffff?text=Mail', ipadOnly: true },
  { label: 'Photos', image: 'https://placehold.co/80x80/ff9500/ffffff?text=Photos', ipadOnly: true },
];

@customElement('ios-home-screen')
export class IosHomeScreen extends LitElement {
  private timeIntervalId: number | undefined;
  private batteryIntervalId: number | undefined;

  @property({ reflect: true })
  mode: DeviceMode = 'iphone';

  @state()
  private timeDisplay = this.formatTime(new Date());

  @state()
  private batteryLevel = this.randomBatteryLevel();

  @state()
  private backgroundUrl = DEFAULT_BACKGROUND;

  @state()
  private backgroundInput = '';

  static styles = css`
    :host {
      display: grid;
      gap: clamp(1rem, 3vw, 1.5rem);
      justify-items: center;
    }

    :host([mode='ipad']) {
      --device-base-width: 600px;
    }

    :host([mode='iphone']) {
      --device-base-width: 375px;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: white;
      border-radius: 12px;
      box-shadow: 0 18px 32px rgba(17, 24, 39, 0.08);
      color: #1f2933;
      max-width: 480px;
      width: min(100%, 480px);
      transition: transform 0.3s ease;
    }

    .controls__group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .controls button {
      padding: 0.55rem 1rem;
      font-size: 0.95rem;
      border: none;
      border-radius: 999px;
      background-color: #007aff;
      color: white;
      cursor: pointer;
      transition: background-color 0.2s ease, transform 0.2s ease;
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    .controls button:hover,
    .controls button:focus-visible {
      background-color: #0061c7;
      transform: translateY(-1px);
    }

    .controls input[type='text'] {
      border: 1px solid #d1d5db;
      border-radius: 999px;
      padding: 0.55rem 0.9rem;
      font-size: 0.95rem;
      min-width: clamp(180px, 38vw, 260px);
      outline: none;
    }

    .controls input[type='text']:focus-visible {
      border-color: #007aff;
      box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.2);
    }

    .device-frame {
      position: relative;
      width: min(var(--device-base-width, 375px), 92vw);
      aspect-ratio: var(--current-aspect-ratio);
      background-color: #1c1c1e;
      border-radius: var(--frame-radius, 44px);
      box-shadow: 0 28px 60px rgba(15, 23, 42, 0.45);
      border: var(--frame-border-width, 10px) solid #000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: width 0.35s ease, border-radius 0.35s ease, border-width 0.35s ease;
      color: white;
    }

    .status-bar {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 44px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 10;
      color: white;
      font-size: 13px;
      font-weight: 600;
    }

    .status-bar__time {
      position: absolute;
      left: 24px;
      top: 12px;
    }

    .status-bar__battery {
      position: absolute;
      right: 24px;
      top: 12px;
    }

    .status-bar__notch {
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 140px;
      height: 34px;
      background: #000;
      border-bottom-left-radius: 18px;
      border-bottom-right-radius: 18px;
    }

    .home-screen {
      flex-grow: 1;
      padding: var(--home-padding);
      display: grid;
      grid-template-columns: repeat(var(--grid-cols), 1fr);
      grid-template-rows: repeat(var(--grid-rows), 1fr);
      gap: 15px 10px;
      background: center / cover no-repeat;
      transition: background-image 0.3s ease;
    }

    .app-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-decoration: none;
      color: inherit;
      text-align: center;
    }

    .app-icon img {
      width: var(--icon-size, 60px);
      height: var(--icon-size, 60px);
      border-radius: 22.5%;
      margin-bottom: 5px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
      transition: transform 0.1s ease-out;
    }

    .app-icon:active img {
      transform: scale(0.95);
    }

    .app-icon span {
      font-size: 11px;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .dock {
      width: 100%;
      height: var(--dock-height);
      padding: var(--dock-padding);
      box-sizing: border-box;
      position: relative;
      z-index: 5;
    }

    .dock::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
    }

    .dock-icons {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: repeat(var(--dock-cols), 1fr);
      gap: 15px 10px;
      align-items: center;
      height: 100%;
    }

    :host([mode='iphone']) .device-frame {
      --current-aspect-ratio: calc(9 / 19.5);
      --grid-cols: 4;
      --grid-rows: 6;
      --dock-cols: 4;
      --home-padding: 50px 25px 15px;
      --icon-size: 60px;
      --dock-height: 90px;
      --dock-padding: 10px 25px 20px;
      --frame-radius: 44px;
      --frame-border-width: 10px;
    }

    :host([mode='iphone']) .status-bar {
      display: flex;
    }

    :host([mode='ipad']) .device-frame {
      --current-aspect-ratio: calc(3 / 4);
      --grid-cols: 5;
      --grid-rows: 5;
      --dock-cols: 6;
      --home-padding: 25px 35px;
      --icon-size: 70px;
      --dock-height: 100px;
      --dock-padding: 16px 35px 24px;
      --frame-radius: 28px;
      --frame-border-width: 8px;
    }

    :host([mode='ipad']) .app-icon.widget-2x1 img {
      width: 150px;
      height: 70px;
    }

    :host([mode='iphone']) .app-icon.ipad-only,
    :host([mode='iphone']) .dock-icons .app-icon.ipad-only {
      display: none;
    }

    @media (max-width: 640px) {
      .controls {
        justify-content: stretch;
      }

      .controls__group {
        width: 100%;
      }

      .controls input[type='text'] {
        width: 100%;
        min-width: unset;
        flex: 1 1 auto;
      }

      .controls button[type='button'] {
        flex-shrink: 0;
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.startTimers();
  }

  disconnectedCallback(): void {
    this.stopTimers();
    super.disconnectedCallback();
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.has('mode')) {
      this.dispatchEvent(
        new CustomEvent('mode-change', {
          detail: { mode: this.mode },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  render() {
    const homeScreenStyle = styleMap({
      backgroundImage: `url(${this.backgroundUrl})`,
    });

    return html`
      <div class="controls">
        <button type="button" @click=${this.toggleMode}>
          ${this.mode === 'iphone' ? 'Switch to iPad View' : 'Switch to iPhone View'}
        </button>
        <div class="controls__group">
          <input
            type="text"
            name="background-url"
            .value=${this.backgroundInput}
            @input=${this.handleBackgroundInput}
            @keydown=${this.handleBackgroundKeydown}
            placeholder="Enter background image URL..."
            aria-label="Home screen background image URL"
          />
          <button type="button" @click=${this.applyBackground}>Set</button>
        </div>
      </div>
      <div class="device-frame">
        <div class="status-bar" aria-hidden=${this.mode === 'ipad' ? 'true' : 'false'}>
          <span class="status-bar__time">${this.timeDisplay}</span>
          <div class="status-bar__notch"></div>
          <span class="status-bar__battery">${this.batteryLevel}%</span>
        </div>
        <div class="home-screen" style=${homeScreenStyle}>
          <!-- ${HOME_SCREEN_APPS.map((app) => {
            const iconClasses: Record<string, boolean> = {
              'app-icon': true,
              'ipad-only': !!app.ipadOnly,
            };
            app.classes?.forEach((name) => {
              iconClasses[name] = true;
            });
            return html`
              <a class=${classMap(iconClasses)} aria-label=${app.label}>
                <img src=${app.image} alt=${app.label} loading="lazy" />
                <span>${app.label}</span>
              </a>
            `;
          })} -->
        </div>
        <div class="dock">
          <div class="dock-icons">
            ${DOCK_APPS.map((app) => {
              const iconClasses: Record<string, boolean> = {
                'app-icon': true,
                'ipad-only': !!app.ipadOnly,
              };
              return html`
                <a class=${classMap(iconClasses)} href=${app.href ?? '#'} aria-label=${app.label}>
                  <img src=${app.image} alt=${app.label} loading="lazy" />
                  <span>${app.label}</span>
                </a>
              `;
            })}
          </div>
        </div>
      </div>
    `;
  }

  private toggleMode = () => {
    this.mode = this.mode === 'iphone' ? 'ipad' : 'iphone';
  };

  private handleBackgroundInput = (event: Event) => {
    const { value } = event.target as HTMLInputElement;
    this.backgroundInput = value;
  };

  private handleBackgroundKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.applyBackground();
    }
  };

  private applyBackground = () => {
    if (this.backgroundInput.trim()) {
      this.backgroundUrl = this.backgroundInput.trim();
      this.backgroundInput = '';
    }
  };

  private startTimers() {
    this.stopTimers();
    this.timeDisplay = this.formatTime(new Date());
    this.batteryLevel = this.randomBatteryLevel();

    this.timeIntervalId = window.setInterval(() => {
      this.timeDisplay = this.formatTime(new Date());
    }, 1000);

    this.batteryIntervalId = window.setInterval(() => {
      this.batteryLevel = this.randomBatteryLevel();
    }, 30000);
  }

  private stopTimers() {
    if (this.timeIntervalId !== undefined) {
      clearInterval(this.timeIntervalId);
      this.timeIntervalId = undefined;
    }
    if (this.batteryIntervalId !== undefined) {
      clearInterval(this.batteryIntervalId);
      this.batteryIntervalId = undefined;
    }
  }

  private formatTime(date: Date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private randomBatteryLevel() {
    return Math.floor(Math.random() * (100 - 20 + 1)) + 20;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ios-home-screen': IosHomeScreen;
  }
}
