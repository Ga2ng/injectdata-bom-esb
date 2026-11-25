import { useState } from 'react';

function formatDateTime(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString('id-ID');
}

export function HistoryPanel({ historyList = [], onRefresh }) {
  const [expandedId, setExpandedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL | Success | Failed

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const filteredHistory = historyList.filter((item) => {
    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'Success') return item.status === 'Success' || item.status === 'Partial Success';
    if (filterStatus === 'Failed') return item.status === 'Failed';
    return true;
  });

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">📜 HISTORY (Riwayat Injeksi Menu)</h2>
          <span style={{ fontSize: '12px', color: '#6b7280' }}>
            Rekap hasil rapi eksekusi menu: daftar menu yang berhasil, bahan yang ditambahkan, dan menu yang gagal
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value="ALL">Semua Riwayat ({historyList.length})</option>
            <option value="Success">Hanya Berhasil</option>
            <option value="Failed">Hanya Gagal</option>
          </select>
          {onRefresh && (
            <button
              type="button"
              className="btn"
              style={{ padding: '4px 8px', fontSize: '12px' }}
              onClick={onRefresh}
            >
              🔄 Refresh
            </button>
          )}
        </div>
      </div>

      <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
        {filteredHistory.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Belum ada riwayat eksekusi injeksi menu yang tercatat.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '8px 12px' }}>Waktu</th>
                <th style={{ padding: '8px 12px' }}>Nama Menu</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Ditambahkan</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Sudah Ada</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>🛡️ Excluded</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Gagal</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Rincian</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((item) => {
                const isSuccess = item.status === 'Success' || item.status === 'Partial Success';
                const isExpanded = expandedId === item.id;
                const details = item.details || {};

                // Filter bahan excluded vs bahan yang sudah ada
                const explicitExcluded = Array.isArray(details.excludedIngredients) ? details.excludedIngredients : [];
                const legacyExcluded = (details.skippedIngredients || []).filter((s) => s.alasan && s.alasan.toLowerCase().includes('exclude'));
                const allExcluded = explicitExcluded.length > 0 ? explicitExcluded : legacyExcluded;
                const excludedCount = Number(item.excluded_count) || allExcluded.length;

                const alreadyOnWeb = (details.skippedIngredients || []).filter((s) => !s.alasan || !s.alasan.toLowerCase().includes('exclude'));
                const alreadyOnWebCount = explicitExcluded.length > 0 ? (item.skipped_count || 0) : alreadyOnWeb.length;

                return (
                  <>
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isExpanded ? '#f1f5f9' : '#fff',
                      }}
                    >
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '12px' }}>
                        {formatDateTime(item.executed_at)}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 'bold' }}>
                          {item.menu_no ? `#${item.menu_no} - ` : ''}{item.menu_name}
                        </div>
                        {details.menuDisplayName && details.menuDisplayName !== item.menu_name && (
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Resep: {details.menuDisplayName}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span className={isSuccess ? 'badge badge-success' : 'badge badge-error'}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#15803d', fontWeight: 'bold' }}>
                        +{item.added_count}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>
                        {alreadyOnWebCount}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {excludedCount > 0 ? (
                          <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', fontSize: '11px' }}>
                            🛡️ {excludedCount}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: item.failed_count > 0 ? '#b91c1c' : '#64748b' }}>
                        {item.failed_count}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => toggleExpand(item.id)}
                        >
                          {isExpanded ? 'Tutup ▲' : 'Lihat Bahan ▼'}
                        </button>
                      </td>
                    </tr>

                    {/* Rincian Expandable per Menu */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                        <td colSpan="8" style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {/* Bahan yang berhasil ditambahkan */}
                            {details.addedIngredients && details.addedIngredients.length > 0 && (
                              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '4px' }}>
                                <strong style={{ color: '#15803d' }}>✓ Bahan yang Baru Ditambahkan ke Web ({details.addedIngredients.length}):</strong>
                                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                  {details.addedIngredients.map((b, bIdx) => (
                                    <li key={bIdx}>
                                      <b>{b.bahan || b.item}</b> &mdash; Qty: {b.gramasi ?? b.qty} {b.satuan || b.unit || ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Bahan yang di-exclude */}
                            {allExcluded.length > 0 && (
                              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 12px', borderRadius: '4px' }}>
                                <strong style={{ color: '#b45309' }}>🛡️ Bahan yang Di-Exclude / Dilewati Aturan ({allExcluded.length}):</strong>
                                <div style={{ marginTop: '4px', color: '#92400e' }}>
                                  {allExcluded.map((b, bIdx) => (
                                    <span key={bIdx} style={{ display: 'inline-block', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '3px', padding: '2px 6px', margin: '2px 4px 2px 0', fontSize: '11px' }}>
                                      {b.bahan || b.item || b}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Bahan yang sudah ada di web */}
                            {alreadyOnWeb.length > 0 && (
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '4px', color: '#475569' }}>
                                <strong>⏭️ Bahan yang Sudah Ada Sebelumnya di Web ({alreadyOnWeb.length}):</strong>{' '}
                                <div style={{ marginTop: '2px', color: '#64748b' }}>
                                  {alreadyOnWeb.map((b) => b.bahan || b.item).join(', ')}
                                </div>
                              </div>
                            )}

                            {/* Bahan yang gagal */}
                            {details.failedIngredients && details.failedIngredients.length > 0 && (
                              <div style={{ color: '#b91c1c', background: '#fee2e2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: '4px' }}>
                                <strong>❌ Error / Gagal ({details.failedIngredients.length}):</strong>
                                {details.failedIngredients.map((f, fIdx) => (
                                  <div key={fIdx} style={{ marginTop: '2px' }}>• {f.bahan || 'Menu'}: {f.error}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

