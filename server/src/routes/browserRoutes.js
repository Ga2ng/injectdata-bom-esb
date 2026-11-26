import { Router } from 'express';
import {
  clearBomMenus,
  deleteBomMenu,
  getAllBomMenus,
  getRecentInjectionHistory,
  getRecentLogs,
  saveOrUpdateBomMenu,
  bulkImportBomMenus,
  getAllTargetMenus,
  bulkSaveTargetMenus,
  saveOneTargetMenu,
  toggleTargetMenuStatus,
  deleteTargetMenu,
  clearTargetMenus,
  getExcludedMaterialsList,
  getAllExcludedMaterialsRecords,
  addExcludedMaterialItem,
  removeExcludedMaterialItem,
  toggleExcludedMaterialItem,
  clearAllExcludedMaterials,
} from '../database/db.js';
import { addClient, log, removeClient, sendToClient } from '../events/eventBus.js';
import * as sessionManager from '../browser/sessionManager.js';

export const browserRouter = Router();

browserRouter.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

browserRouter.get('/browser/status', (req, res) => {
  res.json({
    ok: true,
    status: sessionManager.getStatus(),
    logs: getRecentLogs(50),
    totalBomMenus: getAllBomMenus().length,
    recentInjections: getRecentInjectionHistory(10),
  });
});

browserRouter.post('/browser/connect', async (req, res) => {
  try {
    const status = await sessionManager.connect();
    res.json({ ok: true, status });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      ok: false,
      code: err.code || 'CONNECT_ERROR',
      message: err.message,
      cdpUnavailable: Boolean(err.cdpUnavailable),
      status: sessionManager.getStatus(),
    });
  }
});

browserRouter.post('/browser/disconnect', async (req, res) => {
  try {
    const status = await sessionManager.disconnect();
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({
      ok: false,
      code: err.code || 'DISCONNECT_ERROR',
      message: err.message,
      status: sessionManager.getStatus(),
    });
  }
});

// START INJECTION DENGAN INPUT JSON MENU
browserRouter.post('/browser/start', async (req, res) => {
  try {
    const inputData = req.body;
    const report = await sessionManager.startBomInjection(inputData);

    // Jika eksekusi selesai, tandai menu sebagai selesai di DB target
    if (inputData && inputData.menuName) {
      const menuKey = String(inputData.menuNo ? `no_${inputData.menuNo}` : inputData.menuName.replace(/\s+/g, '_').toLowerCase());
      toggleTargetMenuStatus(menuKey, true);
    } else if (Array.isArray(inputData)) {
      for (const m of inputData) {
        if (m && m.menuName) {
          const menuKey = String(m.menuKey || (m.menuNo ? `no_${m.menuNo}` : m.menuName.replace(/\s+/g, '_').toLowerCase()));
          toggleTargetMenuStatus(menuKey, true);
        }
      }
    }

    res.json({ ok: true, status: sessionManager.getStatus(), report });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      ok: false,
      code: err.code || 'START_ERROR',
      message: err.message,
      status: sessionManager.getStatus(),
    });
  }
});

browserRouter.post('/browser/stop', (req, res) => {
  try {
    const status = sessionManager.stopDemo();
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({
      ok: false,
      code: err.code || 'STOP_ERROR',
      message: err.message,
      status: sessionManager.getStatus(),
    });
  }
});

