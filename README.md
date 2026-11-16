# PolyWar Server di Cloudflare (gratis, tanpa kartu)

## Pasang (lewat HP/laptop, tanpa coding)
1. Buat repository GitHub baru, mis. `polywar-cf`, lalu unggah SEMUA file ini
   (`wrangler.jsonc`, `package.json`, `README.md`, dan folder `src` berisi `index.js`).
   Tips HP: di GitHub pilih "Add file > Create new file", ketik nama `src/index.js`, tempel isi file, Commit.
2. Daftar di https://dash.cloudflare.com (cukup email, tanpa kartu).
3. Menu **Workers & Pages** -> **Create** -> **Import a repository** (Connect to Git) -> hubungkan GitHub -> pilih repo tadi.
4. Biarkan pengaturan bawaan (Deploy command: `npx wrangler deploy`) lalu **Save and Deploy**.
5. Setelah selesai kamu dapat alamat `https://polywar-server.NAMAKAMU.workers.dev`.
   Buka di browser: harus muncul **PolyWar server OK**.
6. Kirim alamat itu ke Claude. Untuk game dipakai bentuk `wss://polywar-server.NAMAKAMU.workers.dev`.

## Kapasitas
12 room x 5 pemain = 60 pemain sekaligus. Cek `/status` untuk melihat jumlah pemain online.
Paket gratis Cloudflare punya batas pemakaian harian untuk Durable Objects; kalau terlampaui,
server berhenti sampai batas harian di-reset.
