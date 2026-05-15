CREATE TABLE `ballots` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`voteId` bigint NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`voterOpenId` varchar(64) NOT NULL,
	`voterName` text,
	`choice` enum('APPROVE','REJECT','ABSTAIN','REQUEST_CHANGES') NOT NULL,
	`rationale` text,
	`castAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ballots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`dealId` varchar(64) NOT NULL,
	`orgId` int NOT NULL,
	`state` enum('NOT_STARTED','OPEN','CLOSED','REOPENED') NOT NULL DEFAULT 'NOT_STARTED',
	`openedAt` timestamp,
	`openedByOpenId` varchar(64),
	`openedByName` text,
	`deadlineAt` timestamp,
	`closedAt` timestamp,
	`closedByOpenId` varchar(64),
	`closedByName` text,
	`reopenedAt` timestamp,
	`reopenedByOpenId` varchar(64),
	`reopenedByName` text,
	`reopenReason` text,
	`reopenCount` int NOT NULL DEFAULT 0,
	`outcome` enum('APPROVED','REJECTED','CHANGES_REQUESTED','NO_QUORUM','PENDING') NOT NULL DEFAULT 'PENDING',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ballots_vote_idx` ON `ballots` (`voteId`);--> statement-breakpoint
CREATE INDEX `ballots_deal_idx` ON `ballots` (`dealId`);--> statement-breakpoint
CREATE INDEX `ballots_voter_idx` ON `ballots` (`voterOpenId`);--> statement-breakpoint
CREATE INDEX `ballots_unique_idx` ON `ballots` (`voteId`,`voterOpenId`);--> statement-breakpoint
CREATE INDEX `votes_deal_idx` ON `votes` (`dealId`);--> statement-breakpoint
CREATE INDEX `votes_org_idx` ON `votes` (`orgId`);--> statement-breakpoint
CREATE INDEX `votes_state_idx` ON `votes` (`state`);