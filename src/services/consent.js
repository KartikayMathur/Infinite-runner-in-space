// Simple consent manager for prototype. Default to true for easy dev — change as needed.
let _consent = true;

export function hasConsent() { return !!_consent; }
export function setConsent(val) { _consent = !!val; console.log('[CONSENT] set to', _consent); }
export default { hasConsent, setConsent };
