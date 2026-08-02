# PRD — Kasira

**Status:** Draft MVP v0.1  
**Tanggal:** 2 Agustus 2026  
**Platform:** Web responsif  
**Target rilis:** Satu outlet restoran/kafe ramai

## 1. Ringkasan

Kasira adalah POS restoran realtime yang menghubungkan pelanggan di meja, kasir, dapur/bar, dan manajer/pemilik. Pelanggan memindai QR permanen di meja untuk melihat menu, memilih modifier, mengirim pesanan, membayar melalui QRIS, atau memilih tunai lalu membayar di kasir. Kasir menjadi checkpoint sebelum pesanan diteruskan ke dapur/bar. Pelanggan dapat melihat status pesanan dari halaman web dan menerima notifikasi browser; makanan tetap diantar oleh pelayan ke meja.

## 2. Masalah

Outlet ramai menghadapi antrean kasir, pesanan salah meja atau salah catat, jeda informasi antara kasir dan dapur, serta ketidakjelasan status pesanan bagi pelanggan. Sistem terpisah membuat pembayaran, stok, produksi, dan laporan sulit direkonsiliasi.

## 3. Sasaran dan metrik keberhasilan

### Sasaran MVP

- Mempercepat alur dari pelanggan mengirim pesanan sampai order diterima dapur/bar.
- Mengurangi kesalahan meja, item, modifier, dan status pembayaran.
- Meningkatkan jumlah transaksi yang dapat dilayani pada jam ramai.
- Menyediakan satu sumber kebenaran untuk order, pembayaran, produksi, stok, dan laporan.

### Metrik yang perlu diukur setelah baseline tersedia

- Median waktu dari `order submitted` ke `cashier accepted`.
- Median waktu dari `cashier accepted` ke `sent to kitchen`.
- Persentase order yang memerlukan koreksi manual.
- Persentase pembayaran yang berhasil direkonsiliasi otomatis.
- Jumlah transaksi per 30 menit pada peak hour.
- Persentase item yang dibatalkan karena stok tidak tersedia.
- Uptime dan keterlambatan event realtime.

Target numerik ditetapkan setelah pengukuran baseline selama periode pilot.

## 4. Non-goals MVP

- Multi-outlet dan konsolidasi antar cabang.
- Integrasi inventori eksternal.
- Pengelolaan bahan baku berbasis resep yang kompleks.
- Delivery marketplace atau aggregator.
- Loyalty, membership, voucher kompleks, dan CRM.
- WhatsApp/SMS notification.
- Aplikasi native yang harus di-install pelanggan.
- Split bill dengan identitas akun pelanggan permanen.

## 5. Aktor dan hak akses

| Aktor | Kebutuhan utama | Hak utama |
|---|---|---|
| Pelanggan meja | Pesan, bayar, pantau status | Membuat order pada sesi meja, memilih pembayaran, melihat order mereka |
| Kasir | Validasi dan kendali transaksi | Menerima/menolak order, memverifikasi tunai, melihat meja, membatalkan sesuai izin |
| Dapur/bar | Menyiapkan order | Melihat antrean station, menerima order, memperbarui status produksi |
| Manajer/pemilik | Kontrol dan analisis outlet | Kelola menu, harga, stok, pengguna, shift, laporan, audit |
| Pelayan | Mengantar pesanan | Melihat item siap diantar dan menandai `Diantar` bila diperlukan |

Login staf menggunakan akun individual. PIN digunakan untuk aksi cepat/pergantian operator di perangkat outlet. Semua aksi sensitif menyimpan aktor dan timestamp dalam audit log.

## 6. Alur utama pelanggan

1. Pelanggan memindai QR permanen di meja.
2. Sistem membuka menu outlet dan membuat atau menggabungkan ke sesi aktif meja.
3. Pelanggan memilih kategori, item, modifier, catatan, dan kuantitas.
4. Pelanggan meninjau keranjang dan memilih satu tagihan atau split bill.
5. Pelanggan memilih QRIS atau tunai di kasir.
6. Untuk QRIS, sistem membuat payment intent dan menunggu konfirmasi webhook provider.
7. Untuk tunai, order berstatus menunggu pembayaran dan instruksi pembayaran ditampilkan.
8. Setelah pembayaran valid, order masuk ke antrean kasir.
9. Kasir memeriksa ketersediaan, meja, item, dan catatan; kasir menerima atau menolak order.
10. Order yang diterima diteruskan ke station dapur/bar terkait.
11. Pelanggan melihat status realtime di halaman web. Browser notification bersifat opsional dan meminta izin secara eksplisit.
12. Setelah siap, pelayan mengantar makanan ke meja. Order ditutup setelah seluruh item selesai dan transaksi selesai.

