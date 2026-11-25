/**
 * Utility untuk mengekspor hasil eksekusi injeksi BOM & riwayat ke Excel (.xls / SpreadsheetML) dan CSV.
 * Format XML Spreadsheet 2003 (SpreadsheetML) didukung secara native oleh Microsoft Excel (semua versi),
 * Google Sheets, LibreOffice Calc, dan Apple Numbers tanpa memerlukan dependency eksternal.
 */

function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeText(val, fallback = '-') {
  if (val === null || val === undefined) return fallback;
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'undefined' || str.toLowerCase() === 'null') return fallback;
  return str;
}

export function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Memformat ringkasan teks keterangan lengkap:
 *
 * 1 - (Menu Bubur Oriental CIAMSO)
 * Completed (All Items Exist/Excluded)
 * Total Bahan di JSON: 8
 * Berhasil Ditambahkan: 0
 * Dilewati (Sudah Ada): 7
 * Dilewati (Exclude): 1
 * 🛡️ Bahan yang dilewati karena aturan Exclude (1): AIR
 * Bahan yang sudah ada sebelumnya di ESB (dilewati): BERAS, DAUN BAWANG, ...
 * ❌ Bahan Gagal (0): -
 */
function buildFullKeterangan({
  menuNo,
  menuName,
  status,
  totalIngredients,
  addedList = [],
  skippedList = [],
  excludedList = [],
  failedList = [],
}) {
  const lines = [
    `${menuNo ? `${menuNo} - ` : ''}${menuName}`,
    safeText(status, 'Status Tidak Diketahui'),
    `Total Bahan di JSON: ${totalIngredients || 0}`,
    `Berhasil Ditambahkan: ${addedList.length}`,
    `Dilewati (Sudah Ada): ${skippedList.length}`,
    `Dilewati (Exclude): ${excludedList.length}`,
  ];

  if (excludedList.length > 0) {
    lines.push(`🛡️ Bahan yang dilewati karena aturan Exclude (${excludedList.length}): ${excludedList.join(', ')}`);
  }

  if (skippedList.length > 0) {
    lines.push(`Bahan yang sudah ada sebelumnya di ESB (dilewati): ${skippedList.join(', ')}`);
  }

  if (addedList.length > 0) {
    lines.push(`✓ Bahan yang baru berhasil ditambahkan (${addedList.length}): ${addedList.join(', ')}`);
  }

  if (failedList.length > 0) {
    lines.push(`❌ Bahan Gagal (${failedList.length}): ${failedList.join('; ')}`);
  }

  return lines.join('\n');
}

const COMMON_EXCEL_STYLES = `
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="TitleStyle">
   <Font ss:FontName="Calibri" ss:Size="14" ss:Bold="1" ss:Color="#1E40AF"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="MetaStyle">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
   <Alignment ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#0F172A"/>
   </Borders>
  </Style>
  <Style ss:ID="HeaderSuccess">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#15803D" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#14532D"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#14532D"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#14532D"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#14532D"/>
   </Borders>
  </Style>
  <Style ss:ID="HeaderDanger">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#B91C1C" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F1D1D"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F1D1D"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F1D1D"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7F1D1D"/>
   </Borders>
  </Style>
  <Style ss:ID="HeaderWarning">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#B45309" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#78350F"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#78350F"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#78350F"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#78350F"/>
   </Borders>
  </Style>
  <Style ss:ID="CellStyle">
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellStyleWrap">
   <Alignment ss:Vertical="Top" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellNumber">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0.##"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="SuccessStatus">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#15803D"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#86EFAC"/>
   </Borders>
  </Style>
  <Style ss:ID="WarningStatus">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B45309"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
   </Borders>
  </Style>
  <Style ss:ID="NeutralStatus">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#475569"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
  </Style>
  <Style ss:ID="FailedStatus">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#B91C1C"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FECACA"/>
   </Borders>
  </Style>
 </Styles>`;

