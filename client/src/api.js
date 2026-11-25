const CSRF_HEADER = {
  'X-Requested-With': 'ESB-Local-Controller',
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.method === 'POST' || options.method === 'DELETE' ? CSRF_HEADER : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || (data && data.ok === false)) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.code = data?.code;
    error.cdpUnavailable = Boolean(data?.cdpUnavailable);
    error.statusData = data?.status || null;
    throw error;
  }

  return data;
}

export function getHealth() {
  return request('/api/health');
}

export function getBrowserStatus() {
  return request('/api/browser/status');
}

export function connectBrowser() {
  return request('/api/browser/connect', { method: 'POST' });
}

export function disconnectBrowser() {
  return request('/api/browser/disconnect', { method: 'POST' });
}

// Start Injection dengan payload data BOM
export function startInjection(payload) {
  return request('/api/browser/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function stopInjection() {
  return request('/api/browser/stop', { method: 'POST' });
}

export function getInjectionHistory() {
  return request('/api/browser/injections');
}

// ================= EXCLUDED MATERIALS APIS =================

export function getExcludedMaterials() {
  return request('/api/excluded-materials');
}

export function toggleExcludedMaterial(materialName, isExcluded) {
  return request('/api/excluded-materials/toggle', {
    method: 'POST',
    body: JSON.stringify({ materialName, isExcluded }),
  });
}

export function clearExcludedMaterials() {
  return request('/api/excluded-materials/clear', {
    method: 'DELETE',
  });
}

// ================= TARGET MENUS DB (Slot Antrean Injeksi) =================

export function getTargetMenus() {
  return request('/api/target-menus');
}

export function uploadTargetMenusBulk(payload, replace = false) {
  return request(`/api/target-menus/bulk?replace=${replace}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveTargetMenuItem(menu) {
  return request('/api/target-menus/item', {
    method: 'POST',
    body: JSON.stringify(menu),
  });
}

export function toggleTargetMenuCompleted(menuKey, isCompleted) {
  return request(`/api/target-menus/toggle-complete/${menuKey}`, {
    method: 'POST',
    body: JSON.stringify({ isCompleted }),
  });
}

export function deleteTargetMenuItem(menuKey) {
  return request(`/api/target-menus/item/${menuKey}`, {
    method: 'DELETE',
  });
}

export function clearTargetMenusAll() {
  return request('/api/target-menus/clear', {
    method: 'DELETE',
  });
}

// ================= BOM SLOTS & MANAGEMENT APIS =================
export function getBomMenus() {
  return request('/api/bom/menus');
}

export function uploadBomJson(payload, replace = false) {
  return request(`/api/bom/upload?replace=${replace}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveBomMenu(menu) {
  return request('/api/bom/menu', {
    method: 'POST',
    body: JSON.stringify(menu),
  });
}

export function deleteBomMenu(bomId) {
  return request(`/api/bom/menu/${bomId}`, {
    method: 'DELETE',
  });
}

export function clearBomMenus() {
  return request('/api/bom/clear', {
    method: 'DELETE',
  });
}

export function subscribeEvents({ onInit, onStatus, onLog, onOpen, onError }) {
  const eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    onOpen?.();
  };

  eventSource.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'init') {
        onInit?.(parsed.payload);
      } else if (parsed.type === 'status') {
        onStatus?.(parsed.payload);
      } else if (parsed.type === 'log') {
        onLog?.(parsed.payload);
      }
    } catch {
      // Ignore
    }
  };

  eventSource.onerror = (err) => {
    onError?.(err);
  };

  return () => {
    eventSource.close();
  };
}
