import { useEffect, useMemo, useState } from 'react';
import {
  clearExcludedMaterials,
  clearTargetMenusAll,
  deleteTargetMenuItem,
  getExcludedMaterials,
  getTargetMenus,
  saveTargetMenuItem,
  toggleExcludedMaterial,
  toggleTargetMenuCompleted,
  uploadTargetMenusBulk,
} from '../api.js';

function getTaskBadgeClass(taskStatus) {
  switch (taskStatus) {
    case 'Running':
      return 'badge badge-info';
    case 'Completed':
      return 'badge badge-success';
    case 'Stopped':
      return 'badge badge-warning';
    case 'Error':
      return 'badge badge-error';
    default:
      return 'badge badge-neutral';
  }
}

export function ControlBar({
  status,
  backendOnline,
  busyAction,
  onStartInjection,
  onStopInjection,
}) {
  const [targetMenus, setTargetMenus] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedBatchKeys, setSelectedBatchKeys] = useState(new Set());
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [isDryRun, setIsDryRun] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fitur Bahan Excluded (Bahan yang tidak harus diinject)
  const [excludedMaterials, setExcludedMaterials] = useState([]);
  const [excludedRecords, setExcludedRecords] = useState([]);
  const [matSearchTerm, setMatSearchTerm] = useState('');
  const [matFilterTab, setMatFilterTab] = useState('ALL'); // ALL | EXCLUDED | INCLUDED
  const [customMatInput, setCustomMatInput] = useState('');
  const [showExcludedModal, setShowExcludedModal] = useState(false);

  // Load target menus & excluded materials (pada mount awal & saat backend online)
  useEffect(() => {
    loadSavedTargetMenus();
    loadExcludedMaterials();
  }, []);

  useEffect(() => {
    if (backendOnline) {
      loadSavedTargetMenus();
      loadExcludedMaterials();
    }
  }, [backendOnline]);

  const loadSavedTargetMenus = async () => {
    try {
      const res = await getTargetMenus();
      if (Array.isArray(res.menus)) {
        setTargetMenus(res.menus);
        // Default: pilih semua menu yang belum selesai untuk batch inject
        setSelectedBatchKeys((prev) => {
          if (prev && prev.size > 0) return prev;
          const pending = new Set(res.menus.filter((m) => !m.isCompleted).map((m) => m.menu_key));
          return pending.size > 0 ? pending : new Set(res.menus.map((m) => m.menu_key));
        });

        if (res.menus.length > 0 && !selectedKey) {
          const firstPending = res.menus.find((m) => !m.isCompleted) || res.menus[0];
          setSelectedKey(firstPending.menu_key);
          setJsonInput(JSON.stringify(firstPending.menuData, null, 2));
        }
      }
    } catch {
      // Ignore
    }
  };

  const loadExcludedMaterials = async () => {
    try {
      const res = await getExcludedMaterials();
      if (Array.isArray(res.excludedMaterials)) {
        setExcludedMaterials(res.excludedMaterials);
      }
      if (Array.isArray(res.records)) {
        setExcludedRecords(res.records);
      }
    } catch {
      // Ignore
    }
  };

  // Kumpulkan semua nama bahan unik dari seluruh data JSON di database + record di SQLite
  const allUniqueMaterials = useMemo(() => {
    const set = new Set();
    targetMenus.forEach((m) => {
      const ings = m.menuData?.ingredients || [];
      ings.forEach((ing) => {
        if (ing?.bahan) {
          set.add(ing.bahan.trim());
        }
      });
    });
    excludedMaterials.forEach((m) => {
      if (m) set.add(m.trim());
    });
    excludedRecords.forEach((r) => {
      if (r?.material_name) set.add(r.material_name.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [targetMenus, excludedMaterials, excludedRecords]);

  // Handler toggle bahan yang di-exclude / include
  const handleToggleExclude = async (matName) => {
    const isCurrentlyExcluded = excludedMaterials.some((m) => m.toLowerCase() === matName.toLowerCase());
    try {
      const res = await toggleExcludedMaterial(matName, !isCurrentlyExcluded);
      if (Array.isArray(res.excludedMaterials)) {
        setExcludedMaterials(res.excludedMaterials);
      }
      if (Array.isArray(res.records)) {
        setExcludedRecords(res.records);
      }
    } catch (err) {
      alert(`Gagal update exclude bahan: ${err.message}`);
    }
  };

  // Tambah bahan kustom secara manual ke daftar exclude permanen
  const handleAddCustomMaterial = async (e) => {
    e?.preventDefault();
    if (!customMatInput.trim()) return;
    const name = customMatInput.trim();
    try {
      const res = await toggleExcludedMaterial(name, true);
      if (Array.isArray(res.excludedMaterials)) {
        setExcludedMaterials(res.excludedMaterials);
      }
      if (Array.isArray(res.records)) {
        setExcludedRecords(res.records);
      }
      setCustomMatInput('');
    } catch (err) {
      alert(`Gagal menambah bahan exclude: ${err.message}`);
    }
  };

  const handleClearAllExcluded = async () => {
    if (!window.confirm('Reset semua daftar bahan yang di-exclude?')) return;
    try {
      const res = await clearExcludedMaterials();
      setExcludedMaterials(res.excludedMaterials || []);
      setExcludedRecords(res.records || []);
    } catch (err) {
      alert(`Gagal: ${err.message}`);
    }
  };

  // Upload file JSON penuh langsung tersimpan ke Database SQLite (auto replace TOGE PANJANG -> tauge panjang)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setParseError(null);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target.result || '';
        const data = JSON.parse(text);

        let menuList = [];
        if (Array.isArray(data)) {
          menuList = data;
        } else if (data && Array.isArray(data.menus)) {
          menuList = data.menus;
        } else if (data && (data.namaSystem || data.systemName || data.menuName)) {
          menuList = [data];
        }

        if (menuList.length > 0) {
          // Bersihkan dan ganti "TOGE PANJANG" -> "tauge panjang"
          menuList = menuList.map((m) => {
            if (Array.isArray(m.ingredients)) {
              m.ingredients = m.ingredients.map((ing) => {
                if (ing && ing.bahan && /toge\s*panjang/i.test(ing.bahan)) {
                  return { ...ing, bahan: 'tauge panjang' };
                }
                return ing;
              });
            }
            return m;
          });

          const res = await uploadTargetMenusBulk(menuList, false);
          if (Array.isArray(res.menus)) {
            setTargetMenus(res.menus);
            // Default pilih semua menu baru yang belum selesai untuk batch
            setSelectedBatchKeys(new Set(res.menus.filter((m) => !m.isCompleted).map((m) => m.menu_key)));
            const first = res.menus[0];
            setSelectedKey(first.menu_key);
            setJsonInput(JSON.stringify(first.menuData, null, 2));
          }
        } else {
          setParseError('File JSON tidak memiliki array "menus" atau "menuName" yang valid.');
        }
      } catch (err) {
        setParseError(`Gagal membaca & menyimpan JSON: ${err.message}`);
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleSelectMenu = (item) => {
    setSelectedKey(item.menu_key);
    setJsonInput(JSON.stringify(item.menuData, null, 2));
    setParseError(null);
  };

  const handleSaveJsonEdit = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const res = await saveTargetMenuItem(parsed);
      if (Array.isArray(res.menus)) {
        setTargetMenus(res.menus);
      }
      alert('Perubahan menu berhasil disimpan ke Database!');
    } catch (err) {
      setParseError(`JSON tidak valid: ${err.message}`);
    }
  };

  const handleToggleComplete = async (e, item) => {
    e.stopPropagation();
    try {
      const res = await toggleTargetMenuCompleted(item.menu_key, !item.isCompleted);
      if (Array.isArray(res.menus)) {
        setTargetMenus(res.menus);
      }
    } catch (err) {
      alert(`Gagal ubah status: ${err.message}`);
    }
  };

  const handleDeleteMenu = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Hapus menu "${item.menu_name}" dari database antrean?`)) return;
    try {
      const res = await deleteTargetMenuItem(item.menu_key);
      if (Array.isArray(res.menus)) {
        setTargetMenus(res.menus);
        setSelectedBatchKeys((prev) => {
          const next = new Set(prev);
          next.delete(item.menu_key);
          return next;
        });
        if (selectedKey === item.menu_key) {
          if (res.menus.length > 0) {
            setSelectedKey(res.menus[0].menu_key);
            setJsonInput(JSON.stringify(res.menus[0].menuData, null, 2));
          } else {
            setSelectedKey(null);
            setJsonInput('');
          }
        }
      }
    } catch (err) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Yakin ingin mengosongkan seluruh antrean menu di database?')) return;
    try {
      const res = await clearTargetMenusAll();
      setTargetMenus(res.menus || []);
      setSelectedBatchKeys(new Set());
      setSelectedKey(null);
      setJsonInput('');
    } catch (err) {
      alert(`Gagal: ${err.message}`);
    }
  };

  // Helper seleksi menu untuk batch injection (Pilih mana yang di-inject vs dikecualikan)
  const toggleBatchSelect = (menuKey) => {
    setSelectedBatchKeys((prev) => {
      const next = new Set(prev);
      if (next.has(menuKey)) {
        next.delete(menuKey);
      } else {
        next.add(menuKey);
      }
      return next;
    });
  };

  const handleSelectAllBatch = () => {
    setSelectedBatchKeys(new Set(targetMenus.map((m) => m.menu_key)));
  };

  const handleDeselectAllBatch = () => {
    setSelectedBatchKeys(new Set());
  };

  const handleSelectOnlyPendingBatch = () => {
    setSelectedBatchKeys(new Set(targetMenus.filter((m) => !m.isCompleted).map((m) => m.menu_key)));
  };

  // 1-KLIK INJECT ALL: Eksekusi semua menu yang dipilih/tidak dikecualikan
  const handleStartBatch = () => {
    setParseError(null);
    const chosenMenus = targetMenus.filter((m) => selectedBatchKeys.has(m.menu_key));

    if (chosenMenus.length === 0) {
      alert('Tidak ada menu yang dipilih untuk di-inject! Silakan centang menu yang ingin diproses.');
      return;
    }

    const confirmMsg = isDryRun
      ? `Jalankan 1-KLIK DRY RUN untuk ${chosenMenus.length} menu terpilih?\n\n(Hanya membandingkan bahan tanpa mengubah data web)`
      : `PERINGATAN: Akan melakukan 1-KLIK INJEKSI OTOMATIS ke ERP ESB untuk ${chosenMenus.length} menu terpilih secara berurutan.\n\nPastikan tab browser Chrome sudah login dan aktif di https://erp.esb.co.id/bom.\n\nLanjutkan?`;

    if (!window.confirm(confirmMsg)) return;

    const payload = chosenMenus.map((m) => ({
      ...m.menuData,
      menuKey: m.menu_key,
      dryRun: isDryRun,
    }));

    onStartInjection(payload);
  };

  // Eksekusi menu tunggal yang sedang aktif di JSON editor
  const handleStartSingle = () => {
    setParseError(null);
    let targetPayload = null;

    try {
      targetPayload = JSON.parse(jsonInput);
    } catch (e) {
      setParseError(`JSON tidak valid: ${e.message}`);
      return;
    }

    if (!targetPayload.namaSystem && !targetPayload.systemName && !targetPayload.menuName && !Array.isArray(targetPayload) && !targetPayload.menus) {
      setParseError('Data JSON harus memiliki kolom namaSystem / systemName atau menuName!');
      return;
    }

    if (typeof targetPayload === 'object' && !Array.isArray(targetPayload)) {
      targetPayload.dryRun = isDryRun;
    }

    onStartInjection(targetPayload);
  };

  const isRunning = status.taskStatus === 'Running' || busyAction === 'start';
  const isReady =
    backendOnline &&
    status.connectionStatus === 'Connected' &&
    status.tabDetected &&
    status.loginStatus === 'Sudah Login' &&
    status.isAtBomUrl &&
    !isRunning;

  const filteredMenus = targetMenus.filter((m) => {
    if (hideCompleted && m.isCompleted) return false;
    const search = menuSearchTerm.toLowerCase();
    const sysName = (m.menuData?.namaSystem || m.menuData?.systemName || '').toLowerCase();
    return (
      m.menu_name.toLowerCase().includes(search) ||
      sysName.includes(search) ||
      String(m.menu_no || '').includes(search)
    );
  });

  const completedCount = targetMenus.filter((m) => m.isCompleted).length;

  const filteredUniqueMaterials = allUniqueMaterials.filter((m) => {
    const matchesSearch = m.toLowerCase().includes(matSearchTerm.toLowerCase());
    if (!matchesSearch) return false;
    const isExcluded = excludedMaterials.some((ex) => ex.toLowerCase() === m.toLowerCase());
    if (matFilterTab === 'EXCLUDED') return isExcluded;
    if (matFilterTab === 'INCLUDED') return !isExcluded;
    return true;
  });

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Database Antrean Injeksi BOM (Upload & Simpan di DB)</h2>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Data tersimpan permanen di SQLite. Pilih 1 per 1, edit bahan, atur bahan yang di-exclude, atau tandai selesai.
          </span>
        </div>
        <span className={getTaskBadgeClass(status.taskStatus)}>
          Task: {status.taskStatus}
        </span>
      </div>

      <div style={{ marginBottom: '12px', fontSize: '13px' }}>
        <strong>Status & Deteksi:</strong>
        <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
          <li style={{ color: status.connectionStatus === 'Connected' ? '#15803d' : '#6b7280' }}>
            Browser CDP Terhubung: {status.connectionStatus === 'Connected' ? '✓' : '✗'}
          </li>
          <li style={{ color: status.loginStatus === 'Sudah Login' ? '#15803d' : '#b91c1c' }}>
            Sudah Login ERP: {status.loginStatus === 'Sudah Login' ? '✓' : '✗'}
          </li>
          <li style={{ color: status.isAtBomUrl ? '#15803d' : '#b91c1c' }}>
            Halaman BOM ERP: {status.isAtBomUrl ? '✓ (Aktif)' : '✗ (Harus buka https://erp.esb.co.id/bom)'}
          </li>
        </ul>
      </div>

      {/* Bagian Upload & Manajemen Antrean DB */}
      <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <strong>Antrean Menu di Database:</strong>
            <span className="badge badge-info">{targetMenus.length} Total Menu</span>
            <span className="badge badge-success">{completedCount} Selesai</span>
            <span className="badge badge-warning">{targetMenus.length - completedCount} Belum</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* Tombol Buka Pengaturan Bahan yang Tidak Di-inject */}
            <button
              type="button"
              className="btn"
              style={{
                background: excludedMaterials.length > 0 ? '#fef3c7' : '#fff',
                borderColor: excludedMaterials.length > 0 ? '#d97706' : '#cbd5e1',
                color: excludedMaterials.length > 0 ? '#b45309' : '#1f2937',
                fontWeight: 'bold',
                fontSize: '12px',
              }}
              onClick={() => setShowExcludedModal(!showExcludedModal)}
            >
              🛡️ Atur Bahan Exclude / Include ({excludedMaterials.length})
            </button>

            <label className="btn btn-primary" style={{ cursor: 'pointer', padding: '5px 12px' }}>
              {isUploading ? 'Menyimpan...' : '📂 Upload File JSON Penuh ke DB'}
              <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFileUpload} disabled={isUploading} />
            </label>

            {targetMenus.length > 0 && (
              <button type="button" className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '12px' }} onClick={handleClearAll}>
                Kosongkan DB
              </button>
            )}
          </div>
        </div>

        {/* Panel Pengaturan Bahan Exclude (Bahan yang tidak harus diinject) */}
        {showExcludedModal && (
          <div style={{ background: '#fff', border: '2px solid #f59e0b', borderRadius: '6px', padding: '14px', marginBottom: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <div>
                <strong style={{ color: '#b45309', fontSize: '14px' }}>🛡️ Pengaturan Bahan Exclude & Include (Permanen di SQLite)</strong>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Bahan yang berstatus <b>EXCLUDE</b> otomatis dilewati saat injeksi dan dicatat di panel <b>HISTORY</b>. Tersimpan permanen walau di-refresh.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {excludedMaterials.length > 0 && (
                  <button type="button" className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={handleClearAllExcluded}>
                    Reset Exclude
                  </button>
                )}
                <button type="button" className="btn" style={{ padding: '3px 10px', fontSize: '12px' }} onClick={() => setShowExcludedModal(false)}>
                  Tutup ✕
                </button>
              </div>
            </div>

            {/* Tab Filter & Input Pencarian */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMatFilterTab('ALL')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: matFilterTab === 'ALL' ? 'bold' : 'normal',
                    background: matFilterTab === 'ALL' ? '#1e293b' : '#fff',
                    color: matFilterTab === 'ALL' ? '#fff' : '#475569',
                  }}
                >
                  Semua Bahan ({allUniqueMaterials.length})
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMatFilterTab('EXCLUDED')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: matFilterTab === 'EXCLUDED' ? 'bold' : 'normal',
                    background: matFilterTab === 'EXCLUDED' ? '#b45309' : '#fff',
                    color: matFilterTab === 'EXCLUDED' ? '#fff' : '#b45309',
                    borderColor: '#f59e0b',
                  }}
                >
                  🛡️ Excluded ({excludedMaterials.length})
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMatFilterTab('INCLUDED')}
                  style={{
                    padding: '3px 10px',
                    fontSize: '11px',
                    fontWeight: matFilterTab === 'INCLUDED' ? 'bold' : 'normal',
                    background: matFilterTab === 'INCLUDED' ? '#15803d' : '#fff',
                    color: matFilterTab === 'INCLUDED' ? '#fff' : '#15803d',
                    borderColor: '#86efac',
                  }}
                >
                  🟢 Included ({Math.max(0, allUniqueMaterials.length - excludedMaterials.length)})
                </button>
              </div>

              {/* Form Tambah Bahan Manual */}
              <form onSubmit={handleAddCustomMaterial} style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="text"
                  placeholder="Tambah bahan kustom..."
                  value={customMatInput}
                  onChange={(e) => setCustomMatInput(e.target.value)}
                  style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', width: '160px' }}
                />
                <button type="submit" className="btn btn-warning" style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                  + Exclude
                </button>
              </form>
            </div>

            {/* Input Filter Pencarian Bahan */}
            <div style={{ marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="🔍 Ketik untuk memfilter bahan..."
                value={matSearchTerm}
                onChange={(e) => setMatSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '5px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
              />
            </div>

            {/* Grid List Bahan */}
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', background: '#fafafa' }}>
              {allUniqueMaterials.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', padding: '12px', textAlign: 'center' }}>
                  Belum ada bahan di database. Upload file JSON atau ketik bahan kustom di atas.
                </div>
              ) : filteredUniqueMaterials.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', padding: '12px', textAlign: 'center' }}>
                  Tidak ada bahan yang cocok dengan filter atau kata kunci "{matSearchTerm}".
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px' }}>
                  {filteredUniqueMaterials.map((mat) => {
                    const isChecked = excludedMaterials.some((m) => m.toLowerCase() === mat.toLowerCase());
                    return (
                      <div
                        key={mat}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '6px',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          background: isChecked ? '#fef3c7' : '#ffffff',
                          border: isChecked ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleExclude(mat)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: isChecked ? 'bold' : 'normal', color: isChecked ? '#b45309' : '#1f2937', fontSize: '12px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={mat}>
                            {mat}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isChecked ? (
                            <span style={{ fontSize: '10px', background: '#fde68a', color: '#92400e', padding: '2px 5px', borderRadius: '3px', fontWeight: 'bold' }}>
                              🛡️ EXCLUDE
                            </span>
                          ) : (
                            <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#64748b', padding: '2px 5px', borderRadius: '3px' }}>
                              🟢 INCLUDE
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleToggleExclude(mat)}
                            style={{
                              padding: '2px 6px',
                              fontSize: '10px',
                              borderRadius: '3px',
                              border: '1px solid #cbd5e1',
                              background: isChecked ? '#fff' : '#f8fafc',
                              color: isChecked ? '#15803d' : '#b45309',
                              cursor: 'pointer',
                            }}
                          >
                            {isChecked ? 'Ubah ke Include' : 'Ubah ke Exclude'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
              <span>💾 Status bahan tersimpan permanen di database SQLite (tetap tersimpan walau browser di-refresh).</span>
              <strong style={{ color: '#b45309' }}>Total Bahan Exclude Aktif: {excludedMaterials.length}</strong>
            </div>
          </div>
        )}

        {/* Toolbar Pencarian & Filter Selesai */}
        {targetMenus.length > 0 && (
          <div>
            {/* Bar Kontrol Seleksi Batch (Pilih / Kecualikan Menu) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '12px', color: '#1e40af' }}>
                  📦 Pilihan Batch 1-Klik:
                </strong>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: selectedBatchKeys.size > 0 ? '#15803d' : '#b91c1c' }}>
                  {selectedBatchKeys.size} dari {targetMenus.length} menu dipilih
                </span>
                {selectedBatchKeys.size < targetMenus.length && (
                  <span style={{ fontSize: '11px', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '3px' }}>
                    ({targetMenus.length - selectedBatchKeys.size} dikecualikan)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: '11px', background: '#fff' }}
                  onClick={handleSelectAllBatch}
                  title="Pilih semua menu untuk diinjeksi"
                >
                  ✓ Pilih Semua
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: '11px', background: '#fff', color: '#b45309', borderColor: '#f59e0b' }}
                  onClick={handleSelectOnlyPendingBatch}
                  title="Pilih hanya menu yang belum selesai dan kecualikan yang sudah selesai"
                >
                  🛡️ Kecualikan yg Selesai
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '2px 8px', fontSize: '11px', background: '#fff' }}
                  onClick={handleDeselectAllBatch}
                  title="Kosongkan seluruh pilihan menu"
                >
                  ✕ Batalkan Semua
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
              <input
                type="text"
                placeholder="🔍 Cari nama menu / nomor..."
                value={menuSearchTerm}
                onChange={(e) => setMenuSearchTerm(e.target.value)}
                style={{ padding: '5px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1', minWidth: '220px' }}
              />

              <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                />
                Sembunyikan menu yang sudah selesai
              </label>
            </div>

            {/* List Menu di Database */}
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff' }}>
              {filteredMenus.map((m) => {
                const isSelected = selectedKey === m.menu_key;
                const isCheckedForBatch = selectedBatchKeys.has(m.menu_key);

                return (
                  <div
                    key={m.menu_key}
                    onClick={() => handleSelectMenu(m)}
                    style={{
                      padding: '8px 10px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f1f5f9',
                      background: isSelected ? '#dbeafe' : !isCheckedForBatch ? '#f8fafc' : '#fff',
                      opacity: !isCheckedForBatch ? 0.78 : 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    {/* Kolom Kiri: Checkbox Pilih/Kecualikan & Nama Menu */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isCheckedForBatch}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleBatchSelect(m.menu_key);
                        }}
                        title={
                          isCheckedForBatch
                            ? 'Menu ini AKAN diinjeksi saat 1-Klik Inject All (Klik untuk mengecualikan)'
                            : 'Menu ini DIKECUALIKAN dari 1-Klik Inject All (Klik untuk memilih)'
                        }
                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                      />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            textDecoration: m.isCompleted ? 'line-through' : 'none',
                            color: m.isCompleted ? '#94a3b8' : !isCheckedForBatch ? '#64748b' : '#1f2937',
                            fontWeight: isSelected ? 'bold' : isCheckedForBatch ? '600' : 'normal',
                          }}
                        >
                          {m.menu_no ? `#${m.menu_no} - ` : ''}{m.menu_name}
                        </span>
                        {(m.menuData?.namaSystem || m.menuData?.systemName) && (
                          <span style={{ fontSize: '10px', color: '#1d4ed8', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1px 5px', borderRadius: '3px' }} title="Nama acuan pencarian di sistem ESB">
                            Sistem: {m.menuData.namaSystem || m.menuData.systemName}
                          </span>
                        )}
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          ({m.total_ingredients} bahan)
                        </span>
                      </div>
                    </div>

                    {/* Kolom Kanan: Status Seleksi Batch & Selesai & Hapus */}
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                      {!isCheckedForBatch ? (
                        <span
                          style={{ fontSize: '10px', background: '#fef3c7', color: '#b45309', border: '1px solid #f59e0b', padding: '1px 6px', borderRadius: '3px', fontWeight: 'bold' }}
                          title="Menu ini dikecualikan dan tidak akan dijalankan pada 1-Klik Inject All"
                        >
                          🛡️ Dikecualikan
                        </span>
                      ) : (
                        <span
                          style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '1px 6px', borderRadius: '3px', fontWeight: 'bold' }}
                          title="Menu ini akan dijalankan pada 1-Klik Inject All"
                        >
                          ✓ Siap Inject
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleToggleComplete(e, m)}
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          border: '1px solid #cbd5e1',
                          background: m.isCompleted ? '#f0fdf4' : '#fff',
                          color: m.isCompleted ? '#15803d' : '#64748b',
                          cursor: 'pointer',
                        }}
                        title="Klik untuk mengubah status selesai/belum selesai"
                      >
                        {m.isCompleted ? '✓ Selesai' : 'Belum'}
                      </button>

                      {isSelected && <span style={{ color: '#2563eb', fontWeight: 'bold', fontSize: '11px' }}>Aktif</span>}

                      <button
                        type="button"
                        onClick={(e) => handleDeleteMenu(e, m)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: '14px',
                        }}
                        title="Hapus menu ini dari antrean database"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Editor JSON Menu yang Sedang Aktif */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontWeight: '600', fontSize: '13px' }}>
              Data Menu Terpilih (JSON):
            </label>
            <button
              type="button"
              className="btn"
              style={{ padding: '2px 8px', fontSize: '11px' }}
              onClick={handleSaveJsonEdit}
              disabled={!selectedKey}
            >
              💾 Simpan Perubahan Edit ke DB
            </button>
          </div>

          <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isDryRun}
              onChange={(e) => setIsDryRun(e.target.checked)}
            />
            <strong>DRY RUN (Bandingkan Saja tanpa ubah data web)</strong>
          </label>
        </div>

        <textarea
          rows="8"
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          placeholder="Pilih salah satu menu dari daftar di atas untuk mengedit atau mengeksekusi..."
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '8px',
            borderRadius: '4px',
            border: parseError ? '1px solid #b91c1c' : '1px solid #d1d5db',
            background: '#fafafa',
          }}
        />

        {parseError && (
          <div className="alert-box" style={{ marginTop: '6px' }}>
            {parseError}
          </div>
        )}
      </div>

      <div className="row-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Tombol Utama 1-KLIK INJECT ALL */}
        <button
          type="button"
          className="btn"
          onClick={handleStartBatch}
          disabled={!isReady || selectedBatchKeys.size === 0 || isRunning}
          style={{
            background: isRunning ? '#94a3b8' : isDryRun ? '#d97706' : '#16a34a',
            color: '#fff',
            border: 'none',
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 'bold',
            borderRadius: '5px',
            cursor: !isReady || selectedBatchKeys.size === 0 || isRunning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {isRunning
            ? '⏳ Sedang Berjalan...'
            : isDryRun
            ? `🔍 1-Klik Dry Run (${selectedBatchKeys.size} Menu Terpilih)`
            : `🚀 1-KLIK INJECT ALL (${selectedBatchKeys.size} MENU TERPILIH)`}
        </button>

        {/* Tombol Injeksi Hanya Menu yang Aktif */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleStartSingle}
          disabled={!isReady || !jsonInput.trim() || isRunning}
          style={{ padding: '8px 14px', fontSize: '12px' }}
        >
          ▶️ Inject Menu Aktif Ini Saja
        </button>

        {/* Tombol Stop */}
        <button
          type="button"
          className="btn btn-danger"
          onClick={onStopInjection}
          disabled={!backendOnline || busyAction === 'stop'}
          style={{ padding: '8px 14px', fontSize: '12px' }}
        >
          ⏹ Stop Otomasi
        </button>
      </div>
    </section>
  );
}
