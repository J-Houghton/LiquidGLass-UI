/** Light/dark toggle for the workbench chrome. */
export function initThemeToggle(): void {
  const btn = document.getElementById('btnTheme');
  if (!btn) return;
  const root = document.documentElement;
  const sun = btn.querySelector<HTMLElement>('.icon-sun');
  const moon = btn.querySelector<HTMLElement>('.icon-moon');

  const setIcon = (isDark: boolean) => {
    if (sun) sun.style.display = isDark ? 'block' : 'none';
    if (moon) moon.style.display = isDark ? 'none' : 'block';
  };

  btn.addEventListener('click', () => {
    const isDark = root.dataset.theme === 'dark';
    root.dataset.theme = isDark ? 'light' : 'dark';
    setIcon(!isDark);
  });

  // ?theme=light|dark wins over the system setting (links, screenshots)
  const forced = new URLSearchParams(location.search).get('theme');
  if (forced === 'light') return;
  if (forced === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.dataset.theme = 'dark';
    setIcon(true);
  }
}
