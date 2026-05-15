CREATE TABLE `audit_log` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`orgId` int NOT NULL,
	`actorOpenId` varchar(64) NOT NULL,
	`actorName` text,
	`action` varchar(64) NOT NULL,
	`targetType` varchar(64),
	`targetId` varchar(64),
	`diff` json,
	`summary` text,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deal_versions` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`version` int NOT NULL,
	`payload` json NOT NULL,
	`actorOpenId` varchar(64) NOT NULL,
	`reason` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deal_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`companyName` varchar(256) NOT NULL,
	`industry` varchar(128),
	`stage` varchar(64),
	`payload` json NOT NULL,
	`isDemo` int NOT NULL DEFAULT 0,
	`isTest` int NOT NULL DEFAULT 0,
	`version` int NOT NULL DEFAULT 1,
	`createdByOpenId` varchar(64) NOT NULL,
	`updatedByOpenId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`),
	CONSTRAINT `deals_dealId_unique` UNIQUE(`dealId`)
);
--> statement-breakpoint
CREATE TABLE `org_settings` (
	`orgId` int NOT NULL,
	`assumptions` json NOT NULL,
	`activeDealId` varchar(64),
	`updatedByOpenId` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `org_settings_orgId` PRIMARY KEY(`orgId`)
);
--> statement-breakpoint
CREATE TABLE `orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `orgId` int DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_log_org_idx` ON `audit_log` (`orgId`);--> statement-breakpoint
CREATE INDEX `audit_log_target_idx` ON `audit_log` (`targetType`,`targetId`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actorOpenId`);--> statement-breakpoint
CREATE INDEX `deal_versions_deal_idx` ON `deal_versions` (`dealId`);--> statement-breakpoint
CREATE INDEX `deal_versions_org_idx` ON `deal_versions` (`orgId`);--> statement-breakpoint
CREATE INDEX `deals_org_idx` ON `deals` (`orgId`);--> statement-breakpoint
CREATE INDEX `deals_stage_idx` ON `deals` (`stage`);