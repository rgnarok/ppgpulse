-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "client" TEXT,
    "candidate" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosureTarget" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "recruiterKey" TEXT NOT NULL DEFAULT '',
    "month" TEXT NOT NULL DEFAULT '',
    "target" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClosureTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Closure_month_idx" ON "Closure"("month");

-- CreateIndex
CREATE INDEX "Closure_userId_idx" ON "Closure"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClosureTarget_scope_recruiterKey_month_key" ON "ClosureTarget"("scope", "recruiterKey", "month");
