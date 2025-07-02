-- CreateTable
CREATE TABLE "TemplateWidget" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB,
    "createdAT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAT" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],

    CONSTRAINT "TemplateWidget_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TemplateWidget" ADD CONSTRAINT "TemplateWidget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
