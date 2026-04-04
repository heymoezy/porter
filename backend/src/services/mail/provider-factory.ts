/**
 * Provider factory — shared singleton for the mail provider.
 * Extracted so both mail-admin routes and send-service can share the same instance.
 */

import { config } from '../../config.js';
import { StalwartMailProvider } from './stalwart-provider.js';

let _provider: StalwartMailProvider | null | undefined;

export function getProvider(): StalwartMailProvider | null {
  if (_provider !== undefined) return _provider;
  if (!config.mail.stalwartApiKey) {
    _provider = null;
    return null;
  }
  _provider = new StalwartMailProvider(config.mail.stalwartUrl, config.mail.stalwartApiKey);
  return _provider;
}
