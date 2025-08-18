/*
  Warnings:

  - You are about to drop the `TemplateWidget` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."TemplateWidget" DROP CONSTRAINT "TemplateWidget_createdById_fkey";

-- DropTable
DROP TABLE "public"."TemplateWidget";
