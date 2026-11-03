-- NOTARIS PRO — indeks komposit untuk daftar dan agregat dashboard.
-- Diuji pada dataset sintetis 100.000 klien/akta/transaksi, 500.000 audit, 1.000.000 dokumen.
-- SQLite dapat memakai indeks secara terbalik untuk ORDER BY ... DESC, jadi kolom urutan
-- cukup dideklarasikan menaik. Tidak ada indeks pada kolom sensitif dan tidak ada VACUUM.

CREATE INDEX IF NOT EXISTS "Client_deletedAt_createdAt_idx"
    ON "Client" ("deletedAt", "createdAt");

CREATE INDEX IF NOT EXISTS "Deed_status_signedAt_idx"
    ON "Deed" ("status", "signedAt");

CREATE INDEX IF NOT EXISTS "Deed_createdAt_idx"
    ON "Deed" ("createdAt");

CREATE INDEX IF NOT EXISTS "Transaction_deletedAt_status_createdAt_idx"
    ON "Transaction" ("deletedAt", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditLog_action_idx"
    ON "AuditLog" ("action");

CREATE INDEX IF NOT EXISTS "Document_deletedAt_createdAt_idx"
    ON "Document" ("deletedAt", "createdAt");
