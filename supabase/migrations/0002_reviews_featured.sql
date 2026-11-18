-- Reviews showcase pins: featured reviews lead the showcase and the landing
-- strip, set via the third (star) button on the Telegram moderation alert.
-- Idempotent; 0001-created tables get the column here, fresh installs from
-- the runtime DDL already have it.

alter table reviews add column if not exists featured boolean not null default false;
