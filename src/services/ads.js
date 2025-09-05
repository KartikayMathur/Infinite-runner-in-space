import Consent from './consent.js';

export async function requestRewardedAd() {
  if (!Consent.hasConsent()) return Promise.reject(new Error('no-consent'));
  console.log('[ADS] requestRewardedAd - prototype stub');
  // Prototype: simulated ad delay
  return new Promise((resolve) => {
    setTimeout(() => resolve({ completed: true }), 1200);
  });
}

export function showInterstitial() {
  if (!Consent.hasConsent()) {
    console.log('[ADS] interstitial suppressed (no consent)');
    return;
  }
  console.log('[ADS] showInterstitial - prototype stub');
}

export default { requestRewardedAd, showInterstitial };
