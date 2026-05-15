CREATE TABLE `conflict_acknowledgments` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`conflictId` bigint NOT NULL,
	`orgId` int NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`acknowledgerOpenId` varchar(64) NOT NULL,
	`acknowledgerName` text,
	`acknowledgedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conflict_acknowledgments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conflicts` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`declarerOpenId` varchar(64) NOT NULL,
	`declarerName` text,
	`conflictType` enum('financial','personal','professional','other') NOT NULL,
	`description` text NOT NULL,
	`declaredAt` timestamp NOT NULL DEFAULT (now()),
	`withdrawnAt` timestamp,
	`withdrawnByOpenId` varchar(64),
	`withdrawnByName` text,
	`withdrawnReason` text,
	CONSTRAINT `conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `conflict_ack_conflict_idx` ON `conflict_acknowledgments` (`conflictId`);--> statement-breakpoint
CREATE INDEX `conflict_ack_org_idx` ON `conflict_acknowledgments` (`orgId`);--> statement-breakpoint
CREATE INDEX `conflict_ack_unique_idx` ON `conflict_acknowledgments` (`conflictId`,`acknowledgerOpenId`);--> statement-breakpoint
CREATE INDEX `conflicts_deal_idx` ON `conflicts` (`dealId`);--> statement-breakpoint
CREATE INDEX `conflicts_org_idx` ON `conflicts` (`orgId`);--> statement-breakpoint
CREATE INDEX `conflicts_declarer_idx` ON `conflicts` (`declarerOpenId`);