## 7. State machine order

Urutan normal:

`Menunggu pembayaran` → `Menunggu konfirmasi kasir` → `Diterima` → `Sedang disiapkan` → `Siap diantar` → `Diantar` → `Selesai`

State alternatif:

- `Ditolak`: kasir menolak sebelum order diproduksi, wajib memiliki alasan.
- `Dibatalkan`: pembatalan oleh aktor berwenang, wajib mencatat alasan dan dampak refund.
- `Gagal pembayaran`: payment intent gagal, kedaluwarsa, atau dibatalkan.

Setiap perubahan state harus idempotent, memiliki timestamp server, aktor/sumber event, dan dapat direkonstruksi dari audit log.

## 8. Cakupan fitur MVP

### 8.1 Portal pelanggan QR

- QR permanen unik per meja.
- Menu kategori, pencarian, detail item, foto opsional, harga, modifier, ketersediaan.
- Keranjang dengan catatan per item.
- Validasi item habis sebelum submit dan sebelum kasir menerima.
- Satu tagihan per meja.
- Split bill berbasis item/subtotal dalam sesi yang sama.
- Checkout QRIS atau tunai di kasir.
- Ringkasan biaya, pajak/service charge bila dikonfigurasi.
- Halaman status order realtime.
- Browser notification untuk event penting bila diizinkan pengguna.
- Pesan error yang jelas untuk jaringan putus, pembayaran gagal, sesi kedaluwarsa, dan item habis.

### 8.2 Dashboard kasir realtime

- Daftar order masuk dengan prioritas dan umur order.
- Filter berdasarkan meja, metode pembayaran, status, dan waktu.
- Panel detail order: item, modifier, catatan, total, status pembayaran, dan riwayat.
- Terima/tolak order dengan alasan penolakan.
- Verifikasi pembayaran QRIS otomatis dari webhook.
- Tandai pembayaran tunai setelah uang diterima.
- Pengelolaan sesi meja: buka, gabung, pindah, tutup, dan lihat tagihan.
- Pembatalan/refund sesuai role dan policy.
- Indikator koneksi realtime dan fallback refresh manual.
- Peringatan order tertunda, payment mismatch, dan item stok kritis.

### 8.3 KDS dapur/bar

- Antrean order yang sudah diterima kasir.
- Routing item ke station dapur/bar.
- Tampilan padat dan mudah dipindai dari layar station.
- Timer umur order dan indikator prioritas.
- Aksi `Mulai siapkan`, `Siap diantar`, dan `Kendala`.
- Filter station, kategori, dan status.
- Mode offline terbatas dengan sinkronisasi aman setelah koneksi pulih.

### 8.4 Menu dan inventori internal

- CRUD kategori, item, modifier, harga, pajak/service charge, dan station.
- Toggle tersedia/habis secara manual.
- Stok internal per item/menu untuk MVP.
- Pengurangan stok ketika order masuk state yang dikonfigurasi sebagai committed.
- Pengembalian stok saat pembatalan/refund sesuai aturan.
- Penyesuaian stok manual dengan alasan dan audit log.
- Peringatan stok rendah.
- Riwayat perubahan harga, ketersediaan, dan stok.

Catatan: inventori MVP menggunakan unit stok sederhana per menu/item. Model bahan baku + resep dapat menjadi fase berikutnya.

### 8.5 Shift, laporan, dan audit

- Buka/tutup shift kasir.
- Ringkasan penjualan per shift dan metode pembayaran.
- Laporan order, omzet, item terlaris, pembatalan, refund, dan performa waktu layanan.
- Rekonsiliasi pembayaran QRIS dan tunai.
- Export CSV untuk laporan dasar.
- Audit log untuk perubahan status, harga, stok, role, pembayaran, dan refund.

