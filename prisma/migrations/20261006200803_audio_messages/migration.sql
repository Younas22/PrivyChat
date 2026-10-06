-- AlterTable
ALTER TABLE `Message` MODIFY `type` ENUM('text', 'image', 'video', 'document', 'audio') NOT NULL DEFAULT 'text';
