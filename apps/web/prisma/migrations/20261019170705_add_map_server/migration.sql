-- CreateTable
CREATE TABLE "MapServer" (
    "id" TEXT NOT NULL,
    "serverKey" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "catalog" JSONB,
    "catalogFetchedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "MapServer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapServer_userId_position_idx" ON "MapServer"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MapServer_userId_serverKey_key" ON "MapServer"("userId", "serverKey");

-- AddForeignKey
ALTER TABLE "MapServer" ADD CONSTRAINT "MapServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
