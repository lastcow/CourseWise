-- Structure-only import decision (2026-07-04): the initial import no longer
-- captures a roster reference snapshot — student data enters only when
-- identity matching starts (P2), as an explicit action. Purge any snapshot
-- rows captured by imports that ran before this change; they are re-fetchable
-- on demand later. Table and unique index stay for P2.
DELETE FROM "lms_roster_entries";
--> statement-breakpoint
UPDATE "lms_course_links" SET "last_roster_fetch_at" = NULL;
