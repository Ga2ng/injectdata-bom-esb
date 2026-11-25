import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance = null;
let statements = null;

export function initDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });
  dbInstance = new Database(config.DB_PATH);
  dbInstance.pragma('journal_mode = WAL');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  dbInstance.exec(schemaSql);

  // Auto-migration columns for existing database
  try {
    dbInstance.exec('ALTER TABLE excluded_materials ADD COLUMN is_excluded INTEGER DEFAULT 1');
  } catch {}
  try {
    dbInstance.exec('ALTER TABLE excluded_materials ADD COLUMN updated_at DATETIME');
  } catch {}
  try {
    dbInstance.exec('ALTER TABLE injection_history ADD COLUMN excluded_count INTEGER DEFAULT 0');
  } catch {}

  statements = {
    createSession: dbInstance.prepare(`
      INSERT INTO browser_sessions (connected_at, cdp_endpoint, browser_name, status)
      VALUES (@connectedAt, @cdpEndpoint, @browserName, @status)
    `),
    closeSession: dbInstance.prepare(`
      UPDATE browser_sessions
      SET disconnected_at = @disconnectedAt, status = @status
      WHERE id = @id
    `),
    insertLog: dbInstance.prepare(`
      INSERT INTO activity_logs (created_at, level, event, message)
      VALUES (@createdAt, @level, @event, @message)
    `),
    getRecentLogs: dbInstance.prepare(`
      SELECT id, created_at, level, event, message
      FROM activity_logs
      ORDER BY id DESC
      LIMIT ?
    `),
    getRecentSessions: dbInstance.prepare(`
      SELECT id, connected_at, disconnected_at, cdp_endpoint, browser_name, status
      FROM browser_sessions
      ORDER BY id DESC
      LIMIT ?
    `),
    // BOM Management Queries
    upsertBomMenu: dbInstance.prepare(`
      INSERT INTO bom_menus (bom_id, menu_name, bom_type, bom_cost_total, total_materials, materials_json, updated_at)
      VALUES (@bomId, @menuName, @bomType, @bomCostTotal, @totalMaterials, @materialsJson, @updatedAt)
      ON CONFLICT(bom_id) DO UPDATE SET
        menu_name = excluded.menu_name,
        bom_type = excluded.bom_type,
        bom_cost_total = excluded.bom_cost_total,
        total_materials = excluded.total_materials,
        materials_json = excluded.materials_json,
        updated_at = excluded.updated_at
    `),
    getBomMenus: dbInstance.prepare(`
      SELECT id, bom_id, menu_name, bom_type, bom_cost_total, total_materials, materials_json, updated_at
      FROM bom_menus
      ORDER BY id ASC
    `),
    deleteBomMenuById: dbInstance.prepare(`
      DELETE FROM bom_menus WHERE bom_id = ?
    `),
    clearAllBomMenus: dbInstance.prepare(`
      DELETE FROM bom_menus
    `),
    countBomMenus: dbInstance.prepare(`
      SELECT COUNT(*) as count FROM bom_menus
    `),
    // Injection History Queries
    insertInjectionHistory: dbInstance.prepare(`
      INSERT INTO injection_history (executed_at, menu_name, menu_no, status, total_ingredients, added_count, skipped_count, excluded_count, failed_count, details_json)
      VALUES (@executedAt, @menuName, @menuNo, @status, @totalIngredients, @addedCount, @skippedCount, @excludedCount, @failedCount, @detailsJson)
    `),
    getRecentInjections: dbInstance.prepare(`
      SELECT id, executed_at, menu_name, menu_no, status, total_ingredients, added_count, skipped_count, excluded_count, failed_count, details_json
      FROM injection_history
      ORDER BY id DESC
      LIMIT ?
    `),
    // Uploaded Target Menus (Slot Antrean Injeksi DB)
    upsertTargetMenu: dbInstance.prepare(`
      INSERT INTO uploaded_target_menus (menu_key, menu_no, menu_name, is_completed, total_ingredients, menu_json, updated_at)
      VALUES (@menuKey, @menuNo, @menuName, @isCompleted, @totalIngredients, @menuJson, @updatedAt)
      ON CONFLICT(menu_key) DO UPDATE SET
        menu_no = excluded.menu_no,
        menu_name = excluded.menu_name,
        total_ingredients = excluded.total_ingredients,
        menu_json = excluded.menu_json,
        updated_at = excluded.updated_at
    `),
    getTargetMenus: dbInstance.prepare(`
      SELECT id, menu_key, menu_no, menu_name, is_completed, total_ingredients, menu_json, updated_at
      FROM uploaded_target_menus
      ORDER BY id ASC
    `),
    setTargetMenuCompleted: dbInstance.prepare(`
      UPDATE uploaded_target_menus
      SET is_completed = @isCompleted, updated_at = @updatedAt
      WHERE menu_key = @menuKey
    `),
    deleteTargetMenuByKey: dbInstance.prepare(`
      DELETE FROM uploaded_target_menus WHERE menu_key = ?
    `),
    clearAllTargetMenus: dbInstance.prepare(`
      DELETE FROM uploaded_target_menus
    `),
    // Excluded Materials Queries
    getExcludedMaterials: dbInstance.prepare(`
      SELECT material_name FROM excluded_materials WHERE is_excluded = 1 ORDER BY material_name ASC
    `),
    getAllExcludedMaterialRecords: dbInstance.prepare(`
      SELECT id, material_name, is_excluded, created_at, updated_at FROM excluded_materials ORDER BY material_name ASC
    `),
    upsertExcludedMaterial: dbInstance.prepare(`
      INSERT INTO excluded_materials (material_name, is_excluded, created_at, updated_at)
      VALUES (@materialName, @isExcluded, @createdAt, @updatedAt)
      ON CONFLICT(material_name) DO UPDATE SET
        is_excluded = excluded.is_excluded,
        updated_at = excluded.updated_at
    `),
    clearExcludedMaterials: dbInstance.prepare(`
      DELETE FROM excluded_materials
    `),
  };

  return dbInstance;
}

