// apps/api/src/services/ai/promptDefaults.ts
import type { AiArtifactKind, AiPromptDepthConfig } from '@coursewise/shared';

export interface AiPromptTemplateDefaults {
  systemPrompt: string;
  userMessage: string;
  depthConfig: AiPromptDepthConfig;
}

const MATERIAL_SYSTEM_PROMPT = `You are a curriculum-design assistant for a teaching platform.
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
{{teacherInstructions}}`;

const MATERIAL_USER_MESSAGE = `Write a reading material for the module titled "{{module.title}}".{{module.description}}`;

export const DEFAULT_PROMPT_BY_KIND: Record<AiArtifactKind, AiPromptTemplateDefaults> = {
  material: {
    systemPrompt: MATERIAL_SYSTEM_PROMPT,
    userMessage: MATERIAL_USER_MESSAGE,
    depthConfig: {
      brief: { wordTarget: '~500 words', maxTokens: 1200 },
      standard: { wordTarget: '~1000 words', maxTokens: 2400 },
      detailed: { wordTarget: '~1800 words', maxTokens: 4500 },
    },
  },
  // Phase 3+: presentation, assignment, project, quiz get added here.
  presentation: PLACEHOLDER_DEFAULTS('presentation'),
  assignment: PLACEHOLDER_DEFAULTS('assignment'),
  project: PLACEHOLDER_DEFAULTS('project'),
  quiz: PLACEHOLDER_DEFAULTS('quiz'),
};

function PLACEHOLDER_DEFAULTS(kind: string): AiPromptTemplateDefaults {
  return {
    systemPrompt: `Defaults not yet defined for kind "${kind}". Edit me in the admin page before enabling generation for this kind.`,
    userMessage: 'TODO',
    depthConfig: {
      brief: { wordTarget: '~500 words', maxTokens: 1200 },
      standard: { wordTarget: '~1000 words', maxTokens: 2400 },
      detailed: { wordTarget: '~1800 words', maxTokens: 4500 },
    },
  };
}
