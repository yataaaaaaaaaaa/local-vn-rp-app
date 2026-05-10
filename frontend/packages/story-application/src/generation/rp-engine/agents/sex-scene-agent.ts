import type { AdvancementCard, BeatType, SexSceneNoveltyContext, SexSceneNoveltyPressure } from "../types";
import type { AgentNoveltyCandidate, AgentNote, RpAgent } from "./types";

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

type SexSceneFacetId =
  | "consent"
  | "phase"
  | "position"
  | "orientation"
  | "support"
  | "contact"
  | "motion"
  | "clothing"
  | "barrier"
  | "setting"
  | "camera"
  | "aftercare";

export type SexSceneDetailLifetime =
  | "instant"
  | "beat"
  | "position"
  | "scene"
  | "encounter"
  | "aftercare";

type SexSceneStepCard = {
  id: SexSceneStepId;
  label: string;
  order: number;
  promptView: string;
  visualTags: string[];
  requiresAdultFraming: boolean;
};

type SexSceneCue = {
  step: SexSceneStepId;
  pattern: RegExp;
  evidenceLabel: string;
};

type SexSceneDetailCard = {
  id: string;
  facet: SexSceneFacetId;
  label: string;
  lifetime: SexSceneDetailLifetime;
  promptView: string;
  visualTags: string[];
  patterns: RegExp[];
  evidenceLabel: string;
  adultOnly?: boolean;
  suppressWithBoundary?: boolean;
};

export type SexSceneDetailMatch = Omit<SexSceneDetailCard, "patterns"> & {
  evidence: string;
};

type SexSceneSubAgent = {
  id: string;
  facet: SexSceneFacetId;
  cards: SexSceneDetailCard[];
  maxMatches?: number;
};

export type SexSceneState = {
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
  details: SexSceneDetailMatch[];
  detailsByFacet: Record<string, SexSceneDetailMatch[]>;
  promptSummary: string;
  visualTagBudget: string[];
  noveltyPressure: SexSceneNoveltyPressure;
};

export const SEX_SCENE_AGENT: RpAgent = {
  id: "sex_scene_agent",
  run(input) {
    const state = extractSexSceneState([
      input.node.context,
      input.node.userText,
      input.node.dialogue,
      input.node.visualDescription,
      input.node.resolverText,
      input.node.selectedTags,
      input.node.danbotTags
    ].join("\n"));

    const selectedBeatId = noveltyBeatIdFromInput(input.forcedNovelty?.advancementCard);
    const promptView = sexScenePromptView(state, selectedBeatId);
    const facts: Record<string, string | boolean | string[]> = {
      sex_scene_state: sexSceneStateToPromptText(state),
      sex_scene_active: state.active,
      sex_scene_detail_lifetimes: summarizeDetailLifetimes(state.details),
      sex_scene_novelty_pressure: state.noveltyPressure,
      sex_scene_novelty_bridge: promptView.noveltyBridgeInstruction as string
    };

    if (!state.active) {
      return {
        facts,
        fixedTags: [],
        promptViews: {
          sexScene: promptView
        },
        novelty: {
          intimacy: sexSceneStateToNoveltyContext(state)
        },
        notes: sexSceneNotes(state),
        candidates: sexSceneCandidates(state)
      };
    }

    facts.sex_scene_step = state.step;
    facts.sex_scene_requires_adult_framing = state.requiresAdultFraming;
    facts.sex_scene_should_fade_to_black = state.shouldFadeToBlack;
    facts.sex_scene_positions = labelsForFacet(state, "position");
    facts.sex_scene_contacts = labelsForFacet(state, "contact");
    facts.sex_scene_supports = labelsForFacet(state, "support");
    facts.sex_scene_camera = labelsForFacet(state, "camera");
    facts.sex_scene_novelty_targets = promptView.noveltyFacetTargets as string[];

    return {
      facts,
      fixedTags: state.boundaryDetected || state.shouldFadeToBlack ? [] : state.visualTagBudget,
      promptViews: {
        sexScene: promptView
      },
      novelty: {
        intimacy: sexSceneStateToNoveltyContext(state)
      },
      notes: sexSceneNotes(state),
      candidates: sexSceneCandidates(state)
    };
  }
};

function sexSceneNotes(state: SexSceneState): AgentNote[] {
  return [
    {
      source: "sex-scene",
      text: [
        `active=${state.active}`,
        `step=${state.label}`,
        `pressure=${state.noveltyPressure}`,
        `boundary=${state.boundaryDetected}`,
        `fade=${state.shouldFadeToBlack}`,
        `summary=${state.promptSummary || "none"}`
      ].join("; ")
    }
  ];
}

