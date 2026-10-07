-- AlterTable
ALTER TABLE `User` ADD COLUMN `accessCode` VARCHAR(24) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_accessCode_key` ON `User`(`accessCode`);