/**
 * Ekspor Laporan Hasil Injeksi Terakhir ke format Excel Multi-Sheet (.xls)
 * Memuat 4 sheet terpisah:
 * 1. Ringkasan Menu
 * 2. Bahan Berhasil Ditambahkan
 * 3. Bahan Gagal Diinject
 * 4. Bahan Dilewati & Excluded
 */
export function exportReportToExcel(report) {
  if (!report || !Array.isArray(report.results) || report.results.length === 0) {
    alert('Tidak ada data hasil eksekusi untuk diunduh.');
    return;
  }

  const executedAt = report.executedAt ? new Date(report.executedAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');
  const safeFilename = `Laporan_Hasil_BOM_ESB_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.xls`;

  let summaryRowsXml = '';
  let addedRowsXml = '';
  let failedRowsXml = '';
  let skippedRowsXml = '';

  let addedCounter = 0;
  let failedCounter = 0;
  let skippedCounter = 0;

  report.results.forEach((res, idx) => {
    const isSuccess = res.status === 'Success' || res.status === 'Partial Success' || res.status === 'Dry Run Completed';
    const statusStyle = isSuccess ? 'SuccessStatus' : 'FailedStatus';
    const menuNo = res.menuNo ? `#${res.menuNo}` : '';
    const menuName = safeText(res.menuName, 'Tanpa Nama');
    const menuDisplayName = safeText(res.menuDisplayName, menuName);
    const totalIngredients = Number(res.totalIngredients) || 0;

    const addedList = (res.addedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const qty = b.gramasi ?? b.qty;
      const unit = safeText(b.satuan || b.unit, '');
      return qty !== undefined && qty !== null ? `${name} (${qty} ${unit})`.trim() : name;
    });

    const excludedList = (res.excludedIngredients || []).map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const skippedList = (res.skippedIngredients || []).map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const failedList = (res.failedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const err = safeText(b.error || b.alasan, 'Gagal diproses');
      return `${name}: ${err}`;
    });

    const addedListStr = addedList.length > 0 ? addedList.join(', ') : '-';
    const excludedListStr = excludedList.length > 0 ? excludedList.join(', ') : '-';
    const skippedListStr = skippedList.length > 0 ? skippedList.join(', ') : '-';
    const failedListStr = failedList.length > 0 ? failedList.join('; ') : '-';

    const fullKeterangan = buildFullKeterangan({
      menuNo,
      menuName,
      status: res.status,
      totalIngredients,
      addedList,
      skippedList,
      excludedList,
      failedList,
    });

    // Baris Sheet 1: Ringkasan
    summaryRowsXml += `
    <Row ss:AutoFitHeight="1">
      <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
      <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
      <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
      <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuDisplayName)}</Data></Cell>
      <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(res.status)}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${totalIngredients}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${addedList.length}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${skippedList.length}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${excludedList.length}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${failedList.length}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(addedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(failedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(excludedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(skippedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(fullKeterangan)}</Data></Cell>
    </Row>`;

    // Baris Sheet 2: Bahan yang Berhasil Ditambahkan
    if (res.addedIngredients && res.addedIngredients.length > 0) {
      res.addedIngredients.forEach((item) => {
        addedCounter++;
        const bName = safeText(item.bahan || item.item, '-');
        const bQty = Number(item.gramasi ?? item.qty) || 0;
        const bUnit = safeText(item.satuan || item.unit, '-');

        addedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${addedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${bQty}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(bUnit)}</Data></Cell>
          <Cell ss:StyleID="SuccessStatus"><Data ss:Type="String">✓ Berhasil Ditambahkan</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">Bahan berhasil diisi ke tabel BOM ESB dengan Qty ${bQty} ${bUnit}</Data></Cell>
        </Row>`;
      });
    }

    // Baris Sheet 3: Bahan yang Gagal Diinject
    if (res.failedIngredients && res.failedIngredients.length > 0) {
      res.failedIngredients.forEach((item) => {
        failedCounter++;
        const bName = safeText(item.bahan || item.item, '-');
        const bQty = item.gramasi ?? item.qty;
        const bUnit = safeText(item.satuan || item.unit, '-');
        const bError = safeText(item.error, 'Gagal diproses');

        failedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${failedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="CellNumber"><Data ss:Type="String">${bQty !== undefined && bQty !== null ? escapeXml(String(bQty)) : '-'}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(bUnit)}</Data></Cell>
          <Cell ss:StyleID="FailedStatus"><Data ss:Type="String">❌ Gagal Diinject</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bError)}</Data></Cell>
        </Row>`;
      });
    }

    // Baris Sheet 4: Bahan Dilewati & Excluded
    if (res.excludedIngredients && res.excludedIngredients.length > 0) {
      res.excludedIngredients.forEach((item) => {
        skippedCounter++;
        const bName = safeText(item.bahan || item.item, '-');
        const bReason = safeText(item.alasan, 'Dilewati karena masuk dalam daftar aturan Exclude');

        skippedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${skippedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="WarningStatus"><Data ss:Type="String">🛡️ Excluded</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bReason)}</Data></Cell>
        </Row>`;
      });
    }

    if (res.skippedIngredients && res.skippedIngredients.length > 0) {
      res.skippedIngredients.forEach((item) => {
        skippedCounter++;
        const bName = safeText(item.bahan || item.item, '-');
        const bReason = safeText(item.alasan, 'Sudah terdaftar sebelumnya di tabel web ESB');

        skippedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${skippedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="NeutralStatus"><Data ss:Type="String">Sudah Ada di Web</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bReason)}</Data></Cell>
        </Row>`;
      });
    }
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>ESB BOM Automation Controller</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 ${COMMON_EXCEL_STYLES}

 <!-- SHEET 1: RINGKASAN MENU & KETERANGAN LENGKAP -->
 <Worksheet ss:Name="Ringkasan Menu">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="200"/>
   <Column ss:Width="120"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="240"/>
   <Column ss:Width="240"/>
   <Column ss:Width="220"/>
   <Column ss:Width="280"/>
   <Column ss:Width="420"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="14" ss:StyleID="TitleStyle">
     <Data ss:Type="String">LAPORAN LENGKAP HASIL INJEKSI BOM ERP ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="14" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Waktu Eksekusi: ${escapeXml(executedAt)} | Total Menu: ${report.totalMenus || report.results.length}</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="24">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Menu (Sistem ESB)</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Resep</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Ditambahkan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Sudah Ada</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Excluded</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Gagal</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">✓ Bahan Berhasil Ditambahkan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">❌ Rincian Bahan Gagal</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">🛡️ Rincian Bahan Excluded</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">⏭️ Bahan Sudah Ada di Web</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">📋 Keterangan Lengkap</Data></Cell>
   </Row>

   ${summaryRowsXml}
  </Table>
 </Worksheet>

 <!-- SHEET 2: BAHAN BERHASIL DITAMBAHKAN -->
 <Worksheet ss:Name="Bahan Berhasil Ditambahkan">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="160"/>
   <Column ss:Width="300"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="7" ss:StyleID="TitleStyle">
     <Data ss:Type="String">DAFTAR BAHAN YANG BERHASIL DIINJEKSI KE ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="7" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Baru Berhasil Ditambahkan: ${addedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Gramasi / Qty</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Satuan</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Keterangan</Data></Cell>
   </Row>

   ${addedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="7" ss:StyleID="CellCenter"><Data ss:Type="String">Tidak ada bahan baru yang ditambahkan (semua bahan sudah ada sebelumnya atau di-exclude).</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>

 <!-- SHEET 3: BAHAN GAGAL DIINJECT -->
 <Worksheet ss:Name="Bahan Gagal Diinject">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="140"/>
   <Column ss:Width="340"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="7" ss:StyleID="TitleStyle">
     <Data ss:Type="String">DAFTAR BAHAN YANG GAGAL DIINJEKSI KE ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="7" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Gagal: ${failedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Target Qty</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Satuan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Penyebab Error / Alasan Gagal</Data></Cell>
   </Row>

   ${failedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="7" ss:StyleID="CellCenter"><Data ss:Type="String">Luar biasa! Tidak ada bahan yang gagal diinjeksi (0 error).</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>

 <!-- SHEET 4: DILEWATI & EXCLUDED -->
 <Worksheet ss:Name="Dilewati &amp; Excluded">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="140"/>
   <Column ss:Width="340"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="5" ss:StyleID="TitleStyle">
     <Data ss:Type="String">DAFTAR BAHAN YANG DILEWATI (SUDAH ADA / DI-EXCLUDE)</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="5" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Dilewati: ${skippedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Kategori</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Keterangan / Alasan</Data></Cell>
   </Row>

   ${skippedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="5" ss:StyleID="CellCenter"><Data ss:Type="String">Tidak ada bahan yang dilewati atau di-exclude.</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>
</Workbook>`;

  downloadBlob(xmlContent, safeFilename, 'application/vnd.ms-excel;charset=utf-8');
}

/**
 * Ekspor Riwayat (HISTORY) ke format Excel Multi-Sheet (.xls)
 * Memuat 4 sheet terpisah:
 * 1. Riwayat Menu
 * 2. Bahan Berhasil Ditambahkan
 * 3. Bahan Gagal Diinject
 * 4. Bahan Dilewati & Excluded
 */
export function exportHistoryToExcel(historyList) {
  if (!Array.isArray(historyList) || historyList.length === 0) {
    alert('Belum ada riwayat untuk diunduh.');
    return;
  }

  const safeFilename = `Riwayat_Injeksi_BOM_ESB_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.xls`;

  let summaryRowsXml = '';
  let addedRowsXml = '';
  let failedRowsXml = '';
  let skippedRowsXml = '';

  let addedCounter = 0;
  let failedCounter = 0;
  let skippedCounter = 0;

  historyList.forEach((item, idx) => {
    const isSuccess = item.status === 'Success' || item.status === 'Partial Success';
    const statusStyle = isSuccess ? 'SuccessStatus' : 'FailedStatus';
    const executedAt = item.executed_at ? new Date(item.executed_at).toLocaleString('id-ID') : '-';
    const menuNo = item.menu_no ? `#${item.menu_no}` : '';
    const menuName = safeText(item.menu_name, 'Tanpa Nama');

    const details = item.details || {};
    const explicitExcluded = Array.isArray(details.excludedIngredients) ? details.excludedIngredients : [];
    const legacyExcluded = (details.skippedIngredients || []).filter((s) => s.alasan && s.alasan.toLowerCase().includes('exclude'));
    const allExcluded = explicitExcluded.length > 0 ? explicitExcluded : legacyExcluded;
    const excludedCount = Number(item.excluded_count) || allExcluded.length;

    const alreadyOnWeb = (details.skippedIngredients || []).filter((s) => !s.alasan || !s.alasan.toLowerCase().includes('exclude'));
    const alreadyOnWebCount = explicitExcluded.length > 0 ? (item.skipped_count || 0) : alreadyOnWeb.length;

    const addedList = (details.addedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const qty = b.gramasi ?? b.qty;
      const unit = safeText(b.satuan || b.unit, '');
      return qty !== undefined && qty !== null ? `${name} (${qty} ${unit})`.trim() : name;
    });

    const excludedList = allExcluded.map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const skippedList = alreadyOnWeb.map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const failedList = (details.failedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const err = safeText(b.error || b.alasan, 'Gagal diproses');
      return `${name}: ${err}`;
    });

    const addedListStr = addedList.length > 0 ? addedList.join(', ') : '-';
    const excludedListStr = excludedList.length > 0 ? excludedList.join(', ') : '-';
    const skippedListStr = skippedList.length > 0 ? skippedList.join(', ') : '-';
    const failedListStr = failedList.length > 0 ? failedList.join('; ') : '-';

    const fullKeterangan = buildFullKeterangan({
      menuNo,
      menuName,
      status: item.status,
      totalIngredients: item.total_ingredients,
      addedList,
      skippedList,
      excludedList,
      failedList,
    });

    // Baris Sheet 1: Ringkasan Riwayat
    summaryRowsXml += `
    <Row ss:AutoFitHeight="1">
      <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${idx + 1}</Data></Cell>
      <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(executedAt)}</Data></Cell>
      <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
      <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
      <Cell ss:StyleID="${statusStyle}"><Data ss:Type="String">${escapeXml(item.status)}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${item.total_ingredients || 0}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${item.added_count || 0}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${alreadyOnWebCount}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${excludedCount}</Data></Cell>
      <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${item.failed_count || 0}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(addedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(failedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(excludedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(skippedListStr)}</Data></Cell>
      <Cell ss:StyleID="CellStyleWrap"><Data ss:Type="String">${escapeXml(fullKeterangan)}</Data></Cell>
    </Row>`;

    // Baris Sheet 2: Bahan yang Berhasil Ditambahkan
    if (details.addedIngredients && details.addedIngredients.length > 0) {
      details.addedIngredients.forEach((itemIng) => {
        addedCounter++;
        const bName = safeText(itemIng.bahan || itemIng.item, '-');
        const bQty = Number(itemIng.gramasi ?? itemIng.qty) || 0;
        const bUnit = safeText(itemIng.satuan || itemIng.unit, '-');

        addedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${addedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(executedAt)}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="CellNumber"><Data ss:Type="Number">${bQty}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(bUnit)}</Data></Cell>
          <Cell ss:StyleID="SuccessStatus"><Data ss:Type="String">✓ Berhasil Ditambahkan</Data></Cell>
        </Row>`;
      });
    }

    // Baris Sheet 3: Bahan yang Gagal Diinject
    if (details.failedIngredients && details.failedIngredients.length > 0) {
      details.failedIngredients.forEach((itemIng) => {
        failedCounter++;
        const bName = safeText(itemIng.bahan || itemIng.item, '-');
        const bQty = itemIng.gramasi ?? itemIng.qty;
        const bUnit = safeText(itemIng.satuan || itemIng.unit, '-');
        const bError = safeText(itemIng.error || itemIng.alasan, 'Gagal diproses');

        failedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${failedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(executedAt)}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="CellNumber"><Data ss:Type="String">${bQty !== undefined && bQty !== null ? escapeXml(String(bQty)) : '-'}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(bUnit)}</Data></Cell>
          <Cell ss:StyleID="FailedStatus"><Data ss:Type="String">❌ Gagal Diinject</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bError)}</Data></Cell>
        </Row>`;
      });
    }

    // Baris Sheet 4: Dilewati & Excluded
    if (allExcluded.length > 0) {
      allExcluded.forEach((itemIng) => {
        skippedCounter++;
        const bName = safeText(itemIng.bahan || itemIng.item, '-');
        const bReason = safeText(itemIng.alasan, 'Dilewati karena aturan Exclude');

        skippedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${skippedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(executedAt)}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="WarningStatus"><Data ss:Type="String">🛡️ Excluded</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bReason)}</Data></Cell>
        </Row>`;
      });
    }

    if (alreadyOnWeb.length > 0) {
      alreadyOnWeb.forEach((itemIng) => {
        skippedCounter++;
        const bName = safeText(itemIng.bahan || itemIng.item, '-');
        const bReason = safeText(itemIng.alasan, 'Sudah terdaftar di tabel web ESB');

        skippedRowsXml += `
        <Row ss:Height="18">
          <Cell ss:StyleID="CellCenter"><Data ss:Type="Number">${skippedCounter}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(executedAt)}</Data></Cell>
          <Cell ss:StyleID="CellCenter"><Data ss:Type="String">${escapeXml(menuNo || '-')}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(menuName)}</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bName)}</Data></Cell>
          <Cell ss:StyleID="NeutralStatus"><Data ss:Type="String">Sudah Ada di Web</Data></Cell>
          <Cell ss:StyleID="CellStyle"><Data ss:Type="String">${escapeXml(bReason)}</Data></Cell>
        </Row>`;
      });
    }
  });

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${COMMON_EXCEL_STYLES}

 <!-- SHEET 1: RIWAYAT MENU -->
 <Worksheet ss:Name="Riwayat Injeksi Menu">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="130"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="120"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="240"/>
   <Column ss:Width="240"/>
   <Column ss:Width="220"/>
   <Column ss:Width="280"/>
   <Column ss:Width="420"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="14" ss:StyleID="TitleStyle">
     <Data ss:Type="String">RIWAYAT LENGKAP INJEKSI BOM ERP ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="24">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Waktu Eksekusi</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Total Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Ditambahkan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Sudah Ada</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Excluded</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Gagal</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">✓ Bahan Berhasil Ditambahkan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">❌ Rincian Bahan Gagal</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">🛡️ Rincian Bahan Excluded</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">⏭️ Bahan Sudah Ada di Web</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">📋 Keterangan Lengkap</Data></Cell>
   </Row>

   ${summaryRowsXml}
  </Table>
 </Worksheet>

 <!-- SHEET 2: BAHAN BERHASIL DITAMBAHKAN -->
 <Worksheet ss:Name="Bahan Berhasil Ditambahkan">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="130"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="160"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="7" ss:StyleID="TitleStyle">
     <Data ss:Type="String">RIWAYAT BAHAN YANG BERHASIL DIINJEKSI KE ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="7" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Berhasil Ditambahkan: ${addedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Waktu</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Gramasi / Qty</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Satuan</Data></Cell>
    <Cell ss:StyleID="HeaderSuccess"><Data ss:Type="String">Status</Data></Cell>
   </Row>

   ${addedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="7" ss:StyleID="CellCenter"><Data ss:Type="String">Tidak ada bahan yang berhasil ditambahkan.</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>

 <!-- SHEET 3: BAHAN GAGAL DIINJECT -->
 <Worksheet ss:Name="Bahan Gagal Diinject">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="130"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="90"/>
   <Column ss:Width="70"/>
   <Column ss:Width="140"/>
   <Column ss:Width="340"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="8" ss:StyleID="TitleStyle">
     <Data ss:Type="String">RIWAYAT BAHAN YANG GAGAL DIINJEKSI KE ESB</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="8" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Gagal: ${failedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Waktu</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Target Qty</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Satuan</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Status</Data></Cell>
    <Cell ss:StyleID="HeaderDanger"><Data ss:Type="String">Penyebab Error / Alasan Gagal</Data></Cell>
   </Row>

   ${failedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="8" ss:StyleID="CellCenter"><Data ss:Type="String">Tidak ada riwayat bahan yang gagal diinjeksi (0 error).</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>

 <!-- SHEET 4: DILEWATI & EXCLUDED -->
 <Worksheet ss:Name="Dilewati &amp; Excluded">
  <Table>
   <Column ss:Width="35"/>
   <Column ss:Width="130"/>
   <Column ss:Width="65"/>
   <Column ss:Width="230"/>
   <Column ss:Width="220"/>
   <Column ss:Width="140"/>
   <Column ss:Width="340"/>

   <Row ss:Height="24">
    <Cell ss:MergeAcross="6" ss:StyleID="TitleStyle">
     <Data ss:Type="String">RIWAYAT BAHAN YANG DILEWATI (SUDAH ADA / DI-EXCLUDE)</Data>
    </Cell>
   </Row>
   <Row ss:Height="18">
    <Cell ss:MergeAcross="6" ss:StyleID="MetaStyle">
     <Data ss:Type="String">Total Bahan Dilewati: ${skippedCounter} item</Data>
    </Cell>
   </Row>
   <Row ss:Height="10"/>

   <Row ss:Height="22">
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Waktu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">No Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Menu</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Nama Bahan</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Kategori</Data></Cell>
    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">Keterangan / Alasan</Data></Cell>
   </Row>

   ${skippedRowsXml || `
   <Row ss:Height="20">
    <Cell ss:MergeAcross="6" ss:StyleID="CellCenter"><Data ss:Type="String">Tidak ada bahan yang dilewati atau di-exclude.</Data></Cell>
   </Row>
   `}
  </Table>
 </Worksheet>
</Workbook>`;

  downloadBlob(xmlContent, safeFilename, 'application/vnd.ms-excel;charset=utf-8');
}

