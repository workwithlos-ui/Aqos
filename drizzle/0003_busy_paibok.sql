CREATE TABLE `comments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`authorOpenId` varchar(64) NOT NULL,
	`body` text NOT NULL,
	`resolvedAt` timestamp,
	`resolvedByOpenId` varchar(64),
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`recipientOpenId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`commentId` bigint NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`type` varchar(64) NOT NULL DEFAULT 'mention',
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `comments_deal_idx` ON `comments` (`dealId`);--> statement-breakpoint
CREATE INDEX `comments_org_idx` ON `comments` (`orgId`);--> statement-breakpoint
CREATE INDEX `comments_author_idx` ON `comments` (`authorOpenId`);--> statement-breakpoint
CREATE INDEX `notifications_recipient_idx` ON `notifications` (`recipientOpenId`);--> statement-breakpoint
CREATE INDEX `notifications_deal_idx` ON `notifications` (`dealId`);--> statement-breakpoint
CREATE INDEX `notifications_org_idx` ON `notifications` (`orgId`);