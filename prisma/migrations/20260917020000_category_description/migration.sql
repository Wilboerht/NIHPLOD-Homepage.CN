-- 分类描述：管理端表单已提供该字段，但此前无对应列导致提交被静默丢弃
ALTER TABLE "Category" ADD COLUMN "description" TEXT;