function sexSceneCandidates(state: SexSceneState): AgentNoveltyCandidate[] {
  if (state.boundaryDetected) {
    return [{
      id: "sex-scene:boundary-repair",
      source: "sex_scene",
      weight: 1.5,
      label: "boundary repair",
      text: "Use one intimacy-state redirect: pause escalation, acknowledge pacing, create distance or reassurance, and offer a safer non-sexual next step. Do not introduce erotic escalation or a romantic cliché.",
      rationale: "Boundary language is present in sex-scene state.",
    }];
  }

  if (state.shouldFadeToBlack) {
    return [{
      id: "sex-scene:fade-to-black",
      source: "sex_scene",
      weight: 1.25,
      label: "fade to black",
      text: "Use one intimacy-state redirect: transition through covered framing, aftermath, emotional consequence, or a non-graphic visual cue. Do not add explicit mechanics.",
      rationale: "Fade-to-black or private framing is active.",
    }];
  }

  if (!state.active) return [];

  const candidates: AgentNoveltyCandidate[] = [];
  if (state.noveltyPressure === "aftercare" || state.step === "aftercare") {
    candidates.push({
      id: "sex-scene:aftercare",
      source: "sex_scene",
      weight: 0.95,
      label: "aftercare",
      text: "Use one intimacy-state redirect: focus on aftercare, comfort, cleanup, emotional consequence, or a consent check-in. Do not restart active sex or add another novelty beat.",
      rationale: "Aftercare state is active.",
    });
  }

  if (state.noveltyPressure === "micro_shift") {
    const persistent = summarizeDetailLifetimes(state.details.filter((detail) => detail.lifetime === "position" || detail.lifetime === "scene" || detail.lifetime === "encounter"));
    candidates.push({
      id: "sex-scene:micro-shift",
      source: "sex_scene",
      weight: 0.8,
      label: "intimacy micro-shift",
      text: [
        "Use one intimacy-state redirect: preserve established position/contact/setting details and change at most one short-lived visible facet such as pacing, framing, or a check-in.",
        `Persistent details to preserve: ${persistent.join("; ") || "none"}.`,
        "Do not advance position, clothing, contact, and aftercare all at once."
      ].join(" "),
      rationale: "Active adult intimacy state permits only a small compatible detail delta.",
    });
  }

  return candidates;
}

export function extractSexSceneState(text: string): SexSceneState {
  const normalized = text.replace(/\s+/g, " ").trim();
  const boundaryDetected = detectSexSceneBoundary(normalized);
  const matchedCues = SEX_SCENE_CUES.filter((cue) => cue.pattern.test(normalized));
  const rawStepId = strongestStep(matchedCues);
  const stepId = boundaryDetected ? "boundary_pause" : rawStepId;
  const card = getSexSceneStepCard(stepId);
  const shouldFadeToBlack = stepId === "fade_to_black" || /\b(?:fade to black|cut away|skip ahead|leave the rest private|spare the details)\b/i.test(normalized);
  const rawDetails = extractDetailMatches(normalized);
  const details = boundaryDetected ? rawDetails.filter((detail) => !detail.suppressWithBoundary) : rawDetails;
  const active = stepId !== "inactive" || details.some((detail) => detail.adultOnly || detail.facet === "position" || detail.facet === "contact");
  const requiresAdultFraming = card.requiresAdultFraming || details.some((detail) => detail.adultOnly);
  const visualTagBudget = selectVisualTags(card, details);

  const state: SexSceneState = {
    active,
    step: stepId,
    label: card.label,
    order: card.order,
    promptView: card.promptView,
    visualTags: card.visualTags,
    evidence: matchedCues.map((cue) => cue.evidenceLabel),
    boundaryDetected,
    requiresAdultFraming,
    shouldFadeToBlack,
    details,
    detailsByFacet: groupDetailsByFacet(details),
    promptSummary: "",
    noveltyPressure: noveltyPressureForSexScene(stepId, boundaryDetected, shouldFadeToBlack),
    visualTagBudget
  };

  state.promptSummary = buildSexSceneDetailSummary(state);
  return state;
}

export function sexSceneStateToPromptText(state: SexSceneState): string {
  const boundary = state.boundaryDetected ? " Boundary language is present; pause escalation and do not add erotic escalation." : "";
  const fade = state.shouldFadeToBlack ? " Prefer fade-to-black, aftermath, or non-graphic transition over explicit detail." : "";
  const adult = state.requiresAdultFraming
    ? " Only proceed with clearly adult characters and clear, ongoing, reversible, unpressured consent."
    : "";
  const evidence = state.evidence.length ? ` Evidence: ${state.evidence.join("; ")}.` : "";
  const details = state.promptSummary ? ` Details: ${state.promptSummary}` : "";

  return `SEX_SCENE_STATE: ${state.label}. ${state.promptView}${adult}${boundary}${fade}${details}${evidence}`.trim();
}

export function sexSceneStateToNoveltyContext(state: SexSceneState): SexSceneNoveltyContext {
  const facets = state.details.map((detail) => ({
    facet: detail.facet,
    label: detail.label,
    lifetime: detail.lifetime
  }));

  return {
    active: state.active,
    step: state.step,
    label: state.label,
    stepOrder: state.order,
    boundaryDetected: state.boundaryDetected,
    requiresAdultFraming: state.requiresAdultFraming,
    shouldFadeToBlack: state.shouldFadeToBlack,
    detailSummary: state.promptSummary || "No extra intimacy-position details are established.",
    detailLifetimes: summarizeDetailLifetimes(state.details),
    facets,
    positions: labelsForFacet(state, "position"),
    contacts: labelsForFacet(state, "contact"),
    persistentDetails: state.details
      .filter((detail) => detail.lifetime === "position" || detail.lifetime === "scene" || detail.lifetime === "encounter")
      .map((detail) => `${detail.facet}:${detail.label} [${detail.lifetime}]`),
    beatDetails: state.details
      .filter((detail) => detail.lifetime === "instant" || detail.lifetime === "beat")
      .map((detail) => `${detail.facet}:${detail.label} [${detail.lifetime}]`),
    noveltyPressure: state.noveltyPressure
  };
}

