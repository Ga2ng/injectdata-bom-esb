# ESB Local Controller

Dashboard localhost sederhana (React + Vite) dengan backend Node.js + Express, Playwright over CDP, SSE live log, dan SQLite untuk memantau serta mengendalikan sesi Chrome yang membuka `https://esb.co.id` secara aman.

> **Tahap Pertama:** hanya fokus pada koneksi browser CDP, deteksi tab `esb.co.id`, pemantauan navigasi/title, log realtime, serta tombol `Start Demo` (inspeksi baca-saja) dan `Stop`.

## Prasyarat

- **Node.js** `>= 20` dan **npm**
- **Google Chrome** terpasang di Windows

## Instalasi

Install dependency untuk backend (`server/`) dan frontend (`client/`):

```powershell
npm run install:all
```

Atau satu per satu:

```powershell
npm --prefix server install
npm --prefix client install
```

## Cara Menjalankan

### 1. Jalankan Chrome dengan Remote Debugging (CDP)

Playwright tidak dapat mengambil alih jendela Chrome reguler yang berjalan tanpa flag remote debugging. Gunakan folder profil khusus otomasi agar tidak mengganggu profil Chrome harian Anda:

```powershell
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:LOCALAPPDATA\ESB-Automation-Chrome" `
  https://esb.co.id
```

Login ke `https://esb.co.id` secara manual di jendela Chrome tersebut.

### 2. Jalankan Backend dan Frontend

Jalankan keduanya bersamaan dari root project:

```powershell
npm run dev
```

Atau jalankan di dua terminal terpisah:

```powershell
# Terminal 1 — Backend (http://127.0.0.1:3001)
npm run dev:server

# Terminal 2 — Frontend (http://127.0.0.1:5173)
npm run dev:client
```

Buka dashboard di browser: `http://127.0.0.1:5173` (atau `http://localhost:5173`).

## Alur Penggunaan

1. Pastikan status header menunjukkan **Backend: Online**.
2. Klik **Connect**.
   - Jika Chrome belum dijalankan dengan `--remote-debugging-port=9222`, dashboard akan menampilkan status `Error` dan instruksi PowerShell di atas.
   - Jika Chrome CDP aktif dan tab `esb.co.id` terbuka, dashboard menampilkan `Connected`, `ESB tab detected`, URL, dan Title halaman.
3. Klik **Start Demo** untuk menjalankan inspeksi baca-saja (`Demo started` -> `Page inspected` -> `Demo completed`).
4. Klik **Stop** kapan saja untuk membatalkan task aktif dengan aman tanpa menutup Chrome.
5. Klik **Disconnect** untuk melepas Playwright dari CDP tanpa menutup jendela Chrome pengguna.

## Endpoint Backend (`http://127.0.0.1:3001`)

- `GET /api/health` — status backend
- `GET /api/browser/status` — status CDP, tab ESB, task, dan log terbaru
- `POST /api/browser/connect` — sambungkan Playwright ke `http://127.0.0.1:9222`
- `POST /api/browser/disconnect` — lepas Playwright tanpa menutup Chrome
- `POST /api/browser/start` — jalankan demo inspeksi aman
- `POST /api/browser/stop` — hentikan task aktif secara aman
- `GET /api/events` — Server-Sent Events (SSE) untuk status & log realtime

## Troubleshooting

- **Endpoint CDP (`http://127.0.0.1:9222`) tidak dapat dijangkau**
  - Pastikan semua jendela Chrome dengan profil otomasi (`ESB-Automation-Chrome`) ditutup terlebih dahulu sebelum menjalankan perintah Chrome CDP, lalu pastikan `http://127.0.0.1:9222/json/version` dapat diakses di browser.
  - Periksa apakah lokasi `chrome.exe` Anda berada di `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` atau `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`.
- **Chrome Connected, tetapi `ESB tab not found`**
  - Buka tab menuju `https://esb.co.id` di dalam jendela Chrome yang sama dengan sesi CDP tersebut. Dashboard akan mendeteksinya otomatis.
- **Error `better-sqlite3` saat install**
  - Jika prebuild binary tidak tersedia untuk versi Node Anda, pastikan Node.js versi LTS (v20/v22) digunakan.

