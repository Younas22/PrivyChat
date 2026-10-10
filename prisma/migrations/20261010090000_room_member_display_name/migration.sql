ALTER TABLE `RoomMember` ADD COLUMN `displayName` VARCHAR(40) NULL;

UPDATE `RoomMember` AS member
INNER JOIN `User` AS account ON account.`id` = member.`userId`
SET member.`displayName` = account.`displayName`;

ALTER TABLE `RoomMember` MODIFY COLUMN `displayName` VARCHAR(40) NOT NULL;