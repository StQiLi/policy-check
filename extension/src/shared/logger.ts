/**
 * Centralized logger for Return Clarity extension.
 * Wraps console methods to allow toggling in production builds.
 */

const PREFIX = '[ReturnClarity]';

/* eslint-disable no-console */
export const logger = {
  info: (...args: unknown[]) => console.log(PREFIX, ...args),
  warn: (...args: unknown[]) => console.warn(PREFIX, ...args),
  error: (...args: unknown[]) => console.error(PREFIX, ...args),
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) {
      console.log(PREFIX, '[debug]', ...args);
    }
  },
};
/* eslint-enable no-console */
