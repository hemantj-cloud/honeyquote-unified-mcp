import { validateEnv, type EnvConfig } from './env.validation.js';

export function configuration(): EnvConfig {
  return validateEnv(process.env);
}
