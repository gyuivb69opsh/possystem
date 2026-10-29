-- Spain VERI*FACTU: shop settings and an append-only, hash-chained record log. Additive; nothing changes for
-- shops that never switch it on.
ALTER TABLE "ShopSettings" ADD COLUMN "vfEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN "vfEnvironment" TEXT NOT NULL DEFAULT 'TEST';
ALTER TABLE "ShopSettings" ADD COLUMN "vfNif" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "vfSeries" TEXT NOT NULL DEFAULT 'T1';
ALTER TABLE "ShopSettings" ADD COLUMN "vfNextNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShopSettings" ADD COLUMN "vfNextRefundNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ShopSettings" ADD COLUMN "vfInstallation" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "vfCertEnc" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "vfCertPassEnc" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "vfCertSubject" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "vfCertExpires" DATETIME;

CREATE TABLE "verifactu_records" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "issuerNif" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "invoiceType" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "issueDate" TEXT NOT NULL,
  "taxTotalCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "generatedAt" TEXT NOT NULL,
  "previousHash" TEXT,
  "hash" TEXT NOT NULL,
  "xml" TEXT NOT NULL,
  "qrUrl" TEXT,
  "invoiceId" INTEGER,
  "returnId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "csv" TEXT,
  "errorCode" TEXT,
  "errorText" TEXT,
  "responseXml" TEXT,
  "submittedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "verifactu_records_issuerNif_environment_seq_key" ON "verifactu_records"("issuerNif", "environment", "seq");
CREATE UNIQUE INDEX "verifactu_records_issuerNif_environment_invoiceNumber_key" ON "verifactu_records"("issuerNif", "environment", "invoiceNumber");
CREATE INDEX "verifactu_records_invoiceId_idx" ON "verifactu_records"("invoiceId");
CREATE INDEX "verifactu_records_status_nextAttemptAt_idx" ON "verifactu_records"("status", "nextAttemptAt");

-- The log is append-only: a record must continue the issuer's chain exactly, cannot be deleted, and only the
-- submission outcome may change afterwards.
CREATE TRIGGER "verifactu_records_chain" BEFORE INSERT ON "verifactu_records"
WHEN (NEW."seq" = 1 AND NEW."previousHash" IS NOT NULL)
  OR (NEW."seq" > 1 AND (
        (SELECT "hash" FROM "verifactu_records" WHERE "issuerNif" = NEW."issuerNif" AND "environment" = NEW."environment" AND "seq" = NEW."seq" - 1) IS NULL
     OR (SELECT "hash" FROM "verifactu_records" WHERE "issuerNif" = NEW."issuerNif" AND "environment" = NEW."environment" AND "seq" = NEW."seq" - 1) IS NOT NEW."previousHash"))
BEGIN
  SELECT RAISE(ABORT, 'verifactu_records: the record does not continue the chain');
END;

CREATE TRIGGER "verifactu_records_no_delete" BEFORE DELETE ON "verifactu_records"
BEGIN
  SELECT RAISE(ABORT, 'verifactu_records is append-only: delete is not allowed');
END;

CREATE TRIGGER "verifactu_records_immutable" BEFORE UPDATE ON "verifactu_records"
WHEN NEW."id" IS NOT OLD."id" OR NEW."issuerNif" IS NOT OLD."issuerNif" OR NEW."environment" IS NOT OLD."environment"
  OR NEW."seq" IS NOT OLD."seq" OR NEW."type" IS NOT OLD."type" OR NEW."invoiceType" IS NOT OLD."invoiceType"
  OR NEW."invoiceNumber" IS NOT OLD."invoiceNumber" OR NEW."issueDate" IS NOT OLD."issueDate"
  OR NEW."taxTotalCents" IS NOT OLD."taxTotalCents" OR NEW."totalCents" IS NOT OLD."totalCents"
  OR NEW."generatedAt" IS NOT OLD."generatedAt" OR NEW."previousHash" IS NOT OLD."previousHash"
  OR NEW."hash" IS NOT OLD."hash" OR NEW."xml" IS NOT OLD."xml" OR NEW."qrUrl" IS NOT OLD."qrUrl"
  OR NEW."invoiceId" IS NOT OLD."invoiceId" OR NEW."returnId" IS NOT OLD."returnId"
  OR NEW."createdAt" IS NOT OLD."createdAt"
BEGIN
  SELECT RAISE(ABORT, 'verifactu_records is append-only: only the submission outcome may change');
END;
