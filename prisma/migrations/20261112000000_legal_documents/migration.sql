-- CreateTable
CREATE TABLE "LegalDocument" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "draftContent" JSONB,
    "draftRevision" INTEGER NOT NULL DEFAULT 0,
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedById" TEXT,
    "draftUpdatedByEmail" TEXT,
    "draftUpdatedByName" TEXT,
    "publishedContent" JSONB,
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "publishedByEmail" TEXT,
    "publishedByName" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sectionCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocument_slug_key" ON "LegalDocument"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LegalDocumentVersion_documentId_version_key" ON "LegalDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "LegalDocumentVersion_documentId_createdAt_idx" ON "LegalDocumentVersion"("documentId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "LegalDocumentVersion" ADD CONSTRAINT "LegalDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LegalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
