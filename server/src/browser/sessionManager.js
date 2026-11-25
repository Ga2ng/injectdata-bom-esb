import { config } from '../config.js';
import { closeSession, createSession, recordInjectionHistory, toggleTargetMenuStatus } from '../database/db.js';
import { broadcastStatus, log } from '../events/eventBus.js';
import { injectBomMenu } from './bomInjector.js';
import {
  connectToChrome,
  detectLoginStatus,
  disconnectFromChrome,
  findEsbPage,
  isBomUrl,
  isEsbUrl,
  sanitizeUrl,
} from './cdpClient.js';

let browserRef = null;
let esbPageRef = null;
let currentSessionId = null;
let isConnecting = false;
let isDisconnecting = false;
let activeAbortController = null;
let activeTaskPromise = null;

const browserCleanupFns = [];
const pageCleanupFns = [];

const state = {
  connectionStatus: 'Disconnected', // Disconnected | Connecting | Connected | Error
  cdpEndpoint: config.CDP_ENDPOINT,
  browserName: null,
  lastConnectedAt: null,
  errorMessage: null,
  cdpUnavailable: false,
  tabDetected: false,
  tabStatus: 'Not connected', // Not connected | ESB tab detected | ESB tab not found | Navigating | Tab closed
  loginStatus: 'Memeriksa...', // Belum Login | Sudah Login | Memeriksa...
  isAtBomUrl: false, // true jika sedang di https://erp.esb.co.id/bom
  currentUrl: null,
  pageTitle: null,
  lastActivityAt: null,
  taskStatus: 'Idle', // Idle | Running | Stopped | Completed | Error
  currentExecutionReport: null, // Laporan printout hasil eksekusi terakhir
};

function emitStatus() {
  broadcastStatus(getStatus());
}

export function getStatus() {
  return { ...state };
}

function clearCleanupFns(list) {
  while (list.length > 0) {
    const fn = list.pop();
    try {
      fn();
    } catch {
      // Ignore
    }
  }
}

function createConflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = 'CONFLICT';
  return error;
}

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.code = 'BAD_REQUEST';
  return error;
}

function waitWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      const abortErr = new Error('Task aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      const abortErr = new Error('Task aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function safeReadTitle(page) {
  try {
    if (!page || page.isClosed()) return null;
    return await page.title();
  } catch {
    return null;
  }
}

function attachEsbPage(page) {
  if (!page || page.isClosed()) return;
  if (esbPageRef === page) return;

  clearCleanupFns(pageCleanupFns);
  esbPageRef = page;

  const updateFromPage = async (eventName, logNavigation = false) => {
    if (esbPageRef !== page || page.isClosed()) return;
    const rawUrl = page.url();
    if (!isEsbUrl(rawUrl)) {
      esbPageRef = null;
      clearCleanupFns(pageCleanupFns);
      const anotherEsb = findEsbPage(browserRef);
      if (anotherEsb) {
        attachEsbPage(anotherEsb);
        return;
      }
      state.tabDetected = false;
      state.tabStatus = 'ESB tab not found';
      state.loginStatus = 'Unknown';
      state.isAtBomUrl = false;
      state.currentUrl = null;
      state.pageTitle = null;
      state.lastActivityAt = new Date().toISOString();
      log('WARNING', 'esb_tab_left', 'Tab aktif meninggalkan domain ERP ESB.');
      emitStatus();
      return;
    }

    const cleanUrl = sanitizeUrl(rawUrl);
    const title = await safeReadTitle(page);
    const login = await detectLoginStatus(page);
    const atBom = isBomUrl(rawUrl);
    const urlChanged = state.currentUrl !== cleanUrl;
    const loginChanged = state.loginStatus !== login;
    const bomChanged = state.isAtBomUrl !== atBom;

    state.tabDetected = true;
    state.tabStatus = 'ESB tab detected';
    state.loginStatus = login;
    state.isAtBomUrl = atBom;
    state.currentUrl = cleanUrl;
    if (title !== null) {
      state.pageTitle = title;
    }
    state.lastActivityAt = new Date().toISOString();

    if (logNavigation && urlChanged) {
      log('INFO', eventName, `Navigasi ke: ${cleanUrl} (${login})`);
    } else if (loginChanged) {
      log('INFO', 'login_status_changed', `Status Login ESB: ${login}`);
    }

    if (bomChanged) {
      if (atBom) {
        log('SUCCESS', 'bom_page_ready', 'Tab aktif sudah berada di halaman BOM (https://erp.esb.co.id/bom). Siap otomasi!');
      } else {
        log('WARNING', 'not_on_bom', 'Tab saat ini BUKAN di halaman /bom. Navigasikan ke https://erp.esb.co.id/bom');
      }
    }

    emitStatus();
  };

  const onFrameNavigated = (frame) => {
    if (frame === page.mainFrame()) {
      state.tabStatus = 'Navigating';
      state.lastActivityAt = new Date().toISOString();
      emitStatus();
      void updateFromPage('page_navigated', true);
    }
  };

  const onLoad = () => {
    void updateFromPage('page_loaded', false);
  };

  const onClose = () => {
    if (esbPageRef !== page) return;
    esbPageRef = null;
    clearCleanupFns(pageCleanupFns);

    if (activeAbortController && !activeAbortController.signal.aborted) {
      activeAbortController.abort();
      state.taskStatus = 'Stopped';
    }

    const anotherEsb = findEsbPage(browserRef);
    if (anotherEsb) {
      attachEsbPage(anotherEsb);
      log('INFO', 'esb_tab_switched', 'Tab ESB sebelumnya ditutup; beralih ke tab ESB lain.');
      emitStatus();
      return;
    }

    state.tabDetected = false;
    state.tabStatus = 'Tab closed';
    state.loginStatus = 'Unknown';
    state.isAtBomUrl = false;
    state.currentUrl = null;
    state.pageTitle = null;
    state.lastActivityAt = new Date().toISOString();
    log('WARNING', 'esb_tab_closed', 'Tab ESB ditutup pengguna.');
    emitStatus();
  };

  page.on('framenavigated', onFrameNavigated);
  page.on('load', onLoad);
  page.on('close', onClose);

  pageCleanupFns.push(
    () => page.off('framenavigated', onFrameNavigated),
    () => page.off('load', onLoad),
    () => page.off('close', onClose)
  );

  void updateFromPage('page_init', false);
}

function watchContextForEsbTabs(context) {
  const watchPage = (page) => {
    const onFrameNavigated = (frame) => {
      if (frame !== page.mainFrame() || esbPageRef) return;
      if (isEsbUrl(page.url())) {
        void selectAndAnnounceEsbPage(page);
      }
    };
    page.on('framenavigated', onFrameNavigated);
    browserCleanupFns.push(() => page.off('framenavigated', onFrameNavigated));
  };

  for (const page of context.pages()) {
    if (!page.isClosed()) {
      watchPage(page);
    }
  }

  const onNewPage = (page) => {
    watchPage(page);
    if (!esbPageRef && isEsbUrl(page.url())) {
      void selectAndAnnounceEsbPage(page);
    }
  };

  context.on('page', onNewPage);
  browserCleanupFns.push(() => context.off('page', onNewPage));
}

async function selectAndAnnounceEsbPage(page) {
  attachEsbPage(page);
  const cleanUrl = sanitizeUrl(page.url());
  const title = await safeReadTitle(page);
  const login = await detectLoginStatus(page);
  const atBom = isBomUrl(page.url());

  state.tabDetected = true;
  state.tabStatus = 'ESB tab detected';
  state.loginStatus = login;
  state.isAtBomUrl = atBom;
  state.currentUrl = cleanUrl;
  state.pageTitle = title;
  state.lastActivityAt = new Date().toISOString();

  log('SUCCESS', 'esb_tab_detected', `ESB tab detected (${cleanUrl}) - ${login}`);
  if (atBom) {
    log('SUCCESS', 'bom_page_ready', 'Halaman BOM terdeteksi dan siap!');
  }
  emitStatus();
}

function handleUnexpectedDisconnect() {
  if (isDisconnecting) return;

  if (activeAbortController && !activeAbortController.signal.aborted) {
    activeAbortController.abort();
    state.taskStatus = 'Error';
  }
  activeAbortController = null;
  activeTaskPromise = null;

  clearCleanupFns(pageCleanupFns);
  clearCleanupFns(browserCleanupFns);

  if (currentSessionId) {
    closeSession(currentSessionId, {
      disconnectedAt: new Date().toISOString(),
      status: 'disconnected_unexpectedly',
    });
    currentSessionId = null;
  }

  browserRef = null;
  esbPageRef = null;
  state.connectionStatus = 'Disconnected';
  state.browserName = null;
  state.tabDetected = false;
  state.tabStatus = 'Not connected';
  state.loginStatus = 'Unknown';
  state.isAtBomUrl = false;
  state.currentUrl = null;
  state.pageTitle = null;
  state.errorMessage = 'Koneksi ke Chrome terputus.';
  state.lastActivityAt = new Date().toISOString();

  log('ERROR', 'browser_disconnected', 'Koneksi CDP ke Chrome terputus.');
  emitStatus();
}

export async function connect() {
  if (isConnecting) {
    throw createConflictError('Proses koneksi ke Chrome CDP sedang berlangsung.');
  }

  if (browserRef && browserRef.isConnected() && state.connectionStatus === 'Connected') {
    const existingEsb = esbPageRef && !esbPageRef.isClosed() && isEsbUrl(esbPageRef.url())
      ? esbPageRef
      : findEsbPage(browserRef);

    if (existingEsb) {
      await selectAndAnnounceEsbPage(existingEsb);
    } else {
      state.tabDetected = false;
      state.tabStatus = 'ESB tab not found';
      state.loginStatus = 'Unknown';
      state.isAtBomUrl = false;
      state.currentUrl = null;
      state.pageTitle = null;
      emitStatus();
    }
    return getStatus();
  }

  isConnecting = true;
  state.connectionStatus = 'Connecting';
  state.errorMessage = null;
  state.cdpUnavailable = false;
  emitStatus();
  log('INFO', 'cdp_connecting', `Connecting ke Chrome CDP di ${config.CDP_ENDPOINT}...`);

  try {
    const { browser, versionInfo } = await connectToChrome(config.CDP_ENDPOINT);
    browserRef = browser;

    const browserLabel = versionInfo?.Browser || 'Chrome';
    const connectedAt = new Date().toISOString();

    currentSessionId = createSession({
      connectedAt,
      cdpEndpoint: config.CDP_ENDPOINT,
      browserName: browserLabel,
      status: 'connected',
    });

    const onBrowserDisconnected = () => handleUnexpectedDisconnect();
    browser.on('disconnected', onBrowserDisconnected);
    browserCleanupFns.push(() => browser.off('disconnected', onBrowserDisconnected));

    for (const context of browser.contexts()) {
      watchContextForEsbTabs(context);
    }

    state.connectionStatus = 'Connected';
    state.browserName = browserLabel;
    state.lastConnectedAt = connectedAt;
    state.lastActivityAt = connectedAt;
    state.errorMessage = null;
    state.cdpUnavailable = false;

    log('SUCCESS', 'cdp_connected', `Chrome connected (${browserLabel})`);

    const esbPage = findEsbPage(browser);
    if (esbPage) {
      await selectAndAnnounceEsbPage(esbPage);
    } else {
      state.tabDetected = false;
      state.tabStatus = 'ESB tab not found';
      state.loginStatus = 'Unknown';
      state.isAtBomUrl = false;
      state.currentUrl = null;
      state.pageTitle = null;
      log(
        'WARNING',
        'esb_tab_not_found',
        'Chrome connected, tapi tab erp.esb.co.id belum terbuka. Silakan buka https://erp.esb.co.id/bom'
      );
      emitStatus();
    }

    return getStatus();
  } catch (err) {
    browserRef = null;
    esbPageRef = null;
    state.connectionStatus = 'Error';
    state.browserName = null;
    state.tabDetected = false;
    state.tabStatus = 'Not connected';
    state.loginStatus = 'Unknown';
    state.isAtBomUrl = false;
    state.currentUrl = null;
    state.pageTitle = null;
    state.errorMessage = err.message;
    state.cdpUnavailable = Boolean(err.cdpUnavailable);
    state.lastActivityAt = new Date().toISOString();

    log('ERROR', 'cdp_connect_failed', err.message);
    emitStatus();
    throw err;
  } finally {
    isConnecting = false;
  }
}

export async function disconnect() {
  if (activeTaskPromise && activeAbortController && !activeAbortController.signal.aborted) {
    stopDemo();
    try {
      await activeTaskPromise;
    } catch {
      // Stopped
    }
  }

  isDisconnecting = true;
  try {
    clearCleanupFns(pageCleanupFns);
    clearCleanupFns(browserCleanupFns);

    if (browserRef) {
      await disconnectFromChrome(browserRef);
      browserRef = null;
    }
    esbPageRef = null;

    if (currentSessionId) {
      closeSession(currentSessionId, {
        disconnectedAt: new Date().toISOString(),
        status: 'disconnected',
      });
      currentSessionId = null;
    }

    const wasConnected = state.connectionStatus === 'Connected';
    state.connectionStatus = 'Disconnected';
    state.browserName = null;
    state.tabDetected = false;
    state.tabStatus = 'Not connected';
    state.loginStatus = 'Unknown';
    state.isAtBomUrl = false;
    state.currentUrl = null;
    state.pageTitle = null;
    state.errorMessage = null;
    state.cdpUnavailable = false;
    state.lastActivityAt = new Date().toISOString();

    if (wasConnected) {
      log('INFO', 'cdp_disconnected', 'Disconnected Playwright dari Chrome CDP (Chrome tetap terbuka).');
    }
    emitStatus();
    return getStatus();
  } finally {
    isDisconnecting = false;
  }
}

/**
 * Execute actual BOM Injection with input data (single or multiple menus).
 */
export async function startBomInjection(inputData) {
  if (activeTaskPromise || state.taskStatus === 'Running') {
    throw createConflictError('Proses otomasi sedang berjalan.');
  }

  if (!browserRef || !browserRef.isConnected() || state.connectionStatus !== 'Connected') {
    throw createBadRequestError('Chrome belum terhubung via CDP.');
  }

  let targetPage = esbPageRef && !esbPageRef.isClosed() && isEsbUrl(esbPageRef.url())
    ? esbPageRef
    : findEsbPage(browserRef);

  if (!targetPage) {
    state.tabDetected = false;
    state.tabStatus = 'ESB tab not found';
    emitStatus();
    throw createBadRequestError('Tab erp.esb.co.id belum terbuka.');
  }

  if (targetPage !== esbPageRef) {
    attachEsbPage(targetPage);
  }

  // VALIDASI KETAT: Periksa apakah tab berada di https://erp.esb.co.id/bom
  const currentUrl = targetPage.url();
  if (!isBomUrl(currentUrl)) {
    const errorMsg = `DITOLAK: Browser harus berada di URL https://erp.esb.co.id/bom sebelum script dapat dijalankan. URL saat ini: ${currentUrl}`;
    log('ERROR', 'bom_url_validation_failed', errorMsg);
    throw createBadRequestError(errorMsg);
  }

  // VALIDASI LOGIN: Periksa apakah sudah login
  const login = await detectLoginStatus(targetPage);
  if (login === 'Belum Login') {
    const errorMsg = 'DITOLAK: Anda belum login ke ERP ESB. Silakan login terlebih dahulu di Chrome.';
    log('ERROR', 'auth_validation_failed', errorMsg);
    throw createBadRequestError(errorMsg);
  }

  // Parse input data (bisa berupa object tunggal atau array multiple menu)
  let menuList = [];
  if (Array.isArray(inputData)) {
    menuList = inputData;
  } else if (inputData && Array.isArray(inputData.menus)) {
    menuList = inputData.menus;
  } else if (inputData && (inputData.menuName || inputData.namaSystem || inputData.systemName)) {
    menuList = [inputData];
  } else {
    throw createBadRequestError('Data input BOM tidak valid atau tidak memiliki menuName / namaSystem.');
  }

  const controller = new AbortController();
  activeAbortController = controller;
  state.taskStatus = 'Running';
  state.currentExecutionReport = null;
  state.lastActivityAt = new Date().toISOString();
  emitStatus();

  log('INFO', 'inject_process_start', `Memulai eksekusi otomasi untuk ${menuList.length} menu...`);

  const runTask = async () => {
    const executionResults = [];
    try {
      for (let i = 0; i < menuList.length; i++) {
        if (controller.signal.aborted) {
          throw new Error('Task aborted');
        }

        const menu = menuList[i];
        const menuTitle = menu.namaSystem || menu.systemName || menu.menuName;
        log('INFO', 'inject_menu_step', `[${i + 1}/${menuList.length}] Memproses menu: "${menuTitle}"`);

        try {
          const report = await injectBomMenu(targetPage, menu, controller.signal);
          executionResults.push(report);

          // Simpan ke SQLite history
          recordInjectionHistory({
            menuName: report.menuName,
            menuNo: report.menuNo,
            status: report.status,
            totalIngredients: report.totalIngredients,
            addedCount: report.addedIngredients.length,
            skippedCount: report.skippedIngredients.length,
            excludedCount: report.excludedIngredients?.length || 0,
            failedCount: report.failedIngredients.length,
            details: report,
          });

          // Otomatis tandai menu ini SELESAI di uploaded_target_menus DB jika sukses!
          if (report.status === 'Success' || report.status === 'Partial Success') {
            const menuKey = String(
              menu.menuKey ||
              (menu.menuNo ? `no_${menu.menuNo}` : (menu.namaSystem || menu.systemName || menu.menuName).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase())
            );
            try {
              toggleTargetMenuStatus(menuKey, true);
            } catch {
              // Ignore
            }
          }
        } catch (itemErr) {
          if (itemErr.name === 'AbortError' || controller.signal.aborted) {
            throw itemErr;
          }
          log('ERROR', 'inject_menu_failed', `Gagal memproses menu "${menuTitle}": ${itemErr.message}`);
          const failReport = {
            menuName: menuTitle,
            menuNo: menu.menuNo,
            status: 'Failed',
            totalIngredients: (menu.ingredients || []).length,
            addedIngredients: [],
            skippedIngredients: [],
            excludedIngredients: [],
            failedIngredients: [{ error: itemErr.message }],
          };
          executionResults.push(failReport);
          recordInjectionHistory({
            menuName: menuTitle,
            menuNo: menu.menuNo,
            status: 'Failed',
            totalIngredients: (menu.ingredients || []).length,
            addedCount: 0,
            skippedCount: 0,
            excludedCount: 0,
            failedCount: (menu.ingredients || []).length,
            details: failReport,
          });
        }

        // Jika masih ada menu berikutnya dalam antrean batch, beri jeda sebelum lanjut
        if (i < menuList.length - 1 && !controller.signal.aborted) {
          log('INFO', 'inject_next_pause', `Menu "${menu.menuName}" selesai. Jeda 2.5 detik sebelum memproses menu berikutnya (${i + 2}/${menuList.length})...`);
          await new Promise((r) => setTimeout(r, 2500));
        }
      }

      state.taskStatus = 'Completed';
      state.currentExecutionReport = {
        executedAt: new Date().toISOString(),
        totalMenus: menuList.length,
        results: executionResults,
      };
      state.lastActivityAt = new Date().toISOString();
      log('SUCCESS', 'inject_process_completed', `Otomasi BOM selesai! ${executionResults.length} menu telah diproses.`);
      emitStatus();
      return state.currentExecutionReport;
    } catch (err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        state.taskStatus = 'Stopped';
        state.currentExecutionReport = {
          executedAt: new Date().toISOString(),
          totalMenus: menuList.length,
          status: 'Stopped by User',
          results: executionResults,
        };
        emitStatus();
        return state.currentExecutionReport;
      }
      state.taskStatus = 'Error';
      state.errorMessage = err.message;
      state.lastActivityAt = new Date().toISOString();
      log('ERROR', 'inject_process_error', err.message);
      emitStatus();
      throw err;
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
        activeTaskPromise = null;
      }
    }
  };

  activeTaskPromise = runTask();
  return activeTaskPromise;
}

export function stopDemo() {
  if (activeAbortController && !activeAbortController.signal.aborted) {
    activeAbortController.abort();
    state.taskStatus = 'Stopped';
    state.lastActivityAt = new Date().toISOString();
    log('WARNING', 'task_stopped', 'Otomasi BOM dihentikan oleh pengguna (STOP). Browser tetap aman.');
    emitStatus();
    return getStatus();
  }

  state.taskStatus = 'Stopped';
  state.lastActivityAt = new Date().toISOString();
  emitStatus();
  return getStatus();
}

export async function shutdown() {
  await disconnect();
}