/**
 * Ekspor Hasil Injeksi ke format CSV (dengan UTF-8 BOM agar rapi di Excel)
 */
export function exportReportToCsv(report) {
  if (!report || !Array.isArray(report.results) || report.results.length === 0) {
    alert('Tidak ada data hasil eksekusi untuk diunduh.');
    return;
  }

  const safeFilename = `Laporan_Hasil_BOM_ESB_${new Date().toISOString().slice(0, 10)}.csv`;
  const headers = [
    'No',
    'No Menu',
    'Nama Menu (Sistem)',
    'Nama Resep',
    'Status Injeksi',
    'Total Bahan JSON',
    'Ditambahkan',
    'Sudah Ada',
    'Excluded',
    'Gagal',
    'Bahan Berhasil Diinject',
    'Bahan Gagal Diinject',
    'Rincian Bahan Excluded',
    'Rincian Bahan Sudah Ada',
    'Keterangan Lengkap',
  ];
  const rows = [headers];

  report.results.forEach((res, idx) => {
    const menuNo = res.menuNo ? `#${res.menuNo}` : '';
    const menuName = safeText(res.menuName, 'Tanpa Nama');
    const menuDisplayName = safeText(res.menuDisplayName, menuName);
    const totalIngredients = Number(res.totalIngredients) || 0;

    const addedList = (res.addedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const qty = b.gramasi ?? b.qty;
      const unit = safeText(b.satuan || b.unit, '');
      return qty !== undefined && qty !== null ? `${name} (${qty} ${unit})`.trim() : name;
    });

    const excludedList = (res.excludedIngredients || []).map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const skippedList = (res.skippedIngredients || []).map((b) => safeText(b.bahan || b.item, 'Bahan'));
    const failedList = (res.failedIngredients || []).map((b) => {
      const name = safeText(b.bahan || b.item, 'Bahan');
      const err = safeText(b.error || b.alasan, 'Gagal diproses');
      return `${name}: ${err}`;
    });

    const fullKeterangan = buildFullKeterangan({
      menuNo,
      menuName,
      status: res.status,
      totalIngredients,
      addedList,
      skippedList,
      excludedList,
      failedList,
    });

    rows.push([
      String(idx + 1),
      menuNo || '-',
      menuName,
      menuDisplayName,
      safeText(res.status, '-'),
      String(totalIngredients),
      String(addedList.length),
      String(skippedList.length),
      String(excludedList.length),
      String(failedList.length),
      addedList.join(', ') || '-',
      failedList.join('; ') || '-',
      excludedList.join(', ') || '-',
      skippedList.join(', ') || '-',
      fullKeterangan,
    ]);
  });

  const csvContent = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  downloadBlob(csvContent, safeFilename, 'text/csv;charset=utf-8;');
}
