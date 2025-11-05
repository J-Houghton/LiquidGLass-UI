import { registerDefaultGlassEffects } from './glass-components';

registerDefaultGlassEffects();

export {
  GlassComponent,
  registerGlassComponent,
  registerDefaultGlassEffects,
  listRegisteredGlassEffects,
  createGlassElement,
} from './glass-components';
export type {
  GlassComponentConfig,
  GlassComponentInit,
  GlassEffectOptions,
  GlassEffectRegistration,
  GlassNoiseKind,
  CreateGlassElementOptions,
} from './glass-components';