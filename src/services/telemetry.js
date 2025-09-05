import Consent from './consent.js';
const TAG = '[TELEMETRY]';

export function emit(event, payload = {}) {
  if (!Consent.hasConsent()) {
    // Respect privacy: do not emit events when consent not given
    console.log(`${TAG} (suppressed, no consent)`, event, payload);
    return;
  }
  // Prototype: simple console output. Replace with real SDK sink later.
  console.log(`${TAG}`, event, payload);
}

export default { emit };