function sexScenePromptView(state: SexSceneState, selectedBeatId?: BeatType | null): Record<string, unknown> {
  const noveltyBridge = buildSexSceneNoveltyBridgeInstruction(state, selectedBeatId);

  return {
    active: state.active,
    step: state.step,
    label: state.label,
    promptView: state.promptView,
    requiresAdultFraming: state.requiresAdultFraming,
    shouldFadeToBlack: state.shouldFadeToBlack,
    boundaryDetected: state.boundaryDetected,
    detailSummary: state.promptSummary || "No extra intimacy-position details are established.",
    detailLifetimes: summarizeDetailLifetimes(state.details),
    noveltyPressure: state.noveltyPressure,
    noveltyFacetTargets: noveltyFacetTargetsForBeat(state, selectedBeatId),
    noveltyBridgeInstruction: noveltyBridge,
    postHistoryInstruction: [buildSexScenePostHistoryInstruction(state), noveltyBridge].filter(Boolean).join(" ")
  };
}

function buildSexScenePostHistoryInstruction(state: SexSceneState): string {
  if (state.boundaryDetected) {
    return "Respect the boundary immediately: stop escalation, acknowledge pacing, and offer a safer or non-sexual next step.";
  }
  if (state.shouldFadeToBlack) {
    return "Do not narrate explicit mechanics; transition to aftermath, emotional consequence, or a non-graphic visual cue.";
  }
  if (!state.active) {
    return "No adult intimacy mechanics are active; keep romance grounded in the current exchange.";
  }

  return [
    "Use the established adult-intimacy details only when they are visible or directly relevant.",
    "Treat position, contact, clothing, setting, camera, and aftercare as independent facets; do not force them into a linear checklist.",
    "Maintain adult-only, consent-aware framing and preserve player agency."
  ].join(" ");
}

function noveltyPressureForSexScene(
  stepId: SexSceneStepId,
  boundaryDetected: boolean,
  shouldFadeToBlack: boolean
): SexSceneNoveltyPressure {
  if (boundaryDetected || stepId === "boundary_pause") return "boundary_repair";
  if (shouldFadeToBlack || stepId === "fade_to_black") return "fade_to_black";
  if (stepId === "aftercare") return "aftercare";
  if (stepId === "sex" || stepId === "sensual_touch" || stepId === "undressing") return "micro_shift";
  if (stepId === "kissing" || stepId === "consent_check") return "stabilize";
  if (stepId === "romantic_invitation") return "reframe";
  return "none";
}

function noveltyBeatIdFromInput(card?: AdvancementCard | BeatType | null): BeatType | null {
  if (!card) return null;
  return typeof card === "string" ? card : card.id;
}

function noveltyFacetTargetsForBeat(state: SexSceneState, selectedBeatId?: BeatType | null): string[] {
  if (!state.active) return [];
  if (state.boundaryDetected) return ["consent", "setting", "aftercare"];
  if (state.shouldFadeToBlack) return ["camera", "aftercare", "setting"];
  if (state.step === "aftercare") return ["aftercare", "consent", "setting"];

  switch (selectedBeatId) {
    case "boundary_check":
    case "repair_and_respect":
    case "consent_aware_closeness":
      return ["consent", "motion", "contact"];
    case "desire_without_pressure":
    case "romantic_invitation":
      return ["phase", "contact", "motion"];
    case "charged_silence":
    case "visual_proximity":
    case "visual_expression":
      return ["camera", "position", "contact"];
    case "protective_tenderness":
    case "emotional_opening":
    case "callback_intimacy":
      return ["aftercare", "contact", "setting"];
    default:
      return ["contact", "motion", "camera"];
  }
}

function buildSexSceneNoveltyBridgeInstruction(state: SexSceneState, selectedBeatId?: BeatType | null): string {
  if (!state.active) {
    return "Sex-scene novelty bridge: inactive; do not invent adult-intimacy details for novelty.";
  }
  if (state.boundaryDetected) {
    return "Sex-scene novelty bridge: boundary state wins over the novelty beat; change only consent, distance, reassurance, or non-sexual safety.";
  }
  if (state.shouldFadeToBlack) {
    return "Sex-scene novelty bridge: route novelty through covered framing, aftermath, or emotional consequence; do not add explicit mechanics.";
  }
  if (state.step === "aftercare") {
    return "Sex-scene novelty bridge: novelty should be aftercare, comfort, cleanup, check-in, or callback meaning; do not restart active sex.";
  }

  const targets = noveltyFacetTargetsForBeat(state, selectedBeatId);
  const persistent = summarizeDetailLifetimes(state.details.filter((detail) => detail.lifetime === "position" || detail.lifetime === "scene" || detail.lifetime === "encounter"));
  const shortLived = summarizeDetailLifetimes(state.details.filter((detail) => detail.lifetime === "instant" || detail.lifetime === "beat"));

  return [
    `Sex-scene novelty bridge: selected romance beat ${selectedBeatId ?? "(none)"} may touch facets ${targets.join(", ") || "none"}.`,
    `Preserve persistent intimacy facts: ${persistent.join("; ") || "none"}.`,
    `Only short-lived details may rotate this turn: ${shortLived.join("; ") || "none"}.`,
    "Do not advance position, contact, clothing, camera, and aftercare all at once."
  ].join(" ");
}

function detectSexSceneBoundary(text: string): boolean {
  if (!detectPacingBoundaryCue(text)) return false;
  if (/\b(?:we can stop|can stop any ?time|tell me to stop|stop whenever you want|stop if you want|safe word|safeword)\b/i.test(text)) {
    return false;
  }
  return true;
}

