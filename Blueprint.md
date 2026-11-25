# Blueprint --- ESB Local Browser Controller

> Tujuan tahap pertama: membuat dashboard localhost sederhana berbasis
> React yang dapat memantau dan mengendalikan sesi Chrome yang membuka
> `https://esb.co.id` melalui Playwright. Fokus awal hanya koneksi
> browser, status sesi, live activity, serta tombol Start/Stop. Fitur
> import invoice, perbandingan data, dan otomasi transaksi menjadi tahap
> berikutnya.

## 1. Prinsip dan batasan implementasi

-   Frontend hanya **React** (Vite), CSS biasa, tanpa Next.js, Tailwind,
    component library, atau desain berlebihan.
-   Backend **Node.js + Express**.
-   Browser automation **Playwright**.
-   Database lokal **SQLite**.
-   Dashboard harus sederhana, cepat, dan fungsional.
-   Jangan mengisi, mengubah, menghapus, atau menyimpan transaksi ESB
    pada tahap pertama.
-   Jangan mengakali login, CAPTCHA, MFA, atau kontrol akses ESB.
-   Jangan menyimpan password, cookie, token, atau `storageState` ke
    database maupun repository.
-   Semua tindakan browser harus terlihat di Chrome yang dikendalikan,
    bukan berjalan headless.
-   Sediakan tombol Stop yang menghentikan otomasi dengan aman. Jangan
    menutup Chrome secara paksa kecuali pengguna memilih tindakan tutup
    browser secara eksplisit.

## 2. Catatan penting: menyambungkan Chrome yang sudah terbuka

Playwright tidak dapat secara andal mengambil alih sembarang jendela
Chrome yang sudah berjalan normal. Untuk `connectOverCDP`, Chrome harus
sudah dijalankan dengan **remote debugging port** yang aktif.

Antigravity harus memeriksa kondisi ini terlebih dahulu:

1.  Periksa apakah Chrome yang sedang membuka ESB menyediakan endpoint
    CDP lokal, umumnya `http://127.0.0.1:9222`.
2.  Jika tersedia, hubungkan Playwright menggunakan
    `chromium.connectOverCDP('http://127.0.0.1:9222')`, lalu temukan tab
    yang URL-nya cocok dengan `esb.co.id`.
3.  Jika endpoint tidak tersedia, jangan mengklaim sudah tersambung dan
    jangan mencoba membaca profil Chrome aktif secara paksa.
4.  Tampilkan instruksi yang jelas bahwa Chrome perlu dibuka ulang
    dengan remote debugging aktif. Gunakan profil khusus otomasi, bukan
    profil pribadi utama.

Contoh menjalankan Chrome dengan CDP (Windows, sesuaikan lokasi
executable dan profil):

``` powershell
# Tutup jendela Chrome yang akan dipakai untuk sesi otomasi terlebih dahulu.
# Gunakan folder profil khusus agar tidak mengganggu profil Chrome harian.
& "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:LOCALAPPDATA\ESB-Automation-Chrome" `
  https://esb.co.id
```

Jika Chrome terpasang di lokasi lain, cari executable yang benar. Login
ESB dilakukan manual oleh pengguna. Jangan memasukkan kredensial ke
script.

**Keamanan CDP:** endpoint debugging memberi kendali luas atas browser.
Ikat hanya ke `127.0.0.1`, jangan expose port 9222 ke jaringan, jangan
membuat endpoint publik, dan jangan menerima URL CDP dari request
browser/frontend. Backend hanya boleh memakai alamat lokal yang sudah
ditetapkan di konfigurasi.

## 3. Stack teknologi

  -----------------------------------------------------------------------
  Layer                   Teknologi               Tanggung jawab
  ----------------------- ----------------------- -----------------------
  Frontend                React + Vite            Dashboard status dan
                                                  kontrol

  Styling                 CSS biasa               Layout sederhana,
                                                  responsif

  Backend                 Node.js + Express       API lokal dan
                                                  orkestrasi

  Browser                 Playwright              Koneksi dan kendali tab
                                                  Chrome

  Protokol                CDP                     Attach ke Chrome yang
                                                  dibuka dengan remote
                                                  debugging

  Realtime                Server-Sent Events      Mengirim log/status ke
                          (SSE)                   dashboard

  Database                SQLite                  Riwayat sesi dan
                                                  event/log penting
  -----------------------------------------------------------------------

Gunakan JavaScript (ES modules) agar setup tetap sederhana. Jangan
menambah TypeScript, Redux, Docker, Redis, atau ORM pada tahap awal
kecuali benar-benar diperlukan.

## 4. Arsitektur

``` text
React Dashboard (localhost:5173)
        |
        | HTTP API + SSE
        v
