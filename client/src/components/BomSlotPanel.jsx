import { useState } from 'react';

export function BomSlotPanel({
  menus,
  onUploadJson,
  onSaveMenu,
  onDeleteMenu,
  onClearMenus,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingMenu, setEditingMenu] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState(null);

  const filteredMenus = menus.filter((m) =>
    (m.menu_name || m.menuName || '')
      .toLowerCase()
      .includes(searchTerm.toLowerCase()) ||
    (m.bom_id || m.bomId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setMessage(null);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result;
        const parsed = JSON.parse(text);
        await onUploadJson(parsed);
        setMessage({ type: 'success', text: `File "${file.name}" berhasil diupload!` });
      } catch (err) {
        setMessage({ type: 'error', text: `Gagal membaca file: ${err.message}` });
      } finally {
        setIsUploading(false);
        e.target.value = '';
      }
    };

    reader.onerror = () => {
      setMessage({ type: 'error', text: 'Gagal membaca file dari disk.' });
      setIsUploading(false);
    };

    reader.readAsText(file);
  };

  const handleEditClick = (menu) => {
    setEditingMenu({
      bomId: menu.bom_id || menu.bomId,
      menuName: menu.menu_name || menu.menuName,
      bomType: menu.bom_type || menu.bomType || 'Menu',
      bomCostTotal: menu.bom_cost_total ?? menu.bomCostTotal ?? 0,
      materials: menu.materials || [],
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMenu) return;
    try {
      await onSaveMenu(editingMenu);
      setEditingMenu(null);
      setMessage({ type: 'success', text: 'Perubahan menu berhasil disimpan!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Slot Data BOM ESB (Referensi Ekspor JSON)</h2>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Data ini dijadikan acuan otomatis untuk membandingkan resep/BOM di ERP ESB
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className="badge badge-info">{menus.length} Menu Terdaftar</span>
        </div>
      </div>

      {message && (
        <div
          className={message.type === 'success' ? 'badge badge-success' : 'alert-box'}
          style={{ marginBottom: '12px', display: 'block', padding: '8px 12px' }}
        >
          {message.text}
        </div>
      )}

      {/* Upload Controls */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {isUploading ? 'Mengupload...' : '📂 Upload File BOM (.json)'}
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </label>

        {menus.length > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('Yakin ingin menghapus seluruh data BOM yang tersimpan?')) {
                onClearMenus();
              }
            }}
          >
            Hapus Semua BOM
          </button>
        )}

        <input
          type="text"
          placeholder="Cari Menu / BOM ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            flex: '1',
            minWidth: '200px',
            padding: '6px 10px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            fontSize: '13px',
          }}
        />
      </div>

      {/* Edit Form Modal/Inline */}
      {editingMenu && (
        <div
          style={{
            background: '#f9fafb',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '14px',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
            ✏️ Edit Menu: {editingMenu.menuName} (BOM ID: {editingMenu.bomId})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#4b5563', display: 'block' }}>Nama Menu</label>
              <input
                type="text"
                value={editingMenu.menuName}
                onChange={(e) => setEditingMenu({ ...editingMenu, menuName: e.target.value })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#4b5563', display: 'block' }}>Total Biaya BOM</label>
              <input
                type="number"
                step="0.01"
                value={editingMenu.bomCostTotal}
                onChange={(e) => setEditingMenu({ ...editingMenu, bomCostTotal: parseFloat(e.target.value) || 0 })}
                style={{ width: '100%', padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
              Daftar Material ({editingMenu.materials.length}):
            </span>
            <div style={{ maxHeight: '140px', overflowY: 'auto', background: '#fff', border: '1px solid #e5e7eb', padding: '6px', borderRadius: '4px', marginTop: '4px' }}>
              {editingMenu.materials.map((mat, idx) => (
                <div key={idx} style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <span>{mat.materialName} ({mat.materialCode || 'No Code'})</span>
                  <strong>{mat.qty} {mat.unit}</strong>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={handleSaveEdit}>
              Simpan Perubahan
            </button>
            <button type="button" className="btn" onClick={() => setEditingMenu(null)}>
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Table Daftar Menu BOM */}
      <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '4px' }}>
        {filteredMenus.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
            {menus.length === 0
              ? 'Belum ada data BOM yang diupload. Silakan klik tombol "Upload File BOM (.json)" di atas.'
              : 'Tidak ada menu yang cocok dengan kata kunci pencarian.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6', borderBottom: '1px solid #d1d5db' }}>
                <th style={{ padding: '8px 10px' }}>BOM ID</th>
                <th style={{ padding: '8px 10px' }}>Nama Menu</th>
                <th style={{ padding: '8px 10px' }}>Bahan (Materials)</th>
                <th style={{ padding: '8px 10px' }}>Total Biaya BOM</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredMenus.map((m) => {
                const bomId = m.bom_id || m.bomId;
                const menuName = m.menu_name || m.menuName;
                const materialsCount = m.total_materials ?? m.totalMaterials ?? (m.materials ? m.materials.length : 0);
                const cost = m.bom_cost_total ?? m.bomCostTotal ?? 0;

                return (
                  <tr key={bomId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>{bomId}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '500' }}>{menuName}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span className="badge badge-neutral">{materialsCount} bahan</span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>Rp {cost.toLocaleString('id-ID')}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ padding: '3px 8px', fontSize: '12px', marginRight: '6px' }}
                        onClick={() => handleEditClick(m)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '3px 8px', fontSize: '12px' }}
                        onClick={() => {
                          if (window.confirm(`Hapus BOM "${menuName}" (${bomId})?`)) {
                            onDeleteMenu(bomId);
                          }
                        }}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