function detectPacingBoundaryCue(text: string): boolean {
  return /\b(?:stop|halt|wait|pause|no|don't|do not|not comfortable|uncomfortable|slow down|too fast|boundary|not yet|later|changed my mind)\b/i.test(text);
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

function extractDetailMatches(text: string): SexSceneDetailMatch[] {
  const matches: SexSceneDetailMatch[] = [];
  const seen = new Set<string>();

  for (const subAgent of SEX_SCENE_SUB_AGENTS) {
    let count = 0;
    for (const card of subAgent.cards) {
      if (subAgent.maxMatches && count >= subAgent.maxMatches) break;
      if (!card.patterns.some((pattern) => pattern.test(text))) continue;
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      count += 1;
      matches.push({
        id: card.id,
        facet: card.facet,
        label: card.label,
        lifetime: card.lifetime,
        promptView: card.promptView,
        visualTags: card.visualTags,
        evidenceLabel: card.evidenceLabel,
        evidence: card.evidenceLabel,
        adultOnly: card.adultOnly,
        suppressWithBoundary: card.suppressWithBoundary
      });
    }
  }

  return matches;
}

function groupDetailsByFacet(details: SexSceneDetailMatch[]): Record<string, SexSceneDetailMatch[]> {
  return details.reduce<Record<string, SexSceneDetailMatch[]>>((grouped, detail) => {
    grouped[detail.facet] = grouped[detail.facet] ?? [];
    grouped[detail.facet]!.push(detail);
    return grouped;
  }, {});
}

function labelsForFacet(state: SexSceneState, facet: SexSceneFacetId): string[] {
  return (state.detailsByFacet[facet] ?? []).map((detail) => detail.label);
}

function summarizeDetailLifetimes(details: SexSceneDetailMatch[]): string[] {
  if (!details.length) return [];

  return details.map((detail) => `${detail.facet}:${detail.label} [${detail.lifetime}]`);
}

function buildSexSceneDetailSummary(state: SexSceneState): string {
  if (!state.details.length) return "";

  const facetOrder: SexSceneFacetId[] = [
    "consent",
    "phase",
    "position",
    "orientation",
    "support",
    "contact",
    "motion",
    "clothing",
    "barrier",
    "setting",
    "camera",
    "aftercare"
  ];

  return facetOrder
    .map((facet) => {
      const details = state.detailsByFacet[facet] ?? [];
      if (!details.length) return "";
      return `${facet}: ${details.map((detail) => `${detail.label} (${detail.lifetime})`).join(", ")}`;
    })
    .filter(Boolean)
    .join("; ");
}

function selectVisualTags(card: SexSceneStepCard, details: SexSceneDetailMatch[]): string[] {
  const tags = [
    ...card.visualTags,
    ...details.flatMap((detail) => detail.visualTags)
  ];

  return dedupe(tags).slice(0, 12);
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
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
      "Adult sensual touch is implied or active. Keep consent ongoing, avoid controlling the player, and prefer visible, grounded continuity over hidden sensation.",
    visualTags: ["intimate"],
    requiresAdultFraming: true
  },
  {
    id: "sex",
    label: "Sex",
    order: 6,
    promptView:
      "A consensual adult sex scene is active or directly implied. Track adult-only consent, position, contact, pacing, clothing, setting, camera/framing, and aftercare without forcing every facet to advance at once.",
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
    pattern: /\b(?:aftercare|afterward|afterwards|morning after|cuddles?|held each other|checks? in|are you okay|was that okay|blanket around|softly cleaned up)\b/i,
    evidenceLabel: "aftercare or aftermath language"
  },
  {
    step: "sex",
    pattern: /\b(?:have sex|having sex|making love|made love|slept together|sleep together|sex scene|in bed together|adult intimacy|intimate together|intercourse|penetration|oral sex|mutual pleasure|climax|orgasm)\b/i,
    evidenceLabel: "direct adult sex or intimacy language"
  },
  {
    step: "sensual_touch",
    pattern: /\b(?:caress(?:es|ed|ing)?|stroke(?:s|d|ing)?|touch(?:es|ed|ing)?\s+(?:her|him|them|you|me)\s+(?:skin|body|waist|hip|thigh|chest)|hands?\s+(?:on|at)\s+(?:her|his|their|your|my)\s+(?:skin|waist|hips?|thigh|chest)|grind(?:s|ing)?|press(?:es|ed|ing)?\s+(?:against|closer))\b/i,
    evidenceLabel: "sensual touch language"
  },
  {
    step: "undressing",
    pattern: /\b(?:undress(?:es|ed|ing)?|strip(?:s|ped|ping)?|take(?:s|n|ing)?\s+off|slip(?:s|ped|ping)?\s+off|unbutton(?:s|ed|ing)?|unzips?|pull(?:s|ed|ing)?\s+(?:down|off|open)|bare skin|naked|nude)\b/i,
    evidenceLabel: "undressing language"
  },
  {
    step: "kissing",
    pattern: /\b(?:kiss(?:es|ed|ing)?|near-kiss|almost kiss|mouths? meet|lips? brush|lips? touch|make out|making out)\b/i,
    evidenceLabel: "kissing language"
  },
  {
    step: "consent_check",
    pattern: /\b(?:is this okay|are you sure|do you want this|tell me to stop|we can stop|only if you want|if you want this|may i|can i|safe word|safeword|still okay|do you like this)\b/i,
    evidenceLabel: "consent or pacing language"
  },
  {
    step: "romantic_invitation",
    pattern: /\b(?:come closer|stay with me|take my hand|come to bed|join me|invite(?:s|d)?\s+(?:her|him|them|you|me)|want you close)\b/i,
    evidenceLabel: "romantic invitation language"
  }
];

const CONSENT_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("ongoing_consent", "consent", "ongoing consent", "beat", "Clear check-in language is present; keep consent reversible and do not assume the player reciprocates.", [], [/\b(?:is this okay|still okay|do you want this|tell me to stop|we can stop|only if you want|if you want this|may i|can i|safe word|safeword)\b/i], "explicit consent/check-in wording", true),
  detail("hesitation", "consent", "hesitation or uncertainty", "instant", "Hesitation is present; slow or pause the scene instead of escalating.", [], [/\b(?:hesitat(?:e|es|ed|ing)|uncertain|unsure|not yet|maybe later|slow down)\b/i], "hesitation or uncertainty wording", false, true),
  detail("enthusiastic_consent", "consent", "clear adult willingness", "beat", "Adult willingness is explicit, but the player still retains agency and can redirect.", [], [/\b(?:yes|i want this|keep going|don't stop|please continue|i'm sure)\b/i], "explicit willingness wording", true)
];