function ensureStatements() {
  if (!statements) {
    initDatabase();
  }
  return statements;
}

export function createSession({ connectedAt, cdpEndpoint, browserName, status }) {
  const stmt = ensureStatements().createSession;
  const info = stmt.run({
    connectedAt,
    cdpEndpoint,
    browserName: browserName ?? null,
    status,
  });
  return Number(info.lastInsertRowid);
}

export function closeSession(id, { disconnectedAt, status }) {
  if (!id) return;
  const stmt = ensureStatements().closeSession;
  stmt.run({ id, disconnectedAt, status });
}

export function insertLog({ createdAt, level, event, message }) {
  const stmt = ensureStatements().insertLog;
  const info = stmt.run({ createdAt, level, event, message });
  return {
    id: Number(info.lastInsertRowid),
    created_at: createdAt,
    level,
    event,
    message,
  };
}

export function getRecentLogs(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = ensureStatements().getRecentLogs.all(safeLimit);
  return rows.reverse();
}

export function getRecentSessions(limit = 10) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  return ensureStatements().getRecentSessions.all(safeLimit);
}

// BOM helper functions
export function saveOrUpdateBomMenu(menu) {
  const stmt = ensureStatements().upsertBomMenu;
  stmt.run({
    bomId: String(menu.bomId || Date.now()),
    menuName: menu.menuName || 'Tanpa Nama',
    bomType: menu.bomType || 'Menu',
    bomCostTotal: Number(menu.bomCostTotal) || 0,
    totalMaterials: Array.isArray(menu.materials) ? menu.materials.length : Number(menu.totalMaterials) || 0,
    materialsJson: JSON.stringify(menu.materials || []),
    updatedAt: new Date().toISOString(),
  });
}

