import { chromium } from 'playwright-core';
import { config } from '../config.js';

function createAppError(code, message, extra = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

/**
 * Determine whether a URL belongs to erp.esb.co.id or esb.co.id.
 */
export function isEsbUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'erp.esb.co.id' ||
      hostname === 'esb.co.id' ||
      hostname.endsWith('.esb.co.id')
    );
  } catch {
    return false;
  }
}

/**
 * Determine whether current URL is exactly or within the BOM section (/bom)
 */
export function isBomUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      (hostname === 'erp.esb.co.id' || hostname.endsWith('.esb.co.id')) &&
      (pathname === '/bom' || pathname.startsWith('/bom/'))
    );
  } catch {
    return false;
  }
}

/**
 * Check whether current page appears to be logged in on ESB ERP.
 * We inspect URL path and common auth indicators safely without touching passwords/tokens.
 */
export async function detectLoginStatus(page) {
  if (!page || page.isClosed()) {
    return 'Unknown';
  }
  try {
    const urlStr = page.url().toLowerCase();
    
    // Explicit login paths
    if (
      urlStr.includes('/login') ||
      urlStr.includes('/auth') ||
      urlStr.includes('/signin')
    ) {
      return 'Belum Login';
    }

    // Check page content/DOM indicators safely
    const isLoginState = await page.evaluate(() => {
      // Look for password input or login form
      const passwordInput = document.querySelector('input[type="password"]');
      if (passwordInput) return false;

      // Look for standard dashboard elements (sidebar, logout, user profile, header)
      const hasDashboard = document.querySelector(
        'header, nav, aside, [class*="sidebar"], [class*="user"], [class*="profile"], [class*="dashboard"], [id*="sidebar"], [id*="navbar"]'
      );
      if (hasDashboard) return true;

      return null;
    }).catch(() => null);

    if (isLoginState === false) {
      return 'Belum Login';
    }
    if (isLoginState === true) {
      return 'Sudah Login';
    }

    // Default heuristic: if on ERP without /login in path
    if (urlStr.includes('erp.esb.co.id') && !urlStr.includes('login')) {
      return 'Sudah Login';
    }
    return 'Belum Login';
  } catch {
    return 'Unknown';
  }
}

/**
 * Strip or redact sensitive query parameters before logging or broadcasting URLs.
 */
export function sanitizeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(rawUrl);
    const sensitiveKeys = [
      'token',
      'access_token',
      'refresh_token',
      'id_token',
      'auth',
      'session',
      'sid',
      'key',
      'api_key',
      'secret',
      'password',
      'code',
      'signature',
      'sig',
    ];
    for (const key of parsed.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (sensitiveKeys.some((s) => lower === s || lower.includes(s))) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Verify that the local Chrome remote debugging endpoint is reachable.
 */
export async function checkCdpEndpoint(cdpEndpoint = config.CDP_ENDPOINT) {
  const versionUrl = `${cdpEndpoint}/json/version`;
  let response;
  try {
    response = await fetch(versionUrl, {
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    throw createAppError(
      'CDP_UNAVAILABLE',
      `Endpoint CDP lokal (${cdpEndpoint}) tidak dapat dijangkau. Chrome belum dijalankan atau port 9222 belum aktif.`,
      { cdpUnavailable: true, statusCode: 503 }
    );
  }

  if (!response.ok) {
    throw createAppError(
      'CDP_UNAVAILABLE',
      `Endpoint CDP (${cdpEndpoint}) merespons HTTP ${response.status}.`,
      { cdpUnavailable: true, statusCode: 503 }
    );
  }

  try {
    return await response.json();
  } catch {
    throw createAppError(
      'CDP_INVALID_RESPONSE',
      `Endpoint ${cdpEndpoint} tidak mengembalikan metadata CDP Chrome yang valid.`,
      { cdpUnavailable: true, statusCode: 502 }
    );
  }
}

/**
 * Connect Playwright to an already-running Chrome instance over local CDP.
 */
export async function connectToChrome(cdpEndpoint = config.CDP_ENDPOINT) {
  const versionInfo = await checkCdpEndpoint(cdpEndpoint);
  try {
    const browser = await chromium.connectOverCDP(cdpEndpoint);
    return { browser, versionInfo };
  } catch (err) {
    throw createAppError(
      'CDP_CONNECT_FAILED',
      `Gagal menghubungkan Playwright ke Chrome CDP (${cdpEndpoint}): ${err.message}`,
      { cdpUnavailable: true, statusCode: 502 }
    );
  }
}

/**
 * Find an open tab whose hostname matches erp.esb.co.id.
 * Prefers tab currently on /bom if available.
 */
export function findEsbPage(browser) {
  if (!browser) return null;
  let fallbackPage = null;

  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      const url = page.url();
      if (isBomUrl(url)) {
        return page; // Prioritas utama: tab yang sedang di /bom
      }
      if (!fallbackPage && isEsbUrl(url)) {
        fallbackPage = page;
      }
    }
  }
  return fallbackPage;
}

/**
 * Detach Playwright's CDP client without closing Chrome or user tabs.
 */
export async function disconnectFromChrome(browser) {
  if (!browser) return;
  try {
    await browser.close();
  } catch {
    // Ignore error if already closed
  }
}