const PHASE_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("foreplay_phase", "phase", "foreplay / build-up", "beat", "The scene is in adult build-up; prioritize consent, pacing, and one visible action at a time.", ["intimate"], [/\b(?:foreplay|teasing|build[- ]?up|warming up|touching slowly|slow kisses)\b/i], "adult build-up wording", true),
  detail("active_sex_phase", "phase", "active sex", "beat", "The scene has moved into active adult intimacy; track physical arrangement without forcing new mechanics every line.", ["naked"], [/\b(?:having sex|making love|intercourse|penetration|oral sex|rides? him|on top of him|from behind|missionary)\b/i], "active sex wording", true),
  detail("climax_phase", "phase", "climax / peak", "instant", "A peak moment is indicated; do not keep repeating it across later turns unless re-established.", [], [/\b(?:climax|orgasm|comes?|finish(?:es|ed)?|peak(?:s|ed)?)\b/i], "climax or peak wording", true),
  detail("cooldown_phase", "phase", "cooldown", "aftercare", "The intense action has ended; shift toward breath, comfort, and checking in.", ["after sex"], [/\b(?:cool(?:s|ed)? down|catch(?:es|ing)? breath|afterward|aftercare|spent|exhausted together)\b/i], "cooldown or aftercare wording", true)
];