Express Backend (localhost:3001)
        |
        +---- Session Controller
        |       |
        |       +---- Playwright connectOverCDP
        |                    |
        |                    v
        |             Chrome visible window
        |                    |
        |                    v
        |                esb.co.id
        |
        +---- Activity/Event Logger
        |
        +---- SQLite (local data)
```

Backend menjadi satu-satunya pihak yang berbicara dengan Playwright dan
SQLite. Frontend tidak boleh mengakses CDP atau database secara
langsung.

## 5. Struktur folder yang diharapkan

``` text
esb-local-controller/
├── client/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── api.js
│       ├── styles.css
│       └── components/
│           ├── ConnectionPanel.jsx
│           ├── BrowserPanel.jsx
│           ├── ActivityLog.jsx
│           └── ControlBar.jsx
├── server/
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── config.js
│       ├── routes/
│       │   └── browserRoutes.js
│       ├── browser/
│       │   ├── cdpClient.js
│       │   └── sessionManager.js
│       ├── events/
│       │   └── eventBus.js
│       └── database/
│           ├── db.js
│           └── schema.sql
├── data/
│   └── .gitkeep
├── .gitignore
├── package.json
└── README.md
```

## 6. Fitur wajib tahap pertama

### 6.1 Connection panel

Tampilkan:

-   Status: `Disconnected`, `Connecting`, `Connected`, atau `Error`.
-   Endpoint CDP lokal (read-only): `http://127.0.0.1:9222`.
-   Tombol **Connect**.
-   Tombol **Disconnect**.
-   Nama/URL tab aktif yang cocok dengan ESB.
-   Waktu koneksi terakhir.
-   Pesan error yang dapat dipahami pengguna.

Saat Connect ditekan:

1.  Backend mencoba menghubungi endpoint CDP.
2.  Playwright mengambil daftar context dan page.
3.  Cari tab dengan hostname `esb.co.id` atau subdomainnya.
4.  Jika ditemukan, pilih tab tersebut dan pantau URL/title.
5.  Jika tidak ditemukan, status koneksi browser dapat tetap connected,
    tetapi status tab ESB harus ditampilkan `ESB tab not found`.
6.  Jangan melakukan login otomatis.

### 6.2 Browser activity panel

Tampilkan informasi yang dipantau dari tab:

-   URL saat ini.
-   Page title.
-   Status tab.
-   Perubahan navigasi.
-   Waktu event terakhir.

Jangan menampilkan isi halaman, data pelanggan, invoice, atau informasi
sensitif pada log.

### 6.3 Start / Stop controller

Untuk proof-of-connection, tombol **Start** menjalankan demo aman:

-   Playwright memeriksa tab ESB yang sudah dipilih.
-   Baca URL dan title.
-   Lakukan navigasi hanya jika pengguna secara eksplisit memilih
    tindakan navigasi; default tidak menavigasi.
-   Tampilkan event `Demo started`, `Page inspected`, dan
    `Demo completed`.
-   Tidak mengklik tombol transaksi, mengisi field, atau menyimpan data
    ESB.

Tombol **Stop** menghentikan demo/task aktif dan mencegah task baru
dimulai. Gunakan `AbortController` atau mekanisme cancellation yang
sesuai; hindari membunuh proses Chrome. Tampilkan status `Stopped`.

Jika belum ada task aktif, Stop harus aman dan tidak error. Cegah dua
task berjalan bersamaan.

### 6.4 Activity log

Log realtime dengan waktu dan level:

-   `INFO`
-   `SUCCESS`
-   `WARNING`
-   `ERROR`

Contoh:

