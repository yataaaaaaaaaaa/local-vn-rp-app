import type { StoryNodeFields } from "@local-vn/story-domain";

import type { RpAgent } from "./types";

type SexSceneStepId =
  | "inactive"
  | "romantic_invitation"
  | "consent_check"
  | "kissing"
  | "undressing"
  | "sensual_touch"
  | "sex"
  | "aftercare"
  | "fade_to_black"
  | "boundary_pause";

type SexSceneStepCard = {
  id: SexSceneStepId;
  label: string;
  order: number;
  promptView: string;
  visualTags: string[];
  requiresAdultFraming: boolean;
};

type SexSceneState = {
  active: boolean;
  step: SexSceneStepId;
  label: string;
  order: number;
  promptView: string;
  visualTags: string[];
  evidence: string[];
  boundaryDetected: boolean;
  requiresAdultFraming: boolean;
  shouldFadeToBlack: boolean;
};

type SexSceneCue = {
  step: SexSceneStepId;
  pattern: RegExp;
  evidenceLabel: string;
};

export const SEX_SCENE_AGENT: RpAgent = {
  id: "sex_scene_agent",
  run(input) {
    const state = extractSexSceneState([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription
    ].join("\n"));
    const facts: Record<string, string | boolean | string[]> = {
      sex_scene_state: sexSceneStateToPromptText(state)
    };

    if (!state.active) {
      return {
        facts,
        fixedTags: []
      };
    }

    facts.sex_scene_step = state.step;
    facts.sex_scene_requires_adult_framing = state.requiresAdultFraming;
    facts.sex_scene_should_fade_to_black = state.shouldFadeToBlack;

    return {
      facts,
      fixedTags: state.boundaryDetected || state.shouldFadeToBlack ? [] : state.visualTags
    };
  }
};

function extractSexSceneState(text: string): SexSceneState {
  const normalized = text.replace(/\s+/g, " ").trim();
  const boundaryDetected = detectSexSceneBoundary(normalized);
  const matchedCues = SEX_SCENE_CUES.filter((cue) => cue.pattern.test(normalized));
  const stepId = boundaryDetected
    ? "boundary_pause"
    : strongestStep(matchedCues);
  const card = getSexSceneStepCard(stepId);
  const shouldFadeToBlack = stepId === "fade_to_black" || /\b(?:fade to black|cut away|skip ahead)\b/i.test(normalized);

  return {
    active: stepId !== "inactive",
    step: stepId,
    label: card.label,
    order: card.order,
    promptView: card.promptView,
    visualTags: card.visualTags,
    evidence: matchedCues.map((cue) => cue.evidenceLabel),
    boundaryDetected,
    requiresAdultFraming: card.requiresAdultFraming,
    shouldFadeToBlack
  };
}

function sexSceneStateToPromptText(state: SexSceneState): string {
  const boundary = state.boundaryDetected ? " Boundary language is present; pause escalation." : "";
  const fade = state.shouldFadeToBlack ? " Prefer fade-to-black or aftermath over explicit detail." : "";
  const adult = state.requiresAdultFraming
    ? " Only proceed with adult characters and clear, ongoing consent."
    : "";
  const evidence = state.evidence.length ? ` Evidence: ${state.evidence.join("; ")}.` : "";

  return `SEX_SCENE_STATE: ${state.label}. ${state.promptView}${adult}${boundary}${fade}${evidence}`.trim();
}

function detectSexSceneBoundary(text: string): boolean {
  if (!detectPacingBoundaryCue(text)) return false;
  if (/\b(?:we can stop|can stop any ?time|tell me to stop|stop whenever you want|stop if you want)\b/i.test(text)) {
    return false;
  }
  return true;
}