const POSITION_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("face_to_face", "position", "face-to-face", "position", "Bodies are oriented face-to-face; preserve eye contact, closeness, and readable expressions when visible.", ["hug", "close-up"], [/\b(?:face[- ]to[- ]face|facing each other|eye contact|chest to chest)\b/i], "face-to-face positioning"),
  detail("standing_embrace", "position", "standing embrace", "position", "The characters are upright and close; do not add bed/floor mechanics unless separately established.", ["standing", "hug"], [/\b(?:standing|on their feet|against him|against her)\b.*\b(?:embrace|kiss|hold|press)/i, /\b(?:embrace|kiss|hold|press)\b.*\b(?:standing|on their feet)\b/i], "standing embrace positioning"),
  detail("against_wall", "position", "against a wall", "position", "One character is backed against a wall or vertical surface; keep wall support and upright framing consistent.", ["against wall", "standing"], [/\b(?:against|pinned to|backed against|pressed to)\s+(?:the\s+)?(?:wall|door|window|bookshelf)\b/i], "wall-supported positioning", true),
  detail("bed_edge", "position", "edge of bed", "position", "The action is staged at the bed edge; sitting/standing height differences may matter.", ["bed", "sitting"], [/\b(?:edge of the bed|bedside|sits? on the bed|sat on the bed)\b/i], "bed-edge positioning"),
  detail("on_back", "position", "lying on back", "position", "One character is on their back; preserve horizontal bed/floor support and top/bottom spatial relation.", ["lying", "on back"], [/\b(?:on (?:her|his|their|my|your) back|lies? back|laid back|flat on (?:the )?(?:bed|floor|sofa))\b/i], "lying-on-back positioning", true),
  detail("on_top", "position", "on top / straddling", "position", "One character is on top or straddling; preserve who has the upper visible position without assuming control over consent.", ["straddling", "on top"], [/\b(?:on top|straddl(?:e|es|ed|ing)|climb(?:s|ed|ing)? onto (?:his|her|their|your|my) lap|astride)\b/i], "on-top or straddling positioning", true),
  detail("under_partner", "position", "under partner", "position", "One character is underneath; keep the visual relation grounded without assigning internal feelings.", ["lying"], [/\b(?:under(?:neath)? (?:him|her|them|you|me)|beneath (?:him|her|them|you|me))\b/i], "under-partner positioning", true),
  detail("side_by_side", "position", "side-by-side", "position", "The characters are beside each other; preserve lateral intimacy and avoid flipping to face-to-face unless stated.", ["side by side", "lying"], [/\b(?:side by side|beside each other|lying beside|next to each other)\b/i], "side-by-side positioning"),
  detail("spooning", "position", "spooning", "position", "The characters are nested in the same direction; preserve behind/front orientation and close body contact.", ["spooning", "lying"], [/\b(?:spoon(?:s|ed|ing)?|from behind while lying|curled behind)\b/i], "spooning positioning", true),
  detail("from_behind", "position", "from behind", "position", "Behind/front orientation is established; preserve it and do not convert to face-to-face unless the text changes position.", ["from behind"], [/\b(?:from behind|behind (?:her|him|them|you|me)|back to (?:his|her|their|your|my) chest)\b/i], "from-behind positioning", true),
  detail("bent_over_surface", "position", "bent over support", "position", "A table, desk, counter, or other support is involved; preserve the support object and posture.", ["bent over", "table"], [/\b(?:bent over|lean(?:s|ed|ing)? over|braced against|hands? on (?:the )?(?:table|desk|counter|wall))\b/i], "bent-over/support positioning", true),
  detail("seated_lap", "position", "seated in lap", "position", "The scene is lap-seated; preserve seated support, closeness, and overlapping silhouettes.", ["sitting", "lap pillow"], [/\b(?:in (?:his|her|their|your|my) lap|on (?:his|her|their|your|my) lap|lap)\b/i], "lap-seated positioning"),
  detail("chair_position", "position", "chair / seated furniture", "position", "A chair or seat is central to the pose; keep furniture support visible when relevant.", ["sitting", "chair"], [/\b(?:chair|armchair|sofa|couch|bench)\b.*\b(?:kiss|touch|lap|straddl|intimate|sex)/i, /\b(?:kiss|touch|lap|straddl|intimate|sex)\b.*\b(?:chair|armchair|sofa|couch|bench)\b/i], "seated furniture positioning"),
  detail("kneeling", "position", "kneeling", "position", "A kneeling posture is visible; preserve low/high body levels and support surface.", ["kneeling"], [/\b(?:kneel(?:s|ed|ing)?|on (?:her|his|their|your|my) knees)\b/i], "kneeling positioning", true),
  detail("floor_position", "position", "on the floor", "position", "The scene has moved to the floor; preserve floor-level composition instead of reverting to bed.", ["floor", "lying"], [/\b(?:on the floor|onto the floor|floorboards?|rug|tatami)\b.*\b(?:kiss|touch|intimate|sex|lie|lying)/i, /\b(?:kiss|touch|intimate|sex|lie|lying)\b.*\b(?:on the floor|floorboards?|rug|tatami)\b/i], "floor-level positioning"),
  detail("shower_standing", "position", "standing shower", "position", "A shower/bathing posture is involved; preserve wet skin, standing support, and bathroom context if visible.", ["shower", "standing", "wet"], [/\b(?:shower|under the water|bathroom tiles)\b.*\b(?:kiss|touch|intimate|sex|standing)/i, /\b(?:kiss|touch|intimate|sex|standing)\b.*\b(?:shower|under the water|bathroom tiles)\b/i], "shower standing positioning", true),
  detail("bath_position", "position", "bath / tub", "position", "A bath or tub is involved; preserve waterline, seated/reclined support, and wet environment.", ["bath", "wet"], [/\b(?:bathtub|bath|tub|in the water)\b.*\b(?:kiss|touch|intimate|together|sex)/i], "bath/tub positioning", true)
];

const ORIENTATION_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("front_to_front", "orientation", "front-to-front orientation", "position", "Front-to-front orientation is established; keep faces and expressions available when visible.", ["face-to-face"], [/\b(?:front to front|face to face|facing each other|chest to chest)\b/i], "front-to-front orientation"),
  detail("back_to_chest", "orientation", "back-to-chest orientation", "position", "Back-to-chest orientation is established; preserve behind/front staging.", ["from behind"], [/\b(?:back to (?:his|her|their|your|my) chest|against (?:his|her|their|your|my) chest|spooning)\b/i], "back-to-chest orientation"),
  detail("side_orientation", "orientation", "side orientation", "position", "Side orientation is established; preserve lateral visibility and avoid flipping sides without cue.", ["side by side"], [/\b(?:sideways|on (?:her|his|their|your|my) side|side by side)\b/i], "side orientation")
];

const SUPPORT_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("bed_support", "support", "bed support", "scene", "A bed supports the scene; keep sheets, pillows, or mattress context available.", ["bed"], [/\b(?:bed|mattress|sheets?|pillow|blanket)\b/i], "bed support"),
  detail("wall_support", "support", "wall/door support", "scene", "A vertical surface supports the pose; preserve upright leverage and close framing.", ["against wall"], [/\b(?:wall|door|window|bookshelf)\b/i], "wall or door support"),
  detail("table_support", "support", "table/desk/counter support", "scene", "A horizontal surface supports hands or body position; preserve this object in the staging.", ["table"], [/\b(?:table|desk|counter|vanity|dresser)\b/i], "table or desk support"),
  detail("water_support", "support", "water/bath support", "scene", "Water is part of the support/environment; preserve wetness and bath/shower context if the image shows it.", ["wet"], [/\b(?:bath|bathtub|shower|water|pool|hot spring)\b/i], "water support")
];