export function bulkImportBomMenus(menus, replace = false) {
  const db = initDatabase();
  const stmts = ensureStatements();

  const transaction = db.transaction((items) => {
    if (replace) {
      stmts.clearAllBomMenus.run();
    }
    for (const m of items) {
      stmts.upsertBomMenu.run({
        bomId: String(m.bomId || Math.random().toString(36).slice(2, 9)),
        menuName: m.menuName || 'Tanpa Nama',
        bomType: m.bomType || 'Menu',
        bomCostTotal: Number(m.bomCostTotal) || 0,
        totalMaterials: Array.isArray(m.materials) ? m.materials.length : Number(m.totalMaterials) || 0,
        materialsJson: JSON.stringify(m.materials || []),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  transaction(menus);
  return stmts.countBomMenus.get().count;
}

export function getAllBomMenus() {
  const rows = ensureStatements().getBomMenus.all();
  return rows.map((r) => ({
    ...r,
    materials: JSON.parse(r.materials_json || '[]'),
  }));
}

export function deleteBomMenu(bomId) {
  const info = ensureStatements().deleteBomMenuById.run(String(bomId));
  return info.changes > 0;
}

export function clearBomMenus() {
  ensureStatements().clearAllBomMenus.run();
}

// Injection History Helpers
export function recordInjectionHistory({
  menuName,
  menuNo,
  status,
  totalIngredients,
  addedCount,
  skippedCount,
  excludedCount = 0,
  failedCount,
  details,
}) {
  const stmt = ensureStatements().insertInjectionHistory;
  const executedAt = new Date().toISOString();
  stmt.run({
    executedAt,
    menuName: menuName || 'Tanpa Nama',
    menuNo: menuNo ? String(menuNo) : null,
    status: status || 'Completed',
    totalIngredients: Number(totalIngredients) || 0,
    addedCount: Number(addedCount) || 0,
    skippedCount: Number(skippedCount) || 0,
    excludedCount: Number(excludedCount) || 0,
    failedCount: Number(failedCount) || 0,
    detailsJson: JSON.stringify(details || []),
  });
}

export function getRecentInjectionHistory(limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const rows = ensureStatements().getRecentInjections.all(safeLimit);
  return rows.map((r) => ({
    ...r,
    details: JSON.parse(r.details_json || '[]'),
  }));
}

// Helper auto-replace "TOGE PANJANG" -> "tauge panjang"
function cleanMenuData(menu) {
  if (Array.isArray(menu.ingredients)) {
    for (const ing of menu.ingredients) {
      if (ing && ing.bahan && /toge\s*panjang/i.test(ing.bahan)) {
        ing.bahan = 'tauge panjang';
      }
    }
  }
  return menu;
}

// ================= UPLOADED TARGET MENUS (Slot Antrean Injeksi DB) =================

export function bulkSaveTargetMenus(menuList, replace = false) {
  const db = initDatabase();
  const stmts = ensureStatements();

  const transaction = db.transaction((items) => {
    if (replace) {
      stmts.clearAllTargetMenus.run();
    }
    for (let m of items) {
      m = cleanMenuData(m);
      // Baca salah satu kolom: namaSystem atau systemName terlebih dahulu
      const title = (m.namaSystem || m.systemName || m.menuName || 'Tanpa Nama').trim();
      const menuKey = String(
        m.menuKey ||
        (m.menuNo ? `no_${m.menuNo}` : (m.namaSystem || m.systemName || m.menuName) ? (m.namaSystem || m.systemName || m.menuName).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : Math.random().toString(36).slice(2, 9))
      );
      stmts.upsertTargetMenu.run({
        menuKey,
        menuNo: m.menuNo ? String(m.menuNo) : '',
        menuName: title,
        isCompleted: 0,
        totalIngredients: Array.isArray(m.ingredients) ? m.ingredients.length : 0,
        menuJson: JSON.stringify(m),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  transaction(menuList);
  return getAllTargetMenus();
}

export function saveOneTargetMenu(menu) {
  menu = cleanMenuData(menu);
  // Baca salah satu kolom: namaSystem atau systemName terlebih dahulu
  const title = (menu.namaSystem || menu.systemName || menu.menuName || 'Tanpa Nama').trim();
  const menuKey = String(
    menu.menuKey ||
    (menu.menuNo ? `no_${menu.menuNo}` : (menu.namaSystem || menu.systemName || menu.menuName) ? (menu.namaSystem || menu.systemName || menu.menuName).replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() : Date.now())
  );
  ensureStatements().upsertTargetMenu.run({
    menuKey,
    menuNo: menu.menuNo ? String(menu.menuNo) : '',
    menuName: title,
    isCompleted: menu.isCompleted ? 1 : 0,
    totalIngredients: Array.isArray(menu.ingredients) ? menu.ingredients.length : 0,
    menuJson: JSON.stringify(menu),
    updatedAt: new Date().toISOString(),
  });
  return getAllTargetMenus();
}

export function getAllTargetMenus() {
  const rows = ensureStatements().getTargetMenus.all();
  return rows.map((r) => ({
    ...r,
    isCompleted: Boolean(r.is_completed),
    menuData: JSON.parse(r.menu_json || '{}'),
  }));
}

export function toggleTargetMenuStatus(menuKey, isCompleted) {
  ensureStatements().setTargetMenuCompleted.run({
    menuKey,
    isCompleted: isCompleted ? 1 : 0,
    updatedAt: new Date().toISOString(),
  });
  return getAllTargetMenus();
}

export function deleteTargetMenu(menuKey) {
  ensureStatements().deleteTargetMenuByKey.run(menuKey);
  return getAllTargetMenus();
}

export function clearTargetMenus() {
  ensureStatements().clearAllTargetMenus.run();
  return [];
}

// ================= EXCLUDED MATERIALS (Bahan yang tidak harus diinject) =================

export function getExcludedMaterialsList() {
  const rows = ensureStatements().getExcludedMaterials.all();
  return rows.map((r) => r.material_name);
}

export function getAllExcludedMaterialsRecords() {
  const rows = ensureStatements().getAllExcludedMaterialRecords.all();
  return rows.map((r) => ({
    id: r.id,
    material_name: r.material_name,
    is_excluded: Boolean(r.is_excluded),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export function setMaterialExcludedState(materialName, isExcluded) {
  if (!materialName || typeof materialName !== 'string') return getExcludedMaterialsList();
  const trimmed = materialName.trim();
  if (!trimmed) return getExcludedMaterialsList();

  const now = new Date().toISOString();
  ensureStatements().upsertExcludedMaterial.run({
    materialName: trimmed,
    isExcluded: isExcluded ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });

  insertLog({
    createdAt: now,
    level: 'INFO',
    event: 'exclude_setting_change',
    message: `[PENGATURAN BAHAN] "${trimmed}" disimpan permanen statusnya: ${isExcluded ? '🛡️ EXCLUDE (Dilewati)' : '🟢 INCLUDE (Diinjeksi)'}`,
  });

  return getExcludedMaterialsList();
}

export function addExcludedMaterialItem(materialName) {
  return setMaterialExcludedState(materialName, true);
}

export function removeExcludedMaterialItem(materialName) {
  return setMaterialExcludedState(materialName, false);
}

export function toggleExcludedMaterialItem(materialName, isExcluded) {
  return setMaterialExcludedState(materialName, isExcluded);
}

export function clearAllExcludedMaterials() {
  ensureStatements().clearExcludedMaterials.run();
  insertLog({
    createdAt: new Date().toISOString(),
    level: 'INFO',
    event: 'exclude_clear_all',
    message: '[PENGATURAN BAHAN] Seluruh konfigurasi exclude bahan di-reset.',
  });
  return [];
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    statements = null;
  }
}
