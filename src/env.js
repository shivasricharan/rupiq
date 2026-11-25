// Environment detection (pure, unit-tested).
/** Apps that open links in their own embedded browser; storage there is separate from Chrome/Safari. */
export const inAppBrowser = (ua = '') => /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Snapchat|MicroMessenger|Twitter|LinkedInApp|GSA\/|Line\/|; wv\)/i.test(ua);
export const isIOS = (ua = '', maxTouch = 0) => /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1);
export const isStandalone = (w = globalThis) => !!(w.matchMedia?.('(display-mode: standalone)').matches || w.navigator?.standalone === true);