const CONTACT_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("kissing_contact", "contact", "kissing", "beat", "Kissing is the active contact; preserve it only while currently visible or mentioned.", ["kiss"], [/\b(?:kiss(?:es|ed|ing)?|make out|making out|lips? (?:meet|brush|touch))\b/i], "kissing contact"),
  detail("neck_kiss", "contact", "neck kissing", "beat", "Neck kissing is established; keep it as a short-lived contact detail.", ["kiss", "neck"], [/\b(?:neck kiss|kiss(?:es|ed|ing)? (?:her|his|their|your|my) neck|mouth at (?:her|his|their|your|my) neck)\b/i], "neck-kissing contact", true),
  detail("hand_holding", "contact", "hand holding", "beat", "Hand contact is established; it can coexist with other details without implying escalation.", ["holding hands"], [/\b(?:hold(?:s|ing)? hands?|take(?:s)? (?:her|his|their|your|my) hand|fingers interlace)\b/i], "hand-holding contact"),
  detail("waist_hold", "contact", "waist/hip hold", "beat", "Hands at waist or hips are established; preserve visible hand placement if relevant.", ["hand on hip"], [/\b(?:hands? (?:on|at) (?:her|his|their|your|my) (?:waist|hips?)|grips? (?:her|his|their|your|my) (?:waist|hips?))\b/i], "waist or hip contact", true),
  detail("thigh_touch", "contact", "thigh touch", "beat", "Thigh contact is established; keep it consent-aware and visually grounded.", ["hand on thigh"], [/\b(?:hands? (?:on|at|over) (?:her|his|their|your|my) thighs?|touch(?:es|ed|ing)? (?:her|his|their|your|my) thighs?)\b/i], "thigh contact", true),
  detail("full_body_contact", "contact", "full-body contact", "position", "Close body contact is established; preserve proximity without adding hidden sensation.", ["hug", "intimate"], [/\b(?:pressed together|body to body|full[- ]body contact|skin to skin|against each other)\b/i], "full-body contact", true),
  detail("oral_contact", "contact", "oral sex contact", "beat", "Oral contact is explicitly established; track it as adult-only and short-lived unless repeated.", [], [/\b(?:oral sex|go(?:es|ing)? down on|between (?:her|his|their|your|my) thighs|mouth on (?:her|his|their|your|my))\b/i], "oral sex contact", true),
  detail("penetrative_contact", "contact", "penetrative contact", "beat", "Penetrative contact is explicitly established; track it as adult-only and avoid adding extra mechanics not present in text.", [], [/\b(?:penetrat(?:e|es|ed|ing|ion)|inside (?:her|him|them|you|me)|enters? (?:her|him|them|you|me)|intercourse)\b/i], "penetrative contact", true),
  detail("mutual_touch", "contact", "mutual touching", "beat", "Both characters are participating in touch; keep agency and consent explicit.", ["intimate"], [/\b(?:touch(?:ing)? each other|hands everywhere|mutual(?:ly)?|each other's bodies)\b/i], "mutual touch", true)
];

const MOTION_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("slow_pace", "motion", "slow pace", "beat", "The pace is slow; avoid sudden escalation or frantic movement.", [], [/\b(?:slow(?:ly)?|gentle(?:ly)?|careful(?:ly)?|unhurried|take(?:s)? (?:it|this) slow)\b/i], "slow/gentle pacing"),
  detail("urgent_pace", "motion", "urgent pace", "beat", "The pace is urgent; keep it adult, consensual, and grounded rather than chaotic.", ["motion blur"], [/\b(?:urgent(?:ly)?|hungry|rough breath|frantic|desperate|hard and fast|quickens?)\b/i], "urgent pacing", true),
  detail("rocking_motion", "motion", "rocking motion", "beat", "A rocking rhythm is described; it is a short-lived motion detail.", [], [/\b(?:rock(?:s|ed|ing)?|roll(?:s|ed|ing)? (?:her|his|their|your|my) hips|rhythm|moves? together)\b/i], "rocking/rhythm motion", true),
  detail("stillness", "motion", "stillness / pause", "instant", "A pause or stillness is present; preserve the beat rather than escalating immediately.", [], [/\b(?:go(?:es)? still|holds? still|pauses?|freezes?|stops? moving)\b/i], "stillness or pause")
];

const CLOTHING_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("partially_dressed", "clothing", "partially dressed", "scene", "Some clothing remains; preserve partial coverage unless explicitly removed.", ["open clothes", "partially undressed"], [/\b(?:partially dressed|half[- ]dressed|shirt open|open clothes|still wearing|clothes askew|clothing askew)\b/i], "partial clothing state", true),
  detail("underwear_visible", "clothing", "underwear visible", "scene", "Underwear is visible; preserve it as clothing coverage, not nudity.", ["underwear"], [/\b(?:underwear|bra|panties|boxers|lingerie)\b/i], "underwear visibility", true),
  detail("nude_state", "clothing", "nude / naked", "scene", "Nudity is established; keep it adult-only and do not add extra body-detail tags unless visually asked later.", ["naked"], [/\b(?:nude|naked|bare skin|undressed completely|without clothes)\b/i], "nude or naked state", true),
  detail("clothes_removed", "clothing", "clothes being removed", "beat", "Clothing removal is happening now; treat it as reversible and consent-aware.", ["undressing"], [/\b(?:takes? off|slips? off|pulls? off|unbuttons?|unzips?|removes? (?:her|his|their|your|my) clothes|strip(?:s|ped|ping)?)\b/i], "clothing removal action", true)
];

const BARRIER_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("blanket_barrier", "barrier", "blanket/sheet coverage", "scene", "A blanket or sheet covers part of the scene; preserve coverage rather than over-specifying bodies.", ["blanket", "under covers"], [/\b(?:blanket|sheet|under the covers|covered by)\b/i], "blanket/sheet barrier"),
  detail("clothing_barrier", "barrier", "clothing barrier", "scene", "Clothing remains between bodies; do not assume full nudity or direct contact.", ["clothed sex"], [/\b(?:through (?:her|his|their|your|my) clothes|clothes between|still dressed|over (?:her|his|their|your|my) clothes)\b/i], "clothing barrier", true),
  detail("condom_barrier", "barrier", "protection mentioned", "encounter", "Protection is mentioned; preserve it as an encounter-level safety fact.", [], [/\b(?:condom|protection|protected sex)\b/i], "protection/condom mention", true)
];