function detectPacingBoundaryCue(text: string): boolean {
  return /\b(?:stop|halt|wait|pause|no|don't|do not|not comfortable|uncomfortable|slow down|too fast|boundary|not yet|later)\b/i.test(text);
}

function strongestStep(cues: SexSceneCue[]): SexSceneStepId {
  if (!cues.length) return "inactive";

  return cues.reduce((best, cue) => {
    const bestCard = getSexSceneStepCard(best.step);
    const cueCard = getSexSceneStepCard(cue.step);
    return cueCard.order >= bestCard.order ? cue : best;
  }).step;
}

function getSexSceneStepCard(id: SexSceneStepId): SexSceneStepCard {
  return SEX_SCENE_STEPS.find((step) => step.id === id) ?? SEX_SCENE_STEPS[0]!;
}

const SEX_SCENE_STEPS: SexSceneStepCard[] = [
  {
    id: "inactive",
    label: "Inactive",
    order: 0,
    promptView: "No active sex-scene handling is needed.",
    visualTags: [],
    requiresAdultFraming: false
  },
  {
    id: "romantic_invitation",
    label: "Romantic invitation",
    order: 1,
    promptView:
      "A romantic or intimate next step is being offered. Preserve player agency and leave acceptance, refusal, or redirection open.",
    visualTags: ["romantic"],
    requiresAdultFraming: false
  },
  {
    id: "consent_check",
    label: "Consent check",
    order: 2,
    promptView:
      "The scene needs explicit pacing and consent. Do not escalate until willingness is clear, reversible, and unpressured.",
    visualTags: [],
    requiresAdultFraming: true
  },
  {
    id: "kissing",
    label: "Kissing",
    order: 3,
    promptView:
      "Kissing or near-kissing is active. Keep the moment grounded in visible action and preserve room to stop or slow down.",
    visualTags: ["kiss"],
    requiresAdultFraming: false
  },
  {
    id: "undressing",
    label: "Undressing",
    order: 4,
    promptView:
      "Clothing is being removed or loosened. Treat undressing as a chosen, reversible step and avoid assuming private reactions.",
    visualTags: ["undressing"],
    requiresAdultFraming: true
  },
  {
    id: "sensual_touch",
    label: "Sensual touch",
    order: 5,
    promptView:
      "Adult sensual touch is implied or active. Keep consent ongoing, avoid controlling the player, and prefer non-graphic visual continuity.",
    visualTags: ["intimate"],
    requiresAdultFraming: true
  },
  {
    id: "sex",
    label: "Sex",
    order: 6,
    promptView:
      "A consensual adult sex scene is active or directly implied. Use adult framing, consent, pacing, aftercare, and fade-to-black when needed.",
    visualTags: ["naked", "bed"],
    requiresAdultFraming: true
  },
  {
    id: "aftercare",
    label: "Aftercare",
    order: 7,
    promptView:
      "The scene is in aftermath or aftercare. Focus on comfort, checking in, tenderness, and emotional continuity.",
    visualTags: ["after sex"],
    requiresAdultFraming: true
  },
  {
    id: "fade_to_black",
    label: "Fade to black",
    order: 8,
    promptView:
      "The scene should skip explicit detail and continue with aftermath, emotional consequence, or a non-graphic visual cue.",
    visualTags: [],
    requiresAdultFraming: true
  },
  {
    id: "boundary_pause",
    label: "Boundary pause",
    order: 9,
    promptView:
      "A boundary, hesitation, refusal, or discomfort is present. Pause escalation, respect the boundary, and create a safer next step.",
    visualTags: [],
    requiresAdultFraming: false
  }
];

const SEX_SCENE_CUES: SexSceneCue[] = [
  {
    step: "fade_to_black",
    pattern: /\b(?:fade to black|cut away|skip ahead|leave the rest private|spare the details)\b/i,
    evidenceLabel: "fade-to-black or privacy language"
  },
  {
    step: "aftercare",
    pattern: /\b(?:aftercare|afterward|afterwards|morning after|cuddles?|held each other|checks? in|are you okay|was that okay)\b/i,
    evidenceLabel: "aftercare or aftermath language"
  },
  {
    step: "sex",
    pattern: /\b(?:have sex|making love|made love|slept together|sleep together|sex scene|in bed together|adult intimacy|intimate together)\b/i,
    evidenceLabel: "direct adult sex or intimacy language"
  },
  {
    step: "sensual_touch",
    pattern: /\b(?:caress(?:es|ed|ing)?|stroke(?:s|d|ing)?|touch(?:es|ed|ing)?\s+(?:her|him|them|you|me)\s+(?:skin|body|waist|hip|thigh|chest)|hands?\s+(?:on|at)\s+(?:her|his|their|your|my)\s+(?:skin|waist|hips?|thigh|chest))\b/i,
    evidenceLabel: "sensual touch language"
  },
  {
    step: "undressing",
    pattern: /\b(?:undress(?:es|ed|ing)?|strip(?:s|ped|ping)?|take(?:s|n|ing)?\s+off|slip(?:s|ped|ping)?\s+off|unbutton(?:s|ed|ing)?|unzips?)\b/i,
    evidenceLabel: "undressing language"
  },
  {
    step: "kissing",
    pattern: /\b(?:kiss(?:es|ed|ing)?|near-kiss|almost kiss|mouths? meet|lips? brush|lips? touch)\b/i,
    evidenceLabel: "kissing language"
  },
  {
    step: "consent_check",
    pattern: /\b(?:is this okay|are you sure|do you want this|tell me to stop|we can stop|only if you want|if you want this|may i|can i)\b/i,
    evidenceLabel: "consent or pacing language"
  },
  {
    step: "romantic_invitation",
    pattern: /\b(?:come closer|stay with me|take my hand|come to bed|join me|invite(?:s|d)?\s+(?:her|him|them|you|me)|want you close)\b/i,
    evidenceLabel: "romantic invitation language"
  }
];