``` text
15:10:01 INFO     Connecting to Chrome CDP...
15:10:02 SUCCESS  Chrome connected
15:10:02 SUCCESS  ESB tab detected
15:10:03 INFO     Current URL: https://esb.co.id/...
15:10:05 SUCCESS  Demo inspection completed
```

Jangan mencatat cookie, header authorization, token, password, isi form,
atau data sensitif.

## 7. API backend

Implementasikan API lokal berikut:

  ---------------------------------------------------------------------------
  Method                  Endpoint                    Fungsi
  ----------------------- --------------------------- -----------------------
  GET                     `/api/health`               Cek backend

  GET                     `/api/browser/status`       Status CDP, tab, dan
                                                      task

  POST                    `/api/browser/connect`      Connect ke CDP lokal

  POST                    `/api/browser/disconnect`   Lepas koneksi
                                                      Playwright tanpa
                                                      menutup Chrome

  POST                    `/api/browser/start`        Mulai demo inspeksi
                                                      aman

  POST                    `/api/browser/stop`         Hentikan task aktif

  GET                     `/api/events`               SSE untuk log/status
                                                      realtime
  ---------------------------------------------------------------------------

Validasi semua request. Jangan menyediakan endpoint generik untuk
menjalankan JavaScript arbitrer, mengakses URL bebas, atau mengeksekusi
selector dari frontend.

## 8. SQLite

Buat database `data/automation.sqlite` dan tabel minimal:

### `browser_sessions`

-   `id` INTEGER PRIMARY KEY
-   `connected_at` DATETIME
-   `disconnected_at` DATETIME NULL
-   `cdp_endpoint` TEXT
-   `browser_name` TEXT
-   `status` TEXT

### `activity_logs`

-   `id` INTEGER PRIMARY KEY
-   `created_at` DATETIME
-   `level` TEXT
-   `event` TEXT
-   `message` TEXT

SQLite dipakai untuk menyimpan riwayat sesi dan log penting, bukan
menyimpan sesi login browser. Buat index untuk `created_at`. Gunakan
parameterized queries.

## 9. UI/UX dashboard

Gaya visual:

-   Background abu-abu sangat muda atau putih.
-   Teks abu-abu gelap.
-   Satu warna aksen biru sederhana.
-   Border tipis, radius kecil/sedang.
-   Tanpa gradient, glassmorphism, animasi berlebihan, ilustrasi AI,
    atau kartu dekoratif.
-   Gunakan font sistem.
-   Desktop-first tetapi tetap usable pada layar kecil.

Susunan halaman:

``` text
ESB Local Controller                         Backend: Online

Browser Connection
[Disconnected] [Connect] [Disconnect]

Browser Tab
Chrome | ESB ERP
URL: https://esb.co.id/...
Title: ...
Last activity: ...

Automation Control
[Start Demo] [Stop]

Activity
15:10:01 INFO     Connecting...
15:10:02 SUCCESS  Chrome connected
15:10:03 SUCCESS  ESB tab detected
```

Tombol harus benar-benar memanggil API. Jangan membuat tombol dekoratif
atau menampilkan status sukses palsu.

## 10. Perilaku koneksi dan error handling

Tangani minimal kasus berikut:

-   Chrome belum berjalan.
-   Chrome berjalan tetapi CDP tidak aktif.
-   Endpoint CDP tidak bisa dijangkau.
-   Chrome terhubung tetapi tab ESB tidak ditemukan.
-   Tab ESB ditutup pengguna.
-   Navigasi halaman berlangsung.
-   Browser terputus saat task berjalan.
-   User menekan Connect berulang kali.
-   User menekan Start berulang kali.
-   User menekan Stop saat tidak ada task.

Jangan otomatis melakukan reconnect loop agresif. Berikan pesan dan
tombol Connect ulang.

Saat backend berhenti, lepaskan koneksi Playwright dengan aman. Jangan
menutup browser milik pengguna.

## 11. Keamanan dan batas akses

-   Bind Express ke `127.0.0.1`, bukan `0.0.0.0`.
-   Batasi CORS ke origin frontend lokal.
-   Terapkan validasi origin/host dan proteksi CSRF yang sesuai untuk
    endpoint kontrol lokal.
