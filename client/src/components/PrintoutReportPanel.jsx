import { exportReportToCsv, exportReportToExcel } from '../utils/excelExporter.js';

export function PrintoutReportPanel({ report }) {
  if (!report || !report.results || report.results.length === 0) {
    return null;
  }

  // Fungsi print khusus RESULT ONLY ke PDF tanpa elemen web dashboard
  const handlePrintPdfResultOnly = () => {
    const formattedDate = new Date(report.executedAt).toLocaleString('id-ID');

    // Buat dokumen popup khusus hanya berisi data tabel result
    const printWindow = window.open('', '_blank', 'width=850,height=700');
    if (!printWindow) {
      alert('Mohon izinkan pop-up di browser untuk mengunduh/mencetak PDF.');
      return;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan_Hasil_BOM_${report.results[0]?.menuName ? report.results[0].menuName.replace(/[^a-zA-Z0-9]/g, '_') : 'Result'}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 10px; font-size: 13px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 18px; font-weight: bold; color: #0f172a; margin: 0; }
    .meta { font-size: 12px; color: #64748b; margin-top: 4px; }
    .menu-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 16px; page-break-inside: avoid; }
    .menu-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
    .menu-name { font-size: 15px; font-weight: bold; color: #1e40af; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-success { background: #dcfce7; color: #15803d; }
    .badge-error { background: #fee2e2; color: #b91c1c; }
    .summary-text { font-size: 12px; color: #475569; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left; }
    th { background: #f8fafc; font-weight: bold; color: #334155; }
    .text-right { text-align: right; }
    .skipped-box { margin-top: 8px; font-size: 11px; color: #64748b; background: #f8fafc; padding: 6px 8px; border-radius: 4px; border: 1px dashed #cbd5e1; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">Laporan Hasil Injeksi BOM ESB ERP</h1>
      <div class="meta">Waktu Eksekusi: ${formattedDate} | Total Menu: ${report.totalMenus}</div>
    </div>
  </div>

  ${report.results.map((res) => {
    const isSuccess = res.status === 'Success' || res.status === 'Partial Success' || res.status === 'Dry Run Completed';
    return `
    <div class="menu-box">
      <div class="menu-head">
        <span class="menu-name">${res.menuNo ? '#' + res.menuNo + ' - ' : ''}${res.menuName}</span>
        <span class="badge ${isSuccess ? 'badge-success' : 'badge-error'}">${res.status}</span>
      </div>
      <div class="summary-text">
        Total Bahan di JSON: <b>${res.totalIngredients}</b> &nbsp;|&nbsp;
        Bahan Baru Berhasil Ditambahkan: <b style="color: #15803d">${res.addedIngredients?.length || 0}</b> &nbsp;|&nbsp;
        Dilewati (Sudah Ada di Web): <b>${res.skippedIngredients?.length || 0}</b> &nbsp;|&nbsp;
        Dilewati (Exclude): <b style="color: #b45309">${res.excludedIngredients?.length || 0}</b>
        ${res.failedIngredients?.length > 0 ? ` &nbsp;|&nbsp; Gagal: <b style="color:#b91c1c">${res.failedIngredients.length}</b>` : ''}
      </div>

      ${res.addedIngredients && res.addedIngredients.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th style="width: 35px">No</th>
              <th>Nama Bahan Baru</th>
              <th class="text-right" style="width: 120px">Gramasi / Qty</th>
              <th style="width: 80px">Satuan</th>
            </tr>
          </thead>
          <tbody>
            ${res.addedIngredients.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><b>${item.bahan || item.item}</b></td>
                <td class="text-right"><b>${item.gramasi ?? item.qty}</b></td>
                <td>${item.satuan || item.unit || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<div style="font-size: 11px; color: #64748b; margin-top: 4px;"><i>Tidak ada bahan baru yang ditambahkan (semua bahan sudah ada atau mode Dry Run).</i></div>'}

      ${res.excludedIngredients && res.excludedIngredients.length > 0 ? `
        <div class="skipped-box" style="border-color: #f59e0b; background: #fffbeb;">
          <b style="color: #b45309">🛡️ Bahan yang dilewati karena aturan Exclude:</b><br>
          ${res.excludedIngredients.map(item => item.bahan || item.item).join(', ')}
        </div>
      ` : ''}

      ${res.skippedIngredients && res.skippedIngredients.length > 0 ? `
        <div class="skipped-box">
          <b>Bahan yang dilewati karena sudah ada di ESB:</b><br>
          ${res.skippedIngredients.map(item => item.bahan || item.item).join(', ')}
        </div>
      ` : ''}
    </div>
    `;
  }).join('')}

  <script>
    // Otomatis buka dialog Save as PDF / Print
    window.onload = function() {
      window.print();
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <section className="card" style={{ border: '2px solid #2563eb', background: '#f8fafc' }}>
      <div className="card-header" style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '8px' }}>
        <div>
          <h2 className="card-title" style={{ color: '#1e40af' }}>
            🖨️ Hasil Eksekusi BOM Menu
          </h2>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Waktu: {new Date(report.executedAt).toLocaleString('id-ID')} | Total Menu: {report.totalMenus}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-success"
            style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 'bold', background: '#16a34a', color: '#fff', border: 'none' }}
            onClick={() => exportReportToExcel(report)}
            title="Download hasil injeksi ke format Excel (.xls multi-sheet lengkap dengan format dan warna)"
          >
            📊 Download Excel (.xls)
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 'bold' }}
            onClick={handlePrintPdfResultOnly}
            title="Cetak atau simpan hasil injeksi ke PDF"
          >
            📄 Download PDF
          </button>
          <button
            type="button"
            className="btn"
            style={{ padding: '6px 12px', fontSize: '13px', background: '#fff' }}
            onClick={() => exportReportToCsv(report)}
            title="Download data bahan mentah ke CSV"
          >
            📑 CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
        {report.results.map((res, idx) => {
          const isSuccess = res.status === 'Success' || res.status === 'Partial Success' || res.status === 'Dry Run Completed';
          return (
            <div
              key={idx}
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
                  {res.menuNo ? `#${res.menuNo} - ` : ''}
                  {res.menuName}
                </span>
                <span className={isSuccess ? 'badge badge-success' : 'badge badge-error'}>
                  {res.status}
                </span>
              </div>

              {/* Summary Counts */}
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', marginBottom: '8px', color: '#475569', flexWrap: 'wrap' }}>
                <span>Total Bahan di JSON: <strong>{res.totalIngredients}</strong></span>
                <span style={{ color: '#15803d' }}>Berhasil Ditambahkan: <strong>{res.addedIngredients?.length || 0}</strong></span>
                <span style={{ color: '#64748b' }}>Dilewati (Sudah Ada): <strong>{res.skippedIngredients?.length || 0}</strong></span>
                <span style={{ color: '#b45309' }}>Dilewati (Exclude): <strong>{res.excludedIngredients?.length || 0}</strong></span>
                {res.failedIngredients?.length > 0 && (
                  <span style={{ color: '#b91c1c' }}>Gagal: <strong>{res.failedIngredients.length}</strong></span>
                )}
              </div>

              {/* Rincian Bahan yang Berhasil Ditambahkan */}
              {res.addedIngredients && res.addedIngredients.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#15803d', marginBottom: '4px' }}>
                    ✓ Bahan yang Baru Ditambahkan ke Web:
                  </div>
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', border: '1px solid #e2e8f0' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ padding: '4px 8px', border: '1px solid #e2e8f0' }}>Nama Bahan</th>
                        <th style={{ padding: '4px 8px', border: '1px solid #e2e8f0', textAlign: 'right' }}>Gramasi / Qty</th>
                        <th style={{ padding: '4px 8px', border: '1px solid #e2e8f0' }}>Satuan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {res.addedIngredients.map((item, iIdx) => (
                        <tr key={iIdx}>
                          <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0' }}>{item.bahan || item.item}</td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 'bold' }}>
                            {item.gramasi ?? item.qty}
                          </td>
                          <td style={{ padding: '4px 8px', border: '1px solid #e2e8f0' }}>{item.satuan || item.unit || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Bahan yang di-exclude */}
              {res.excludedIngredients && res.excludedIngredients.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '6px 8px', borderRadius: '4px' }}>
                  <strong>🛡️ Bahan yang dilewati karena aturan Exclude ({res.excludedIngredients.length}):</strong>{' '}
                  {res.excludedIngredients.map((item) => item.bahan || item.item).join(', ')}
                </div>
              )}

              {/* Bahan yang dilewati */}
              {res.skippedIngredients && res.skippedIngredients.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                  <strong>Bahan yang sudah ada sebelumnya di ESB (dilewati):</strong>{' '}
                  {res.skippedIngredients.map((item) => item.bahan || item.item).join(', ')}
                </div>
              )}

              {/* Bahan yang gagal */}
              {res.failedIngredients && res.failedIngredients.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c', background: '#fee2e2', padding: '6px', borderRadius: '4px' }}>
                  <strong>Error/Gagal:</strong>
                  {res.failedIngredients.map((fail, fIdx) => (
                    <div key={fIdx}>• {fail.bahan || 'Menu'}: {fail.error}</div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
