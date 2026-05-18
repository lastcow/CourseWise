-- COU-13 — reading materials gain an editable "description" metadata field.
-- Additive, nullable, safe on existing rows.

ALTER TABLE "reading_materials" ADD COLUMN IF NOT EXISTS "description" text;