-   Jangan menerima endpoint CDP atau alamat browser dari input bebas.
-   Jangan membuka port debugging ke jaringan.
-   Jangan menyimpan kredensial, cookies, token, atau isi halaman
    sensitif.
-   Tambahkan `data/`, file database, log, dan profil browser ke
    `.gitignore` bila berada di project.
-   Jangan mengakses atau mengubah data ESB di luar izin pengguna.

## 12. Acceptance criteria

Tahap pertama dianggap selesai hanya jika semua kondisi berikut
berhasil:

1.  `npm install` dan perintah development dapat dijalankan sesuai
    README.
2.  Dashboard React terbuka di localhost.
3.  Backend menampilkan status sehat.
4.  Jika Chrome belum menggunakan CDP, dashboard menampilkan instruksi
    yang benar---bukan status connected palsu.
5.  Setelah Chrome dijalankan dengan remote debugging dan ESB dibuka,
    tombol Connect berhasil menghubungkan Playwright ke Chrome tersebut.
6.  Dashboard mendeteksi tab ESB yang benar dan menampilkan URL/title.
7.  Perubahan navigasi tab terlihat di dashboard.
8.  Tombol Start menjalankan demo inspeksi aman dan log tampil realtime.
9.  Tombol Stop menghentikan task aktif.
10. Disconnect melepaskan Playwright tanpa menutup Chrome.
11. Riwayat sesi dan log penting tersimpan di SQLite.
12. Tidak ada transaksi ESB yang dibuat atau diubah selama pengujian.

## 13. Tahapan pengerjaan untuk Antigravity

Kerjakan berurutan dan jangan melompat ke fitur transaksi:

**Milestone 1 --- Scaffold** - Buat struktur project. - Setup React +
Vite. - Setup Express. - Setup SQLite dan health endpoint. - Pastikan
frontend dapat memanggil backend.

**Milestone 2 --- CDP connection** - Implementasikan Playwright
`connectOverCDP`. - Gunakan endpoint tetap `http://127.0.0.1:9222`. -
Deteksi tab ESB. - Implementasikan connect/disconnect. - Uji dengan
Chrome yang benar-benar dijalankan menggunakan remote debugging.

**Milestone 3 --- Live monitoring** - Implementasikan SSE. - Pantau
URL/title dan lifecycle tab. - Simpan event penting ke SQLite. -
Tampilkan log realtime di React.

**Milestone 4 --- Start/Stop demo** - Implementasikan satu task demo
inspeksi aman. - Implementasikan cancellation. - Cegah concurrent
task. - Uji Start, Stop, dan browser disconnect.

**Milestone 5 --- Polish** - Rapikan tampilan sederhana. - Lengkapi
README dan troubleshooting. - Pastikan semua acceptance criteria lulus.

Setelah milestone 5 selesai, berhenti. Jangan mulai fitur invoice,
supplier matching, bulk injection, atau comparison sebelum pengguna
meninjau dan menyetujui fondasi koneksi browser.

## 14. Instruksi utama untuk Antigravity

Bangun aplikasi ini secara nyata di workspace, bukan hanya memberikan
contoh kode atau mockup. Implementasikan semua file, install dependency,
jalankan aplikasi, dan uji alur end-to-end jika Chrome CDP tersedia.

Jangan mengklaim berhasil tersambung ke Chrome hanya berdasarkan
keberhasilan membuka port atau membuat object Playwright. Status
`Connected` hanya boleh muncul setelah `connectOverCDP` berhasil. Status
`ESB tab detected` hanya boleh muncul setelah tab dengan hostname ESB
benar-benar ditemukan.

Jika Chrome yang saat ini terbuka tidak menyediakan CDP, jelaskan
keterbatasannya dan berikan instruksi untuk membuka ulang Chrome dengan
profil otomasi khusus. Jangan menutup atau mengganggu sesi Chrome utama
pengguna secara otomatis.

**Output akhir:** dashboard localhost sederhana yang benar-benar bisa
Connect, memantau, Start Demo, Stop, dan Disconnect dari Chrome ESB
melalui Playwright, dengan SQLite sebagai penyimpanan log/sesi.
