CREATE TABLE IF NOT EXISTS browser_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connected_at DATETIME NOT NULL,
  disconnected_at DATETIME NULL,
  cdp_endpoint TEXT NOT NULL,
  browser_name TEXT,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME NOT NULL,
  level TEXT NOT NULL,
  event TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bom_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id TEXT NOT NULL UNIQUE,
  menu_name TEXT NOT NULL,
  bom_type TEXT DEFAULT 'Menu',
  bom_cost_total REAL DEFAULT 0,
  total_materials INTEGER DEFAULT 0,
  materials_json TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS injection_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  executed_at DATETIME NOT NULL,
  menu_name TEXT NOT NULL,
  menu_no TEXT,
  status TEXT NOT NULL,
  total_ingredients INTEGER DEFAULT 0,
  added_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  excluded_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  details_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploaded_target_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_key TEXT NOT NULL UNIQUE,
  menu_no TEXT,
  menu_name TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  total_ingredients INTEGER DEFAULT 0,
  menu_json TEXT NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS excluded_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material_name TEXT NOT NULL UNIQUE,
  is_excluded INTEGER DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_bom_menus_menu_name ON bom_menus(menu_name);
CREATE INDEX IF NOT EXISTS idx_injection_history_executed_at ON injection_history(executed_at);
CREATE INDEX IF NOT EXISTS idx_target_menus_name ON uploaded_target_menus(menu_name);
CREATE INDEX IF NOT EXISTS idx_excluded_materials_name ON excluded_materials(material_name);
