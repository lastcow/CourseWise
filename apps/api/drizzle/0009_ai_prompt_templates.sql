CREATE TABLE IF NOT EXISTS "ai_prompt_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "kind" "ai_artifact_kind" NOT NULL,
  "system_prompt" text NOT NULL,
  "user_message" text NOT NULL,
  "depth_config" jsonb NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_prompt_templates" ADD CONSTRAINT "ai_prompt_templates_updated_by_fkey"
   FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_prompt_templates_kind_idx"
  ON "ai_prompt_templates" ("kind");
--> statement-breakpoint
-- Seed: one row per artifact kind. The `material` row uses the real default
-- content; the other kinds get placeholders that admins must edit before
-- generation is enabled for them (Phase 3+).
INSERT INTO "ai_prompt_templates" ("kind", "system_prompt", "user_message", "depth_config")
VALUES (
  'material',
  $material_system$You are a curriculum-design assistant for a teaching platform.
You write reading materials that are clear, structured, and pedagogically sound.

Course: {{course.title}} ({{course.code}})
{{course.termLabel}}
{{course.description}}

Course modules:
{{moduleSummary}}

When asked to write a reading material for a specific module, follow these rules:
- Output valid Markdown only — no preamble, no commentary, no code fences around the whole thing.
- Begin with a single H2 heading derived from the module title.
- Include a 1–2 paragraph overview, 3–6 main sections each under an H3 heading, and a short summary at the end.
- Use concrete examples where they aid understanding.
- Target length: {{wordTarget}}.
- {{language}}
- Do not duplicate content that obviously belongs to other modules in this course.
{{teacherInstructions}}$material_system$,
  $material_user$Write a reading material for the module titled "{{module.title}}".{{module.description}}$material_user$,
  '{"brief": {"wordTarget": "~500 words", "maxTokens": 1200}, "standard": {"wordTarget": "~1000 words", "maxTokens": 2400}, "detailed": {"wordTarget": "~1800 words", "maxTokens": 4500}}'::jsonb
)
ON CONFLICT ("kind") DO NOTHING;
--> statement-breakpoint
INSERT INTO "ai_prompt_templates" ("kind", "system_prompt", "user_message", "depth_config")
SELECT k.kind, 'Defaults not yet defined for kind "' || k.kind || '". Edit me in the admin page before enabling generation for this kind.', 'TODO',
  '{"brief": {"wordTarget": "~500 words", "maxTokens": 1200}, "standard": {"wordTarget": "~1000 words", "maxTokens": 2400}, "detailed": {"wordTarget": "~1800 words", "maxTokens": 4500}}'::jsonb
FROM (VALUES ('presentation'::ai_artifact_kind), ('assignment'::ai_artifact_kind), ('project'::ai_artifact_kind), ('quiz'::ai_artifact_kind)) AS k(kind)
ON CONFLICT ("kind") DO NOTHING;