// History Laporan Eksekusi Injeksi
browserRouter.get('/browser/injections', (req, res) => {
  try {
    const history = getRecentInjectionHistory(25);
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ================= EXCLUDED MATERIALS (BAHAN TIDAK PERLU DIINJECT) =================

browserRouter.get('/excluded-materials', (req, res) => {
  try {
    const list = getExcludedMaterialsList();
    const records = getAllExcludedMaterialsRecords();
    res.json({ ok: true, excludedMaterials: list, records });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.post('/excluded-materials/toggle', (req, res) => {
  try {
    const { materialName, isExcluded } = req.body;
    if (!materialName) {
      return res.status(400).json({ ok: false, message: 'materialName wajib diisi.' });
    }
    const updated = toggleExcludedMaterialItem(materialName, isExcluded);
    const records = getAllExcludedMaterialsRecords();
    res.json({ ok: true, excludedMaterials: updated, records });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.delete('/excluded-materials/clear', (req, res) => {
  try {
    const updated = clearAllExcludedMaterials();
    res.json({ ok: true, excludedMaterials: updated, records: [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ================= UPLOADED TARGET MENUS (DATABASE ANTREAN MENU) =================

// Ambil semua target menu yang tersimpan di DB
browserRouter.get('/target-menus', (req, res) => {
  try {
    const list = getAllTargetMenus();
    res.json({ ok: true, menus: list, count: list.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Upload banyak menu dari file JSON ke DB (bisa replace atau append)
browserRouter.post('/target-menus/bulk', (req, res) => {
  try {
    const body = req.body;
    let menuList = [];

    if (Array.isArray(body)) {
      menuList = body;
    } else if (body && Array.isArray(body.menus)) {
      menuList = body.menus;
    } else if (body && body.menuName) {
      menuList = [body];
    } else {
      return res.status(400).json({ ok: false, message: 'Format data JSON tidak valid.' });
    }

    const replace = req.query.replace === 'true';
    const updated = bulkSaveTargetMenus(menuList, replace);
    log('SUCCESS', 'target_menus_saved', `Berhasil menyimpan ${menuList.length} menu ke database antrean lokal.`);
    res.json({ ok: true, menus: updated, count: updated.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Simpan atau Edit 1 Menu di DB
browserRouter.post('/target-menus/item', (req, res) => {
  try {
    const menu = req.body;
    if (!menu || !menu.menuName) {
      return res.status(400).json({ ok: false, message: 'Field menuName wajib ada.' });
    }
    const updated = saveOneTargetMenu(menu);
    log('INFO', 'target_menu_updated', `Menu "${menu.menuName}" berhasil diupdate di database.`);
    res.json({ ok: true, menus: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Tandai status Selesai / Belum Selesai
browserRouter.post('/target-menus/toggle-complete/:menuKey', (req, res) => {
  try {
    const { menuKey } = req.params;
    const { isCompleted } = req.body;
    const updated = toggleTargetMenuStatus(menuKey, isCompleted);
    res.json({ ok: true, menus: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Hapus 1 Menu dari DB
browserRouter.delete('/target-menus/item/:menuKey', (req, res) => {
  try {
    const { menuKey } = req.params;
    const updated = deleteTargetMenu(menuKey);
    log('INFO', 'target_menu_deleted', `Menu ${menuKey} dihapus dari antrean.`);
    res.json({ ok: true, menus: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Kosongkan semua antrean menu dan reset sesi/browser bersih
browserRouter.delete('/target-menus/clear', async (req, res) => {
  try {
    const updated = clearTargetMenus();
    await sessionManager.resetSessionAndBrowser().catch(() => null);
    log('WARNING', 'target_menus_cleared', 'Semua antrean menu di database dibersihkan dan status sesi/browser di-reset bersih.');
    res.json({ ok: true, menus: updated });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// Reset manual sesi & browser
browserRouter.post('/session/reset', async (req, res) => {
  try {
    const status = await sessionManager.resetSessionAndBrowser();
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// ================= BOM SLOTS & MANAGEMENT APIS =================

browserRouter.get('/bom/menus', (req, res) => {
  try {
    const menus = getAllBomMenus();
    res.json({ ok: true, menus, count: menus.length });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.post('/bom/upload', (req, res) => {
  try {
    const body = req.body;
    let menusToImport = [];

    if (Array.isArray(body)) {
      menusToImport = body;
    } else if (body && Array.isArray(body.menus)) {
      menusToImport = body.menus;
    } else if (body && body.bomId && body.menuName) {
      menusToImport = [body];
    } else {
      return res.status(400).json({
        ok: false,
        message: 'Format data JSON tidak valid.',
      });
    }

    const replace = req.query.replace === 'true' || req.body.replace === true;
    const totalCount = bulkImportBomMenus(menusToImport, replace);

    log('SUCCESS', 'bom_imported', `Berhasil mengimpor ${menusToImport.length} data BOM Menu.`);
    res.json({
      ok: true,
      importedCount: menusToImport.length,
      totalCount,
      menus: getAllBomMenus(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.post('/bom/menu', (req, res) => {
  try {
    const menu = req.body;
    if (!menu || !menu.bomId || !menu.menuName) {
      return res.status(400).json({
        ok: false,
        message: 'Field bomId dan menuName wajib diisi.',
      });
    }

    saveOrUpdateBomMenu(menu);
    log('INFO', 'bom_menu_saved', `Menu BOM "${menu.menuName}" (${menu.bomId}) berhasil diperbarui.`);
    res.json({ ok: true, menus: getAllBomMenus() });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.delete('/bom/menu/:bomId', (req, res) => {
  try {
    const { bomId } = req.params;
    const deleted = deleteBomMenu(bomId);
    if (!deleted) {
      return res.status(404).json({ ok: false, message: 'Data BOM tidak ditemukan.' });
    }
    log('INFO', 'bom_menu_deleted', `Menu BOM id ${bomId} dihapus.`);
    res.json({ ok: true, menus: getAllBomMenus() });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

browserRouter.delete('/bom/clear', (req, res) => {
  try {
    clearBomMenus();
    log('WARNING', 'bom_cleared', 'Semua data BOM di database dihapus.');
    res.json({ ok: true, menus: [] });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

// SSE Events
browserRouter.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addClient(res);

  sendToClient(res, 'init', {
    status: sessionManager.getStatus(),
    logs: getRecentLogs(50),
    recentInjections: getRecentInjectionHistory(10),
  });

  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAliveTimer);
      removeClient(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    removeClient(res);
  });
});
