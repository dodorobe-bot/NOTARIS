-- NOTARIS PRO — pencarian teks FTS5 untuk kolom yang tidak sensitif.
-- NIK, NPWP, isi akta, dan catatan pribadi tidak dimasukkan ke indeks FTS.
-- Tabel FTS memakai external content sehingga tidak menggandakan teks lengkap; trigger
-- menjaga indeks tetap sinkron pada insert/update/delete. Pencarian exact NIK/NPWP
-- memakai indeks B-tree biasa di bawah, bukan indeks teks.

CREATE INDEX IF NOT EXISTS "Client_nik_idx" ON "Client" ("nik");
CREATE INDEX IF NOT EXISTS "Client_npwp_idx" ON "Client" ("npwp");

CREATE VIRTUAL TABLE IF NOT EXISTS "client_search" USING fts5(
    "fullName", "code",
    content='Client', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS "transaction_search" USING fts5(
    "code", "title",
    content='Transaction', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS "deed_search" USING fts5(
    "deedNumber", "title",
    content='Deed', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS "invoice_search" USING fts5(
    "number",
    content='Invoice', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS "document_search" USING fts5(
    "title", "fileName",
    content='Document', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE IF NOT EXISTS "government_search" USING fts5(
    "number", "title", "externalRef",
    content='government_submissions', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
);

INSERT INTO "client_search" ("client_search") VALUES ('rebuild');
INSERT INTO "transaction_search" ("transaction_search") VALUES ('rebuild');
INSERT INTO "deed_search" ("deed_search") VALUES ('rebuild');
INSERT INTO "invoice_search" ("invoice_search") VALUES ('rebuild');
INSERT INTO "document_search" ("document_search") VALUES ('rebuild');
INSERT INTO "government_search" ("government_search") VALUES ('rebuild');

CREATE TRIGGER IF NOT EXISTS "client_search_ai" AFTER INSERT ON "Client" BEGIN
    INSERT INTO "client_search" (rowid, "fullName", "code") VALUES (new.rowid, new."fullName", new."code");
END;
CREATE TRIGGER IF NOT EXISTS "client_search_ad" AFTER DELETE ON "Client" BEGIN
    INSERT INTO "client_search" ("client_search", rowid, "fullName", "code") VALUES ('delete', old.rowid, old."fullName", old."code");
END;
CREATE TRIGGER IF NOT EXISTS "client_search_au" AFTER UPDATE OF "fullName", "code" ON "Client" BEGIN
    INSERT INTO "client_search" ("client_search", rowid, "fullName", "code") VALUES ('delete', old.rowid, old."fullName", old."code");
    INSERT INTO "client_search" (rowid, "fullName", "code") VALUES (new.rowid, new."fullName", new."code");
END;

CREATE TRIGGER IF NOT EXISTS "transaction_search_ai" AFTER INSERT ON "Transaction" BEGIN
    INSERT INTO "transaction_search" (rowid, "code", "title") VALUES (new.rowid, new."code", new."title");
END;
CREATE TRIGGER IF NOT EXISTS "transaction_search_ad" AFTER DELETE ON "Transaction" BEGIN
    INSERT INTO "transaction_search" ("transaction_search", rowid, "code", "title") VALUES ('delete', old.rowid, old."code", old."title");
END;
CREATE TRIGGER IF NOT EXISTS "transaction_search_au" AFTER UPDATE OF "code", "title" ON "Transaction" BEGIN
    INSERT INTO "transaction_search" ("transaction_search", rowid, "code", "title") VALUES ('delete', old.rowid, old."code", old."title");
    INSERT INTO "transaction_search" (rowid, "code", "title") VALUES (new.rowid, new."code", new."title");
END;

CREATE TRIGGER IF NOT EXISTS "deed_search_ai" AFTER INSERT ON "Deed" BEGIN
    INSERT INTO "deed_search" (rowid, "deedNumber", "title") VALUES (new.rowid, new."deedNumber", new."title");
END;
CREATE TRIGGER IF NOT EXISTS "deed_search_ad" AFTER DELETE ON "Deed" BEGIN
    INSERT INTO "deed_search" ("deed_search", rowid, "deedNumber", "title") VALUES ('delete', old.rowid, old."deedNumber", old."title");
END;
CREATE TRIGGER IF NOT EXISTS "deed_search_au" AFTER UPDATE OF "deedNumber", "title" ON "Deed" BEGIN
    INSERT INTO "deed_search" ("deed_search", rowid, "deedNumber", "title") VALUES ('delete', old.rowid, old."deedNumber", old."title");
    INSERT INTO "deed_search" (rowid, "deedNumber", "title") VALUES (new.rowid, new."deedNumber", new."title");
END;

CREATE TRIGGER IF NOT EXISTS "invoice_search_ai" AFTER INSERT ON "Invoice" BEGIN
    INSERT INTO "invoice_search" (rowid, "number") VALUES (new.rowid, new."number");
END;
CREATE TRIGGER IF NOT EXISTS "invoice_search_ad" AFTER DELETE ON "Invoice" BEGIN
    INSERT INTO "invoice_search" ("invoice_search", rowid, "number") VALUES ('delete', old.rowid, old."number");
END;
CREATE TRIGGER IF NOT EXISTS "invoice_search_au" AFTER UPDATE OF "number" ON "Invoice" BEGIN
    INSERT INTO "invoice_search" ("invoice_search", rowid, "number") VALUES ('delete', old.rowid, old."number");
    INSERT INTO "invoice_search" (rowid, "number") VALUES (new.rowid, new."number");
END;

CREATE TRIGGER IF NOT EXISTS "document_search_ai" AFTER INSERT ON "Document" BEGIN
    INSERT INTO "document_search" (rowid, "title", "fileName") VALUES (new.rowid, new."title", new."fileName");
END;
CREATE TRIGGER IF NOT EXISTS "document_search_ad" AFTER DELETE ON "Document" BEGIN
    INSERT INTO "document_search" ("document_search", rowid, "title", "fileName") VALUES ('delete', old.rowid, old."title", old."fileName");
END;
CREATE TRIGGER IF NOT EXISTS "document_search_au" AFTER UPDATE OF "title", "fileName" ON "Document" BEGIN
    INSERT INTO "document_search" ("document_search", rowid, "title", "fileName") VALUES ('delete', old.rowid, old."title", old."fileName");
    INSERT INTO "document_search" (rowid, "title", "fileName") VALUES (new.rowid, new."title", new."fileName");
END;

CREATE TRIGGER IF NOT EXISTS "government_search_ai" AFTER INSERT ON "government_submissions" BEGIN
    INSERT INTO "government_search" (rowid, "number", "title", "externalRef") VALUES (new.rowid, new."number", new."title", new."externalRef");
END;
CREATE TRIGGER IF NOT EXISTS "government_search_ad" AFTER DELETE ON "government_submissions" BEGIN
    INSERT INTO "government_search" ("government_search", rowid, "number", "title", "externalRef") VALUES ('delete', old.rowid, old."number", old."title", old."externalRef");
END;
CREATE TRIGGER IF NOT EXISTS "government_search_au" AFTER UPDATE OF "number", "title", "externalRef" ON "government_submissions" BEGIN
    INSERT INTO "government_search" ("government_search", rowid, "number", "title", "externalRef") VALUES ('delete', old.rowid, old."number", old."title", old."externalRef");
    INSERT INTO "government_search" (rowid, "number", "title", "externalRef") VALUES (new.rowid, new."number", new."title", new."externalRef");
END;
