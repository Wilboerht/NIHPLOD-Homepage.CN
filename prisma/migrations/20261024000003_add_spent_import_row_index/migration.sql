-- 批次详情需要还原 Excel 行号；历史行保持 NULL
ALTER TABLE "SpentImportRow" ADD COLUMN "rowIndex" INTEGER;
