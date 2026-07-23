-- ============================================================================
-- BASELINE MIGRATION — DO NOT REWRITE, REORDER, OR DELETE.
--
-- This is the first migration. It is applied to the live app on its first
-- deploy, and every deployed Durable Object records it as applied the first
-- time it wakes — after which it is NEVER re-run. Editing, renaming, or
-- deleting this file makes already-deployed objects diverge from freshly
-- created ones and can crash the app on startup.
--
-- To retire the example `notes` table, do NOT touch this file: add a NEW
-- migration (npm run db:generate) that drops it, and read the generated SQL
-- first. See AGENTS.md “Changing the database schema” for the safe two-deploy
-- path. The commit hook enforces this — it blocks edits here beyond `--`
-- comments.
-- ============================================================================
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
