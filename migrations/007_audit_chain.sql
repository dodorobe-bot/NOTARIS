-- NOTARIS PRO — validasi rantai hash audit pada tingkat database.
-- `audit()` di aplikasi membaca kepala rantai lalu menulis baris baru. Dua penulisan bersamaan dapat
-- membaca kepala yang sama sehingga rantai bercabang dan verifikasi integrity gagal tanpa ada yang
-- menyadarinya saat itu. Trigger ini menolak setiap baris yang `prevHash`-nya bukan hash baris terakhir,
-- termasuk baris pertama yang membawa `prevHash` tidak NULL saat tabel sudah berisi data.
-- `IS NOT` dipakai agar perbandingan NULL (tabel kosong) tetap benar di SQLite.

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_chain
BEFORE INSERT ON "AuditLog"
WHEN NEW."prevHash" IS NOT (SELECT "hash" FROM "AuditLog" ORDER BY "id" DESC LIMIT 1)
BEGIN
    SELECT RAISE(ABORT, 'Rantai audit tidak berkesinambungan');
END;
