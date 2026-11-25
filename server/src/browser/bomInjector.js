import { isBomUrl } from './cdpClient.js';
import { log } from '../events/eventBus.js';
import { getExcludedMaterialsList } from '../database/db.js';

function checkAbort(signal) {
  if (signal?.aborted) {
    const err = new Error('Injeksi BOM dihentikan oleh pengguna.');
    err.name = 'AbortError';
    throw err;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('Injeksi BOM dihentikan.');
      err.name = 'AbortError';
      return reject(err);
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);
      const err = new Error('Injeksi BOM dihentikan.');
      err.name = 'AbortError';
      reject(err);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function normalizeTokens(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isMaterialMatch(name1, name2) {
  const tokens1 = normalizeTokens(name1);
  const tokens2 = normalizeTokens(name2);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  const str1 = tokens1.join(' ');
  const str2 = tokens2.join(' ');
  if (str1 === str2) return true;

  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let match1 = 0;
  for (const t of set1) {
    if (set2.has(t)) match1++;
  }

  let match2 = 0;
  for (const t of set2) {
    if (set1.has(t)) match2++;
  }

  if (match1 / set1.size >= 0.75 || match2 / set2.size >= 0.75) return true;
  if (str1.includes(str2) || str2.includes(str1)) return true;

  return false;
}

/**
 * Scan seluruh baris bahan yang sudah terdaftar di form edit BOM (tr[id] yang sudah tersimpan)
 */
export async function getExistingBomItemsFromPage(page) {
  return await page.evaluate(() => {
    const inputs = document.querySelectorAll('tr[id] input.bomDetailProductName');
    const items = [];
    inputs.forEach((input) => {
      const val = input.value ? input.value.trim() : '';
      if (val && !input.classList.contains('bomDetailProductNameInput')) {
        items.push(val);
      }
    });
    return Array.from(new Set(items));
  });
}

/**
 * Menunggu form edit BOM siap di halaman
 */
async function waitForBomDetailTable(page, timeoutMs = 25000) {
  const locator = page.locator('input.bomDetailProductNameInput, a.ModalDialogButton[data-target-productname*="Input"], #btnSave').first();
  await locator.waitFor({ state: 'attached', timeout: timeoutMs });
}

/**
 * Alur Eksekusi Injeksi BOM ESB
 */
export async function injectBomMenu(page, menuData, signal, options = {}) {
  checkAbort(signal);

  const DRY_RUN = Boolean(options.dryRun || menuData.dryRun);
  // Prioritaskan namaSystem / systemName sebagai acuan pencarian di sistem ESB!
  const systemSearchName = menuData.namaSystem || menuData.systemName || menuData.menuName || 'Tanpa Nama';
  const menuDisplayName = menuData.menuName || systemSearchName;
  let ingredients = Array.isArray(menuData.ingredients) ? menuData.ingredients : [];
  const menuNo = menuData.menuNo || '';

  // Auto-replace "TOGE PANJANG" -> "tauge panjang" sebelum eksekusi
  ingredients = ingredients.map((ing) => {
    if (ing && ing.bahan && /toge\s*panjang/i.test(ing.bahan)) {
      return { ...ing, bahan: 'tauge panjang' };
    }
    return ing;
  });

  // Ambil daftar bahan yang di-exclude dari database
  const excludedMaterials = (getExcludedMaterialsList() || []).map((m) => m.toLowerCase().trim());
  const excludedSet = new Set(excludedMaterials);

  log('INFO', 'inject_start', `[Menu #${menuNo}] "${systemSearchName}" (${ingredients.length} bahan di JSON). DRY_RUN: ${DRY_RUN}`);

  // 1. Cek posisi: jika browser sudah di halaman edit BOM dan cocok untuk menu ini, langsung lanjutkan!
  const isAlreadyInTargetEditPage = await page.evaluate(({ sysName, dispName }) => {
    const hasEditElements = Boolean(
      document.querySelector('input.bomDetailProductNameInput') ||
      document.querySelector('#btnSave') ||
      document.querySelector('a.ModalDialogButton[data-target-productname*="Input"]')
    );
    if (!hasEditElements) return false;

    // Periksa apakah halaman edit ini memang untuk target menu ini
    const headInput = document.querySelector('input[name*="bomName"], #msbomhead-bomname, input#bomName');
    if (headInput && headInput.value) {
      const val = headInput.value.trim().toLowerCase();
      return val === sysName.toLowerCase() || val === dispName.toLowerCase();
    }
    const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
    return bodyText.includes(sysName.toLowerCase()) || bodyText.includes(dispName.toLowerCase());
  }, { sysName: systemSearchName, dispName: menuDisplayName });

  if (isAlreadyInTargetEditPage) {
    log('INFO', 'inject_pos', `Posisi browser SUDAH BERADA di halaman edit BOM untuk "${systemSearchName}".`);
  } else {
    log('INFO', 'inject_nav', 'Navigasi ke https://erp.esb.co.id/bom...');
    await page.goto('https://erp.esb.co.id/bom', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1200, signal);

    log('INFO', 'inject_search', `Mencari menu di sistem ESB dengan nama: "${systemSearchName}"...`);
    const searchInput = page.locator('input[name="MsBOMHeadForm[bomName]"]');
    await searchInput.waitFor({ state: 'visible', timeout: 15000 });
    await searchInput.fill('');
    await searchInput.type(systemSearchName, { delay: 20 });
    await page.keyboard.press('Enter');

    await sleep(2500, signal);
    checkAbort(signal);

    const editBtn = page.locator('a:has(i.glyphicon-pencil), button:has(i.glyphicon-pencil)').first();
    const hasEditBtn = await editBtn.isVisible().catch(() => false);

    // Fallback 1: Jika belum muncul dan ada kurung luar "(Menu ...)", coba cari tanpa kurung
    if (!hasEditBtn) {
      const cleaned = systemSearchName.replace(/^\(|\)$/g, '').trim();
      if (cleaned && cleaned !== systemSearchName) {
        log('INFO', 'inject_search_retry', `Hasil pencarian 0, mencoba tanpa kurung: "${cleaned}"...`);
        await searchInput.fill('');
        await searchInput.type(cleaned, { delay: 20 });
        await page.keyboard.press('Enter');
        await sleep(2500, signal);
      }
    }

    // Fallback 2: Jika masih belum ada, coba cari dengan menuDisplayName
    const hasEditBtn2 = await editBtn.isVisible().catch(() => false);
    if (!hasEditBtn2 && menuDisplayName && menuDisplayName !== systemSearchName) {
      log('INFO', 'inject_search_retry', `Hasil pencarian 0, mencoba dengan menuName: "${menuDisplayName}"...`);
      await searchInput.fill('');
      await searchInput.type(menuDisplayName, { delay: 20 });
      await page.keyboard.press('Enter');
      await sleep(2500, signal);
    }

    await editBtn.waitFor({ state: 'visible', timeout: 15000 });
    log('INFO', 'inject_edit', `Klik tombol Edit menu "${systemSearchName}"...`);
    await editBtn.click();
  }

  // 2. Tunggu form input tabel BOM siap
  await waitForBomDetailTable(page, 25000);
  await sleep(1000, signal);
  checkAbort(signal);

  // 3. SCAN SELURUH BAHAN YANG SUDAH ADA DI TBODY
  const existingItemsOnPage = await getExistingBomItemsFromPage(page);
  log('INFO', 'inject_scan', `[SCAN TBODY] Terdeteksi ${existingItemsOnPage.length} bahan yang sudah tersimpan di web.`);

  const report = {
    menuName: systemSearchName,
    menuDisplayName,
    menuNo,
    dryRun: DRY_RUN,
    totalIngredients: ingredients.length,
    addedIngredients: [],
    skippedIngredients: [],
    excludedIngredients: [],
    failedIngredients: [],
    status: 'In Progress',
  };

  // 4. Pisahkan mana yang di-exclude [EXCLUDED], mana yang sudah ada [SKIP], vs mana yang belum ada [MISSING]
  const missingItems = [];
  for (const ing of ingredients) {
    const itemName = ing.bahan;
    const cleanLower = (itemName || '').toLowerCase().trim();

    // Cek apakah bahan ini masuk dalam daftar EXCLUDE (tidak harus diinject)
    if (excludedSet.has(cleanLower) || excludedMaterials.some((ex) => isMaterialMatch(ex, cleanLower))) {
      log('INFO', 'inject_skip_exclude', `[EXCLUDE] Bahan "${itemName}" dilewati karena ditandai tidak diinject.`);
      report.excludedIngredients.push({
        bahan: itemName,
        alasan: 'Ditandai Exclude (tidak harus diinject)',
      });
      continue;
    }

    const exists = existingItemsOnPage.some((webName) => isMaterialMatch(webName, itemName));

    if (exists) {
      log('INFO', 'inject_skip', `[SKIP] "${itemName}" SUDAH ADA di tabel web.`);
      report.skippedIngredients.push({
        bahan: itemName,
        alasan: 'Sudah ada di web',
      });
    } else {
      missingItems.push(ing);
    }
  }

  log(
    'INFO',
    'inject_diff',
    `Hasil Banding: ${report.skippedIngredients.length} [SUDAH ADA], ${report.excludedIngredients.length} [EXCLUDE], ${missingItems.length} [MISSING] (akan diinjeksi).`
  );

  if (DRY_RUN) {
    log('SUCCESS', 'dry_run_complete', `[DRY RUN SELESAI] Bahan missing: ${missingItems.map(m => m.bahan).join(', ')}`);
    report.status = 'Dry Run Completed';
    report.missingItemsPreview = missingItems;
    return report;
  }

  if (missingItems.length === 0) {
    log('SUCCESS', 'inject_done', 'Semua bahan di JSON sudah ada di tabel web atau di-exclude. Tidak ada yang perlu ditambahkan.');
    report.status = 'Completed (All Items Exist/Excluded)';
    return report;
  }

  // 5. LOOP PENAMBAHAN BAHAN YANG BELUM ADA (missingItems)
  for (let index = 0; index < missingItems.length; index++) {
    checkAbort(signal);

    const ing = missingItems[index];
    const ingName = ing.bahan;
    const ingQty = ing.gramasi;
    const ingUnit = (ing.satuan || '').trim().toUpperCase();
    const ingKemasan = ing.kemasan;

    log('INFO', 'inject_adding', `[ADDING ${index + 1}/${missingItems.length}] Membuka modal browse: "${ingName}" (Qty: ${ingQty} ${ingUnit}, Kemasan: ${ingKemasan})...`);

    try {
      // 5a. KLIK TOMBOL BROWSE "..." PADA BARIS INPUT
      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('a.ModalDialogButton[data-target-productname*="Input"], a.ModalDialogButton[data-target-productdetailid*="Input"]');
        if (btn) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        const btnLocator = page.locator('a.ModalDialogButton[data-target-productname*="Input"], a.ModalDialogButton[data-target-productdetailid*="Input"]').first();
        await btnLocator.waitFor({ state: 'attached', timeout: 15000 });
        await btnLocator.click();
      }

      // 5b. TUNGGU LANGSUNG INPUT PENCARIAN DI MODAL: #msproductdetail-productname
      log('INFO', 'inject_type_search', `Mengetik pencarian di input #msproductdetail-productname: "${ingName}"...`);
      
      const searchBoxLocator = page.locator('#ModalDialogBody input#msproductdetail-productname, input#msproductdetail-productname').first();
      await searchBoxLocator.waitFor({ state: 'visible', timeout: 15000 });

      await searchBoxLocator.click();
      await searchBoxLocator.fill('');
      await searchBoxLocator.type(ingName, { delay: 40 });
      await page.keyboard.press('Enter');

      // 5c. TUNGGU HASIL TABEL MUNCUL / SELESAI FILTER
      log('INFO', 'inject_wait_result', `Menunggu hasil pencarian untuk "${ingName}" muncul...`);
      await sleep(2200, signal);
      checkAbort(signal);

      await page.waitForSelector('#tblBrowseProduct tbody tr, #ModalDialogBody tbody tr', { timeout: 10000 });

      // 5d. SCANNING HASIL POPUP: PRIORITASKAN NAMA TEPAT & SATUAN TERKECIL (HINDARI PACK @, BOTOL @)
      log('INFO', 'inject_select_item', `Memilih bahan "${ingName}" dengan Satuan Terkecil murni (tanpa @)...`);

      const selectResult = await page.evaluate(({ targetName, targetUnit, targetKemasan }) => {
        const table = document.querySelector('#tblBrowseProduct table, #tblBrowseProduct-container table, #ModalDialogBody table');
        if (!table) return { success: false, reason: 'Tabel browse tidak ditemukan' };

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        if (rows.length === 0) return { success: false, reason: 'Tabel hasil kosong' };

        let bestMatchLink = null;
        let highestScore = -999;

        const cleanTarget = (targetName || '').toUpperCase().trim();

        // Satuan terkecil murni (basis)
        const BASE_UNITS = new Set(['GR', 'GRAM', 'ML', 'PCS', 'PORSI', 'PINCH', 'LEMBAR', 'BUTIR']);

        for (const row of rows) {
          const selectLink = row.querySelector('a.ModalDialogSelect, a:has(.glyphicon-ok), .glyphicon-ok');
          if (!selectLink) continue;

          const actualLink = selectLink.closest('a') || selectLink;
          const returnProductName = (actualLink.getAttribute('data-return-productname') || '').toUpperCase().trim();
          const returnUomName = (actualLink.getAttribute('data-return-uomname') || '').toUpperCase().trim();
          const returnCategory = (actualLink.getAttribute('data-return-categoryname') || '').toUpperCase().trim();
          const returnSubCategory = (actualLink.getAttribute('data-return-subcategoryname') || '').toUpperCase().trim();
          const rowText = (row.innerText || '').toUpperCase();

          let score = 0;

          // 1. PRIORITAS KETAT: NAMA PRODUK HARUS PERSIS SAMA
          if (returnProductName === cleanTarget) {
            score += 100;
          } else if (returnProductName.split(/\s+/).includes(cleanTarget)) {
            score += 20;
          } else {
            score -= 30;
          }

          // 2. PRIORITAS SATUAN TERKECIL (HINDARI YANG ADA @)
          const hasAtSymbol = returnUomName.includes('@') || returnUomName.includes('PACK') || returnUomName.includes('CART') || returnUomName.includes('DRG') || returnUomName.includes('JIRIGEN') || returnUomName.includes('PAIL') || returnUomName.includes('SLOP');
          
          if (hasAtSymbol) {
            score -= 50;
          }

          // Jika satuan resep (targetUnit) cocok persis
          if (targetUnit && returnUomName === targetUnit) {
            score += 40;
          } else if (BASE_UNITS.has(returnUomName)) {
            score += 30;
          }

          if (returnSubCategory === 'PASAR' || returnCategory === 'PASAR') {
            score += 10;
          }

          if (score > highestScore) {
            highestScore = score;
            bestMatchLink = actualLink;
          }
        }

        const targetLink = bestMatchLink || rows[0].querySelector('a.ModalDialogSelect, a:has(.glyphicon-ok)');
        if (targetLink) {
          const uomSelected = targetLink.getAttribute('data-return-uomname') || '';
          const prodSelected = targetLink.getAttribute('data-return-productname') || '';
          targetLink.click();
          return { success: true, chosen: `${prodSelected} (${uomSelected})` };
        }

        return { success: false, reason: 'Tombol centang/select tidak ditemukan pada baris popup' };
      }, { targetName: ingName, targetUnit: ingUnit, targetKemasan: ingKemasan });

      if (!selectResult.success) {
        const okBtn = page.locator('#tblBrowseProduct a.ModalDialogSelect, #ModalDialogBody a.ModalDialogSelect, a.ModalDialogSelect').first();
        await okBtn.waitFor({ state: 'visible', timeout: 8000 });
        await okBtn.click();
      } else {
        log('INFO', 'inject_uom_chosen', `Pilihan terpilih: ${selectResult.chosen || ingName}`);
      }

      await sleep(1200, signal);
      checkAbort(signal);

      // 5e. PINDAH KE KOLOM QTY DAN ISI SESUAI GRAMASI DARI JSON
      log('INFO', 'inject_fill_qty', `Memasukkan Gramasi Qty: ${ingQty}...`);
      
      const qtyInput = page.locator('input.bomDetailQtyInput, input[name*="QtyInput"]').first();
      await qtyInput.waitFor({ state: 'visible', timeout: 10000 });
      await qtyInput.click();
      await qtyInput.fill('');
      await qtyInput.type(String(ingQty), { delay: 20 });

      existingItemsOnPage.push(ingName);
      report.addedIngredients.push({
        bahan: ingName,
        gramasi: ingQty,
        satuan: ingUnit,
      });

      log('SUCCESS', 'inject_added', `[ADDED] Sukses pilih bahan terkecil "${ingName}" & isi Qty: ${ingQty} ${ingUnit}.`);

      // 5f. JIKA MASIH ADA SISA BAHAN BERIKUTNYA:
      if (index < missingItems.length - 1) {
        log('INFO', 'inject_add_row', `Menambahkan baris baru (Add BOM Detail) untuk bahan ke-${index + 2}...`);

        const prevTrCount = await page.locator('tbody tr').count();

        const addRowBtn = page.locator('#btnAdd, button.btnAdd, a.btnAdd, #btnAddDetail, a.btnAddDetail, a:has-text("Add BOM Detail"), a:has-text("Add Detail")').first();
        const hasAddBtn = await addRowBtn.count();

        if (hasAddBtn > 0) {
          await addRowBtn.click();
          await page.waitForFunction(
            (prev) => document.querySelectorAll('tbody tr').length > prev,
            prevTrCount,
            { timeout: 8000 }
          ).catch(() => null);
        } else {
          await qtyInput.press('Enter').catch(() => null);
        }

        await sleep(1000, signal);
      }
    } catch (err) {
      log('ERROR', 'inject_error', `[ERROR] Gagal memproses bahan "${ingName}": ${err.message}`);
      report.failedIngredients.push({
        bahan: ingName,
        error: err.message,
      });

      try {
        const closeBtn = page.locator('#ModalDialogBody button[data-dismiss="modal"], .modal.in button[data-dismiss="modal"], .modal.in .close').first();
        if (await closeBtn.isVisible()) await closeBtn.click();
      } catch {
        // Ignore
      }
    }
  }

  // 6. SCROLL KE PALING BAWAH DAN KLIK TOMBOL SAVE
  checkAbort(signal);

  log('INFO', 'inject_save', 'Semua bahan selesai diisi. Scroll ke paling bawah dan klik tombol Save...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000, signal);

  const saveBtn = page.locator('#btnSave, button[type="submit"]:has(i.glyphicon-save)').first();
  await saveBtn.waitFor({ state: 'visible', timeout: 10000 });
  await saveBtn.click();
  await sleep(3500, signal);

  report.status = report.failedIngredients.length === 0 ? 'Success' : 'Partial Success';
  log(
    'SUCCESS',
    'inject_finish',
    `[SELESAI] Menu "${menuName}" berhasil di-save ke ESB! (+${report.addedIngredients.length} bahan baru dimasukkan, ${report.skippedIngredients.length} sudah ada, ${report.excludedIngredients.length} di-exclude).`
  );

  return report;
}
