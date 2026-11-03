-- NOTARIS PRO — riwayat workflow per akta dalam urutan waktu.
-- Detail akta mengambil riwayat dengan WHERE deedId = ? ORDER BY createdAt. Tanpa indeks komposit,
-- SQLite memilih memindai indeks createdAt (500.000 baris pada dataset uji) agar tidak perlu mengurutkan,
-- sehingga akta tanpa riwayat butuh sekitar 1,9 detik. Indeks (deedId, createdAt) memenuhi filter dan
-- urutan sekaligus; indeks satu kolom deedId menjadi redundan karena sudah menjadi prefiksnya.

DROP INDEX IF EXISTS "WorkflowHistory_deedId_idx";
CREATE INDEX IF NOT EXISTS "WorkflowHistory_deedId_createdAt_idx"
    ON "WorkflowHistory" ("deedId", "createdAt");