const SETTING_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("private_bedroom", "setting", "private bedroom", "scene", "The scene is private and bedroom-like; preserve private-room context.", ["bedroom", "indoors"], [/\b(?:bedroom|private room|their room|her room|his room)\b/i], "private bedroom setting"),
  detail("bathroom_setting", "setting", "bathroom / shower", "scene", "Bathroom or shower setting is established; preserve water, tile, mirror, or steam cues when visible.", ["bathroom", "wet"], [/\b(?:bathroom|shower|bathtub|steam|tiles?|mirror)\b/i], "bathroom/shower setting"),
  detail("public_risk", "setting", "privacy risk", "beat", "The scene has a privacy-risk cue; avoid escalating in a way that ignores exposure or consent.", [], [/\b(?:someone could see|public|hallway|balcony|open door|not private|anyone could walk in)\b/i], "privacy-risk setting", true)
];

const CAMERA_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("close_framing", "camera", "close framing", "instant", "Close framing is established; focus on faces, hands, and readable body placement.", ["close-up"], [/\b(?:close[- ]up|tight framing|close framing|near shot)\b/i], "close camera framing"),
  detail("hands_framing", "camera", "hands emphasized", "instant", "Hands are emphasized; preserve visible hand placement over broader mechanics.", ["hands"], [/\b(?:hands? visible|focus(?:es)? on (?:her|his|their|your|my) hands?|hand close[- ]up)\b/i], "hands-focused framing"),
  detail("silhouette_framing", "camera", "silhouette / covered framing", "instant", "Silhouette or covered framing is established; prefer suggestion over explicit body detail.", ["silhouette", "backlighting"], [/\b(?:silhouette|shadowed|under the covers|covered shot|tasteful framing|non[- ]graphic)\b/i], "silhouette or covered framing")
];

const AFTERCARE_DETAIL_CARDS: SexSceneDetailCard[] = [
  detail("check_in_aftercare", "aftercare", "verbal check-in", "aftercare", "Aftercare check-in is established; keep emotional safety and comfort central.", [], [/\b(?:are you okay|was that okay|do you need anything|how do you feel|checks? in)\b/i], "aftercare check-in", true),
  detail("cuddling_aftercare", "aftercare", "cuddling", "aftercare", "Cuddling is established after intimacy; preserve comfort, warmth, and stillness.", ["cuddling", "after sex"], [/\b(?:cuddle(?:s|d|ing)?|held each other|holds? (?:her|him|them|you|me) close|wrapped in (?:a )?blanket)\b/i], "cuddling aftercare", true),
  detail("clean_up_aftercare", "aftercare", "cleanup / water", "aftercare", "Cleanup or water is part of aftermath; preserve practical tenderness without returning to active sex.", [], [/\b(?:clean(?:s|ed|ing)? up|towel|wash(?:es|ed|ing)?|brings? water|glass of water)\b/i], "cleanup or water aftercare", true)
];

const SEX_SCENE_SUB_AGENTS: SexSceneSubAgent[] = [
  { id: "consent_detail_agent", facet: "consent", cards: CONSENT_DETAIL_CARDS, maxMatches: 2 },
  { id: "phase_detail_agent", facet: "phase", cards: PHASE_DETAIL_CARDS, maxMatches: 2 },
  { id: "position_detail_agent", facet: "position", cards: POSITION_DETAIL_CARDS, maxMatches: 3 },
  { id: "orientation_detail_agent", facet: "orientation", cards: ORIENTATION_DETAIL_CARDS, maxMatches: 2 },
  { id: "support_detail_agent", facet: "support", cards: SUPPORT_DETAIL_CARDS, maxMatches: 3 },
  { id: "contact_detail_agent", facet: "contact", cards: CONTACT_DETAIL_CARDS, maxMatches: 4 },
  { id: "motion_detail_agent", facet: "motion", cards: MOTION_DETAIL_CARDS, maxMatches: 2 },
  { id: "clothing_detail_agent", facet: "clothing", cards: CLOTHING_DETAIL_CARDS, maxMatches: 3 },
  { id: "barrier_detail_agent", facet: "barrier", cards: BARRIER_DETAIL_CARDS, maxMatches: 2 },
  { id: "setting_detail_agent", facet: "setting", cards: SETTING_DETAIL_CARDS, maxMatches: 2 },
  { id: "camera_detail_agent", facet: "camera", cards: CAMERA_DETAIL_CARDS, maxMatches: 2 },
  { id: "aftercare_detail_agent", facet: "aftercare", cards: AFTERCARE_DETAIL_CARDS, maxMatches: 2 }
];

function detail(
  id: string,
  facet: SexSceneFacetId,
  label: string,
  lifetime: SexSceneDetailLifetime,
  promptView: string,
  visualTags: string[],
  patterns: RegExp[],
  evidenceLabel: string,
  adultOnly = false,
  suppressWithBoundary = false
): SexSceneDetailCard {
  return {
    id,
    facet,
    label,
    lifetime,
    promptView,
    visualTags,
    patterns,
    evidenceLabel,
    adultOnly,
    suppressWithBoundary
  };
}
