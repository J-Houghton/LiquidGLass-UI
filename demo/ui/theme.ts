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

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.dataset.theme = 'dark';
    setIcon(true);
  }
}
