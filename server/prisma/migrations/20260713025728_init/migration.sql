-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('org', 'team', 'own');

-- CreateEnum
CREATE TYPE "HdisType" AS ENUM ('RADC', 'RADF', 'Internal');

-- CreateEnum
CREATE TYPE "InterviewSession" AS ENUM ('mid', 'end');

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "capability" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "managerId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "capability" TEXT NOT NULL,

    CONSTRAINT "UserOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pod" TEXT NOT NULL,
    "eventsHosted" INTEGER NOT NULL DEFAULT 0,
    "eventsParticipated" INTEGER NOT NULL DEFAULT 0,
    "insights" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jdId" TEXT,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "reqDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "profiles" INTEGER NOT NULL DEFAULT 0,
    "shortlist" INTEGER NOT NULL DEFAULT 0,
    "l1" INTEGER NOT NULL DEFAULT 0,
    "l2" INTEGER NOT NULL DEFAULT 0,
    "l3" INTEGER NOT NULL DEFAULT 0,
    "onboard" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hdis" (
    "jdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "type" "HdisType" NOT NULL,
    "openings" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NA',
    "confidence" TEXT NOT NULL DEFAULT 'Medium',
    "reqDate" TEXT NOT NULL,
    "jdLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hdis_pkey" PRIMARY KEY ("jdId")
);

-- CreateTable
CREATE TABLE "HdisOwner" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "consultantOrName" TEXT NOT NULL,

    CONSTRAINT "HdisOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HdisPipeline" (
    "jdId" TEXT NOT NULL,
    "r0" INTEGER NOT NULL DEFAULT 0,
    "r1" INTEGER NOT NULL DEFAULT 0,
    "r2" INTEGER NOT NULL DEFAULT 0,
    "r3" INTEGER NOT NULL DEFAULT 0,
    "r4" INTEGER NOT NULL DEFAULT 0,
    "r5" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HdisPipeline_pkey" PRIMARY KEY ("jdId")
);

-- CreateTable
CREATE TABLE "HdisAttachment" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HdisAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HdisActivity" (
    "id" TEXT NOT NULL,
    "jdId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HdisActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "session" "InterviewSession" NOT NULL,
    "time" TEXT,
    "candidate" TEXT NOT NULL,
    "requirementRef" TEXT,
    "ppgConsultantId" TEXT,
    "stage" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_section_capability_key" ON "RolePermission"("roleId", "section", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "UserOverride_userId_idx" ON "UserOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOverride_userId_section_capability_key" ON "UserOverride"("userId", "section", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_code_key" ON "Requirement"("code");

-- CreateIndex
CREATE INDEX "Requirement_ownerId_reqDate_idx" ON "Requirement"("ownerId", "reqDate");

-- CreateIndex
CREATE INDEX "Requirement_reqDate_idx" ON "Requirement"("reqDate");

-- CreateIndex
CREATE INDEX "Requirement_jdId_idx" ON "Requirement"("jdId");

-- CreateIndex
CREATE INDEX "Hdis_reqDate_idx" ON "Hdis"("reqDate");

-- CreateIndex
CREATE INDEX "Hdis_status_idx" ON "Hdis"("status");

-- CreateIndex
CREATE INDEX "HdisOwner_jdId_idx" ON "HdisOwner"("jdId");

-- CreateIndex
CREATE INDEX "HdisAttachment_jdId_idx" ON "HdisAttachment"("jdId");

-- CreateIndex
CREATE INDEX "HdisActivity_jdId_at_idx" ON "HdisActivity"("jdId", "at");

-- CreateIndex
CREATE INDEX "Interview_date_idx" ON "Interview"("date");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOverride" ADD CONSTRAINT "UserOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "Hdis"("jdId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HdisOwner" ADD CONSTRAINT "HdisOwner_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "Hdis"("jdId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HdisPipeline" ADD CONSTRAINT "HdisPipeline_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "Hdis"("jdId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HdisAttachment" ADD CONSTRAINT "HdisAttachment_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "Hdis"("jdId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HdisActivity" ADD CONSTRAINT "HdisActivity_jdId_fkey" FOREIGN KEY ("jdId") REFERENCES "Hdis"("jdId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HdisActivity" ADD CONSTRAINT "HdisActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
