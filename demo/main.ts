// Demo entry. Explicit calls (not side-effect imports) so the bundle keeps every module even
// though the package declares `sideEffects: false`.
import { initDemoStage } from './ui/demoStage.ts';
import { initConfigPane } from './ui/configPane.ts';
import { initCodePanel } from './ui/codePanel.ts';
import { initThemeToggle } from './ui/theme.ts';

initThemeToggle();
initDemoStage();
initConfigPane();
initCodePanel();