## 9. Realtime dan integritas data

- Event order, payment, inventory, dan table session dikirim melalui kanal realtime yang terautentikasi.
- Server menjadi sumber waktu dan sumber kebenaran status.
- Client boleh optimistik hanya untuk interaksi non-kritis; pembayaran dan transisi order harus menunggu konfirmasi server.
- Event memiliki `event_id` unik dan dapat diproses ulang tanpa duplikasi.
- Reconnect memakai exponential backoff dan melakukan resync berdasarkan versi/snapshot terakhir.
- Jika realtime putus, UI menunjukkan status stale dan menyediakan refresh manual; sistem tidak boleh mengklaim status terbaru tanpa konfirmasi.
- Webhook pembayaran diverifikasi menggunakan signature provider dan diproses idempotently.

## 10. Non-functional requirements

### Performa

- Halaman menu pelanggan dapat digunakan pada jaringan seluler yang tidak stabil.
- Interaksi utama kasir dan KDS terasa responsif pada peak hour.
- Update realtime normal terlihat dalam target p95 yang ditetapkan saat technical design.

### Keamanan

- Role-based access control dan session timeout.
- PIN tidak disimpan plaintext; rate limit dan lockout untuk percobaan gagal.
- Validasi bahwa QR/session hanya dapat mengakses meja dan outlet yang sesuai.
- Semua pembayaran dan webhook diverifikasi server-side.
- Data pribadi pelanggan diminimalkan; pelanggan tidak wajib membuat akun untuk memesan.
- Audit log tidak dapat diubah oleh role operasional biasa.

### Aksesibilitas

- Target WCAG formal.
- Kontras teks/status memadai dan status tidak hanya memakai warna.
- Navigasi keyboard dan focus state pada dashboard staf.
- Target sentuh besar pada tablet.
- Label semantik, nama kontrol jelas, dan dukungan screen reader pada alur utama.
- Dukungan `prefers-reduced-motion`.

### Reliabilitas operasional

- Graceful handling untuk koneksi terputus, payment timeout, duplicate submit, dan browser refresh.
- Tidak ada order yang hilang ketika client reconnect.
- Backup dan observability untuk error, event lag, webhook, dan rekonsiliasi.

## 11. Acceptance criteria MVP

1. Pelanggan dapat scan QR meja, memilih menu/modifier, dan mengirim order tanpa akun.
2. Order tidak dapat diproses dapur sebelum pembayaran valid dan konfirmasi kasir.
3. Pembayaran QRIS yang menerima webhook valid mengubah status secara idempotent dan terlihat di kasir.
4. Pembayaran tunai tidak dapat ditandai lunas tanpa aktor kasir yang terautentikasi.
5. Kasir dapat menerima/menolak order dan alasan penolakan terlihat oleh pelanggan.
6. Order yang diterima muncul di station KDS yang benar tanpa input ulang.
7. Perubahan status KDS terlihat di halaman pelanggan secara realtime setelah reconnect/resync.
8. Split bill tidak mengubah total, tidak menggandakan item, dan dapat diaudit.
9. Item yang habis tidak dapat dipesan; perubahan ketersediaan terlihat di portal pelanggan.
10. Pembatalan dan refund mengikuti permission, mencatat alasan, dan mengoreksi inventori sesuai aturan.
11. Manajer dapat melihat ringkasan shift, penjualan, metode pembayaran, item terlaris, dan penyesuaian stok.
12. Alur utama tetap dapat dipakai keyboard, dengan kontras dan target sentuh sesuai standar aksesibilitas.

## 12. Risiko dan pertanyaan terbuka

- Provider payment gateway QRIS dan detail webhook belum dipilih.
- Aturan pajak, service charge, pembulatan, dan biaya split bill perlu ditentukan per outlet.
- Kebijakan refund setelah makanan mulai diproduksi perlu disepakati.
- Perangkat printer dan kebutuhan receipt belum dipastikan.
- Model station untuk menu yang sama-sama diproses dapur/bar perlu dikonfigurasi.
- Batas offline KDS dan strategi operasi saat internet putus perlu diuji dalam pilot.
- Target numerik metrik keberhasilan perlu ditetapkan setelah baseline operasional dikumpulkan.
