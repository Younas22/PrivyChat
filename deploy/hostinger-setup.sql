-- TalkRoom: one-time database setup for a NEW Hostinger database (import in phpMyAdmin).
-- Creates all tables and marks every Prisma migration as applied, so future
-- `npx prisma migrate deploy` runs continue from here.
-- (An existing database should be upgraded with `npx prisma migrate deploy` instead.)

-- Migration: 20261006083044_init
-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `anonymousId` VARCHAR(64) NOT NULL,
    `displayName` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_anonymousId_key`(`anonymousId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatRoom` (
    `id` VARCHAR(191) NOT NULL,
    `roomCode` VARCHAR(32) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `ChatRoom_roomCode_key`(`roomCode`),
    INDEX `ChatRoom_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RoomMember` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `removedAt` DATETIME(3) NULL,

    INDEX `RoomMember_roomId_idx`(`roomId`),
    INDEX `RoomMember_userId_idx`(`userId`),
    UNIQUE INDEX `RoomMember_roomId_userId_key`(`roomId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Message` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `type` ENUM('text', 'image', 'video', 'document') NOT NULL DEFAULT 'text',
    `replyToMessageId` VARCHAR(191) NULL,
    `fileName` VARCHAR(255) NULL,
    `fileUrl` VARCHAR(512) NULL,
    `fileMimeType` VARCHAR(127) NULL,
    `fileSize` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Message_roomId_createdAt_idx`(`roomId`, `createdAt`),
    INDEX `Message_senderId_idx`(`senderId`),
    INDEX `Message_createdAt_idx`(`createdAt`),
    INDEX `Message_replyToMessageId_idx`(`replyToMessageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatRoom` ADD CONSTRAINT `ChatRoom_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoomMember` ADD CONSTRAINT `RoomMember_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `ChatRoom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RoomMember` ADD CONSTRAINT `RoomMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `ChatRoom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Message` ADD CONSTRAINT `Message_replyToMessageId_fkey` FOREIGN KEY (`replyToMessageId`) REFERENCES `Message`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- Migration: 20261006182934_message_reactions
-- CreateTable
CREATE TABLE `MessageReaction` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MessageReaction_userId_idx`(`userId`),
    UNIQUE INDEX `MessageReaction_messageId_userId_key`(`messageId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MessageReaction` ADD CONSTRAINT `MessageReaction_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MessageReaction` ADD CONSTRAINT `MessageReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: 20261006200803_audio_messages
-- AlterTable
ALTER TABLE `Message` MODIFY `type` ENUM('text', 'image', 'video', 'document', 'audio') NOT NULL DEFAULT 'text';

-- Migration: 20261006203645_audio_waveform
-- AlterTable
ALTER TABLE `Message` ADD COLUMN `fileDuration` INTEGER NULL,
    ADD COLUMN `waveform` VARCHAR(64) NULL;


-- Prisma migration history
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
    `id` VARCHAR(36) NOT NULL,
    `checksum` VARCHAR(64) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `migration_name` VARCHAR(255) NOT NULL,
    `logs` TEXT NULL,
    `rolled_back_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `applied_steps_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES ('13c1cd3d-a391-4b86-ab9d-b4aabe0c9117', 'c0283a28a64265ea8f30ea850fd9a1026046ce23fb8050235c324b062223bc9e', NOW(3), '20261006083044_init', NULL, NULL, NOW(3), 1);

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES ('600a33e8-bfe9-44f1-8c2f-55c69f9e8605', '5a4c19e480ab573947fd9660492edf85aa917a443bd30335d172b6f33e9b8fb7', NOW(3), '20261006182934_message_reactions', NULL, NULL, NOW(3), 1);

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES ('6f435715-e690-45c5-899b-27c895c3e9e5', '6d66d9fd164ad8a9b79d4833cd9551480ccae6c90067ab89f95089bac295b21f', NOW(3), '20261006200803_audio_messages', NULL, NULL, NOW(3), 1);

INSERT INTO `_prisma_migrations` (`id`, `checksum`, `finished_at`, `migration_name`, `logs`, `rolled_back_at`, `started_at`, `applied_steps_count`)
VALUES ('7550d78f-daae-4ee0-aeb6-acf8cf8551a9', '9b926fe357523ca990395f6f7e1577f1ba22fe11261f51dd136658d050893a2f', NOW(3), '20261006203645_audio_waveform', NULL, NULL, NOW(3), 1);
