ALTER TABLE `jobs` ADD `payload_state` text DEFAULT 'plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `payload_expires_at` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `viewer_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `jobs_retention` ON `jobs` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `settings` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `settings` ADD `job_id` text;--> statement-breakpoint
CREATE INDEX `media_history` ON `media` (`created_at`,`id`);
--> statement-breakpoint
UPDATE jobs SET viewer_ids=coalesce((
  SELECT json_array(CAST(coalesce(json_extract(receipts.payload,'$.sender.user_id'),json_extract(receipts.payload,'$.follower.user_id'),json_extract(receipts.payload,'$.subscriber.user_id'),json_extract(receipts.payload,'$.gifter.user_id')) AS TEXT))
  FROM receipts WHERE coalesce(json_extract(receipts.payload,'$.sender.user_id'),json_extract(receipts.payload,'$.follower.user_id'),json_extract(receipts.payload,'$.subscriber.user_id'),json_extract(receipts.payload,'$.gifter.user_id')) IS NOT NULL
  AND (jobs.id='event:'||receipts.id OR jobs.id='reply:'||receipts.id OR jobs.id='action:moderation:'||receipts.id OR substr(jobs.id,1,length('discord:'||receipts.id||':'))='discord:'||receipts.id||':' OR substr(jobs.id,1,length('discord:moderation:'||receipts.id||':'))='discord:moderation:'||receipts.id||':')
), '[]');
--> statement-breakpoint
UPDATE jobs SET viewer_ids=(SELECT json_array(media.requester) FROM media WHERE jobs.id='metadata:'||media.id OR jobs.id='media-result:'||media.id)
WHERE EXISTS(SELECT 1 FROM media WHERE jobs.id='metadata:'||media.id OR jobs.id='media-result:'||media.id);
