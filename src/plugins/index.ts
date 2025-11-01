import { registerDefaultGlassEffects } from './glass-components';

registerDefaultGlassEffects();

export { GlassComponent, registerGlassComponent, registerDefaultGlassEffects, listRegisteredGlassEffects } from './glass-components';
export type { GlassComponentConfig, GlassComponentInit, GlassEffectOptions, GlassEffectRegistration, GlassNoiseKind } from './glass-components';