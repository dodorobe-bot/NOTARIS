-- NOTARIS PRO — Pengamanan integritas data hukum.
-- Trigger ini membuat catatan akta, repertorium, protokol, revisi, workflow,
-- dan audit log tidak dapat dihapus atau diubah secara diam-diam.

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
BEFORE UPDATE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'Audit log bersifat append-only dan tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
BEFORE DELETE ON "AuditLog"
BEGIN
  SELECT RAISE(ABORT, 'Audit log bersifat append-only dan tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_repertorium_no_update
BEFORE UPDATE ON "DeedRepertorium"
BEGIN
  SELECT RAISE(ABORT, 'Catatan repertorium tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_repertorium_no_delete
BEFORE DELETE ON "DeedRepertorium"
BEGIN
  SELECT RAISE(ABORT, 'Catatan repertorium tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_protocol_no_update
BEFORE UPDATE ON "ProtocolRegister"
BEGIN
  SELECT RAISE(ABORT, 'Catatan protokol notaris tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_protocol_no_delete
BEFORE DELETE ON "ProtocolRegister"
BEGIN
  SELECT RAISE(ABORT, 'Catatan protokol notaris tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_deed_revisions_no_update
BEFORE UPDATE ON "DeedRevision"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat revisi akta tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_deed_revisions_no_delete
BEFORE DELETE ON "DeedRevision"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat revisi akta tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_history_no_update
BEFORE UPDATE ON "WorkflowHistory"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat workflow tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_workflow_history_no_delete
BEFORE DELETE ON "WorkflowHistory"
BEGIN
  SELECT RAISE(ABORT, 'Riwayat workflow tidak dapat dihapus');
END;

CREATE TRIGGER IF NOT EXISTS trg_deeds_no_delete
BEFORE DELETE ON "Deed"
BEGIN
  SELECT RAISE(ABORT, 'Akta tidak dapat dihapus; gunakan pembatalan dengan alasan');
END;

CREATE TRIGGER IF NOT EXISTS trg_deeds_locked_content
BEFORE UPDATE ON "Deed"
WHEN OLD."status" IN ('SIGNED', 'REGISTERED', 'ARCHIVED')
  AND (
    NEW."deedNumber" IS NOT OLD."deedNumber" OR
    NEW."deedDate" IS NOT OLD."deedDate" OR
    NEW."deedTypeId" IS NOT OLD."deedTypeId" OR
    NEW."clientId" IS NOT OLD."clientId" OR
    NEW."penghadap" IS NOT OLD."penghadap" OR
    NEW."komparisi" IS NOT OLD."komparisi" OR
    NEW."premis" IS NOT OLD."premis" OR
    NEW."isi" IS NOT OLD."isi" OR
    NEW."penutup" IS NOT OLD."penutup" OR
    NEW."witnessesJson" IS NOT OLD."witnessesJson"
  )
BEGIN
  SELECT RAISE(ABORT, 'Isi akta terkunci setelah ditandatangani; perubahan harus melalui prosedur resmi');
END;

-- Nomor akta yang sudah tercatat di repertorium tidak boleh didaur ulang.
CREATE TRIGGER IF NOT EXISTS trg_repertorium_requires_deed
BEFORE INSERT ON "DeedRepertorium"
WHEN NOT EXISTS (SELECT 1 FROM "Deed" WHERE "id" = NEW."deedId")
BEGIN
  SELECT RAISE(ABORT, 'Repertorium harus terhubung ke akta yang sah');
END;
