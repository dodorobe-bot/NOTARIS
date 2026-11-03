-- NOTARIS PRO — Modul Government Integration Gateway
-- Integrasi semi-otomatis AHU Online dan ATR/BPN.
-- Tidak ada scraping, bypass autentikasi, CAPTCHA, atau klaim API resmi.
-- Seluruh riwayat status, referensi, dan sinkronisasi bersifat append-only.

CREATE TABLE "government_services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "portalUrl" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEMI_OTOMATIS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "government_services_code_key" ON "government_services"("code");
CREATE INDEX "government_services_agency_idx" ON "government_services"("agency");
CREATE INDEX "government_services_isActive_idx" ON "government_services"("isActive");

CREATE TABLE "government_submissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "clientId" TEXT,
    "transactionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dataJson" TEXT,
    "internalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "officialStatus" TEXT,
    "officialSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "submittedAt" DATETIME,
    "lastStatusAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "government_submissions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "government_services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "government_submissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "government_submissions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "government_submissions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "government_submissions_number_key" ON "government_submissions"("number");
CREATE INDEX "government_submissions_agency_idx" ON "government_submissions"("agency");
CREATE INDEX "government_submissions_internalStatus_idx" ON "government_submissions"("internalStatus");
CREATE INDEX "government_submissions_serviceId_idx" ON "government_submissions"("serviceId");
CREATE INDEX "government_submissions_clientId_idx" ON "government_submissions"("clientId");
CREATE INDEX "government_submissions_createdAt_idx" ON "government_submissions"("createdAt");

CREATE TABLE "government_submission_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "government_submission_files_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "government_submissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "government_submission_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "government_submission_files_submissionId_idx" ON "government_submission_files"("submissionId");
CREATE INDEX "government_submission_files_kind_idx" ON "government_submission_files"("kind");

CREATE TABLE "government_status_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "officialStatus" TEXT,
    "note" TEXT,
    "changedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "government_status_history_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "government_submissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "government_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "government_status_history_submissionId_idx" ON "government_status_history"("submissionId");
CREATE INDEX "government_status_history_createdAt_idx" ON "government_status_history"("createdAt");

CREATE TABLE "government_references" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "issuedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "government_references_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "government_submissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "government_references_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "government_references_submissionId_idx" ON "government_references"("submissionId");

CREATE TABLE "government_sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT,
    "agency" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEMI_OTOMATIS',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "detailJson" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "government_sync_logs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "government_submissions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "government_sync_logs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "government_sync_logs_submissionId_idx" ON "government_sync_logs"("submissionId");
CREATE INDEX "government_sync_logs_agency_idx" ON "government_sync_logs"("agency");
CREATE INDEX "government_sync_logs_createdAt_idx" ON "government_sync_logs"("createdAt");

CREATE TABLE "government_api_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agency" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'SEMI_OTOMATIS',
    "apiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "apiVerifiedAt" DATETIME,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "government_api_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "government_api_config_agency_key" ON "government_api_config"("agency");

CREATE TABLE "government_api_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agency" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountHint" TEXT,
    "cipherText" TEXT NOT NULL CHECK ("cipherText" LIKE 'dpapi:%'),
    "algorithm" TEXT NOT NULL DEFAULT 'DPAPI_SAFE_STORAGE',
    "lastUsedAt" DATETIME,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "government_api_credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "government_api_credentials_agency_label_key" ON "government_api_credentials"("agency", "label");
CREATE INDEX "government_api_credentials_agency_idx" ON "government_api_credentials"("agency");

-- ---------- PENGAMANAN INTEGRITAS ----------

CREATE TRIGGER IF NOT EXISTS trg_government_submissions_no_delete
BEFORE DELETE ON "government_submissions"
BEGIN
  SELECT RAISE(ABORT, 'Pengajuan pemerintah tidak dapat dihapus; gunakan pembatalan dengan alasan');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_submissions_identity
BEFORE UPDATE ON "government_submissions"
WHEN NEW."number" IS NOT OLD."number"
  OR NEW."agency" IS NOT OLD."agency"
  OR NEW."serviceId" IS NOT OLD."serviceId"
  OR NEW."createdById" IS NOT OLD."createdById"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'Identitas pengajuan pemerintah tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_submissions_final
BEFORE UPDATE ON "government_submissions"
WHEN OLD."internalStatus" IN ('SELESAI', 'DITOLAK', 'DIBATALKAN')
BEGIN
  SELECT RAISE(ABORT, 'Pengajuan pemerintah yang sudah final tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_files_no_delete
BEFORE DELETE ON "government_submission_files"
BEGIN
  SELECT RAISE(ABORT, 'Berkas pengajuan tidak dapat dihapus permanen; gunakan penghapusan lunak');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_files_immutable
BEFORE UPDATE ON "government_submission_files"
WHEN NEW."submissionId" IS NOT OLD."submissionId"
  OR NEW."kind" IS NOT OLD."kind"
  OR NEW."fileName" IS NOT OLD."fileName"
  OR NEW."storagePath" IS NOT OLD."storagePath"
  OR NEW."mimeType" IS NOT OLD."mimeType"
  OR NEW."sizeBytes" IS NOT OLD."sizeBytes"
  OR NEW."checksum" IS NOT OLD."checksum"
  OR NEW."uploadedById" IS NOT OLD."uploadedById"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'Metadata berkas pengajuan tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_status_no_update
BEFORE UPDATE ON "government_status_history"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat status pemerintah bersifat append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_status_no_delete
BEFORE DELETE ON "government_status_history"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat status pemerintah tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_references_no_update
BEFORE UPDATE ON "government_references"
BEGIN
  SELECT RAISE(ABORT, 'Referensi pemerintah bersifat append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_references_no_delete
BEFORE DELETE ON "government_references"
BEGIN
  SELECT RAISE(ABORT, 'Referensi pemerintah tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_sync_no_update
BEFORE UPDATE ON "government_sync_logs"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat sinkronisasi bersifat append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_sync_no_delete
BEFORE DELETE ON "government_sync_logs"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat sinkronisasi tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_credentials_ciphertext_insert
BEFORE INSERT ON "government_api_credentials"
WHEN NEW."cipherText" NOT LIKE 'dpapi:%'
BEGIN
  SELECT RAISE(ABORT, 'Kredensial pemerintah wajib disimpan dalam bentuk terenkripsi DPAPI');
END;

CREATE TRIGGER IF NOT EXISTS trg_government_credentials_ciphertext_update
BEFORE UPDATE ON "government_api_credentials"
WHEN NEW."cipherText" NOT LIKE 'dpapi:%'
BEGIN
  SELECT RAISE(ABORT, 'Kredensial pemerintah wajib disimpan dalam bentuk terenkripsi DPAPI');
END;
