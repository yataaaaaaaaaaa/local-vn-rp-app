import type { StoryNodeFields } from "@local-vn/story-domain";

import { normalizeContextSnippet, splitSentences } from "../text/text-utils";
import { selectRomanceBeat, type CandidateScoringContext } from "../novelty/candidate-scoring";
import { PLAYER_RESPONSE_BEATS } from "../novelty/player-beat-deck";
import { latestPreviousTurnFromContext, previousTurnCount } from "../state/story-context";
import type { AdvancementCard, RomanceClicheFacet, RomanceClicheNoveltyContext, RomancePhase, RpPromptInput } from "../types";
import { promptInputFromAgentRun } from "./agent-run-helpers";
import type { AgentNoveltyCandidate, AgentNote, RpAgent } from "./types";

type RomancePromptView = CandidateScoringContext & {
  closenessLabel: string;
  phaseLabel: string;
  openHook: string;
  clicheDetailSummary: string;
  clicheDetailLifetimes: string[];
  clicheTargetFacets: string[];
  clicheFamilies: string[];
  clicheNoveltyInstruction: string;
};

type ClicheFacetDefinition = Omit<RomanceClicheFacet, "observed"> & {
  patterns: RegExp[];
};

type ClosenessLevel = {
  level: number;
  label: string;
  description: string;
};

export const ROMANCE_AGENT: RpAgent = {
  id: "romance_agent",
  run(input) {
    const promptInput = promptInputFromAgentRun(input);
    const romance = estimateRomancePromptView(promptInput);

    return {
      facts: {
        romance_state: romancePromptViewToText(romance),
        romance_cliche_state: romance.romanceCliches?.detailSummary ?? "No romantic-cliche facets are currently selected.",
        romance_cliche_detail_lifetimes: romance.romanceCliches?.detailLifetimes ?? [],
        romance_cliche_targets: romance.romanceCliches?.targetFacets ?? [],
        romance_cliche_families: romance.romanceCliches?.families ?? []
      },
      fixedTags: [],
      promptViews: {
        romance
      },
      novelty: {
        context: romancePromptViewToNoveltyContext(romance)
      },
      notes: romanceNotes(romance),
      candidates: romanceClicheCandidates(romance)
    };
  }
};

function romanceNotes(state: RomancePromptView): AgentNote[] {
  return [
    {
      source: "romance",
      text: [
        `phase=${state.phaseLabel}`,
        `closeness=${state.closeness}/10 (${state.closenessLabel})`,
        `tension=${state.currentTension}`,
        `callback=${state.callbackDetail}`,
        `cliche facets=${state.romanceCliches?.targetFacets.join(", ") || "none"}`,
        state.boundaryDetected ? "boundary language is present" : "no active boundary detected"
      ].join("; ")
    }
  ];
}

function romanceClicheCandidates(state: RomancePromptView): AgentNoveltyCandidate[] {
  const facets = state.romanceCliches?.facets ?? [];
  return facets.slice(0, 8).map((facet) => ({
    id: `romance-cliche:${facet.facet}`,
    source: "romance_cliche",
    weight: facet.observed ? 0.85 : 0.55,
    label: facet.label,
    text: [
      `Use one romantic-cliché redirect (${facet.label}): ${facet.directive}`,
      `Constraint: ${facet.constraint}`,
      `Avoid: ${facet.avoid}`,
      "Use it as the only new romantic trope this turn."
    ].join(" "),
    rationale: `Romance cliche candidate from ${facet.family} facet during ${state.phaseLabel}.`,
  }));
}

export function romanceAdvancementDeck(): AdvancementCard[] {
  return ROMANCE_BEATS;
}

export function playerResponseAdvancementDeck(): AdvancementCard[] {
  return PLAYER_RESPONSE_BEATS;
}

export function selectVisualRomanceAdvancement(input: RpPromptInput, context: CandidateScoringContext): AdvancementCard {
  return selectRomanceBeat(input, VISUAL_ROMANCE_BEATS, context);
}

function estimateRomancePromptView(input: RpPromptInput): RomancePromptView {
  const text = [input.node.context, input.node.userText, input.node.dialogue, input.node.visualDescription]
    .join("\n")
    .toLowerCase();
  const turnCount = previousTurnCount(input.node.context || "");
  let closeness = Math.min(10, Math.floor(turnCount / 5));

  const cues: Array<[RegExp, number]> = [
    [/\b(?:stranger|first met|just met|unknown|customer|client)\b/i, 1],
    [/\b(?:smile|tease|joke|banter|compliment|curious|laugh)\b/i, 2],
    [/\b(?:flirt|blush|lingering|closer|chemistry|tension)\b/i, 3],
    [/\b(?:hand|touch|sleeve|shoulder|near|close|leans?|gaze)\b/i, 4],
    [/\b(?:trust|honest|truth|afraid|vulnerable|stay|remembered|promise)\b/i, 5],
    [/\b(?:hold|held|embrace|kiss|near-kiss|almost kiss|come closer)\b/i, 6],
    [/\b(?:confess|confession|want you|desire|love|choose me|stay with me)\b/i, 7],
    [/\b(?:adult|intimate|bed|undress|fade to black|aftercare|consent)\b/i, 8],
    [/\b(?:afterward|morning after|together|commit|forever|goodbye|epilogue)\b/i, 9]
  ];

  for (const [pattern, level] of cues) {
    if (pattern.test(text)) closeness = Math.max(closeness, level);
  }

  if (detectPacingBoundaryCue(text)) {
    closeness = Math.min(closeness, 6);
  }

  closeness = clampInteger(closeness, 0, 10);
  const phase = phaseForCloseness(closeness, turnCount);
  const boundaryDetected = Boolean(input.boundaryDetected) || detectPacingBoundaryCue(text);
  const callbackDetail = inferCallbackDetail(input.node);
  const romanceCliches = extractRomanticClicheState(text, closeness, phase, boundaryDetected, callbackDetail);

  return {
    closeness,
    closenessLabel: closenessLabel(closeness),
    phase,
    phaseLabel: PHASE_LABELS[phase],
    currentTension: inferCurrentTension(text),
    openHook: inferOpenHook(input.node),
    callbackDetail,
    boundaryDetected,
    romanceCliches,
    clicheDetailSummary: romanceCliches.detailSummary,
    clicheDetailLifetimes: romanceCliches.detailLifetimes,
    clicheTargetFacets: romanceCliches.targetFacets,
    clicheFamilies: romanceCliches.families,
    clicheNoveltyInstruction: romanceCliches.noveltyInstruction
  };
}

function romancePromptViewToText(state: RomancePromptView): string {
  return [
    `phase: ${state.phaseLabel}`,
    `closeness: ${state.closeness} / 10 (${state.closenessLabel})`,
    `current tension: ${state.currentTension}`,
    `open hook: ${state.openHook}`,
    `callback detail: ${state.callbackDetail}`,
    `romantic cliche facets: ${state.romanceCliches?.detailSummary ?? "(none)"}`,
    `romantic cliche lifetimes: ${state.romanceCliches?.detailLifetimes.join("; ") || "(none)"}`,
    state.boundaryDetected ? "boundary language is present" : "no active boundary detected"
  ].join("\n");
}

function romancePromptViewToNoveltyContext(state: RomancePromptView): CandidateScoringContext {
  return {
    closeness: state.closeness,
    phase: state.phase,
    currentTension: state.currentTension,
    callbackDetail: state.callbackDetail,
    boundaryDetected: state.boundaryDetected,
    romanceCliches: state.romanceCliches
  };
}

export function extractRomanticClicheState(
  text: string,
  closeness = 3,
  phase: RomancePhase = "charge",
  boundaryDetected = false,
  callbackDetail = "(none)"
): RomanceClicheNoveltyContext {
  const available = ROMANTIC_CLICHE_FACETS.filter((facet) => {
    if (boundaryDetected && !facet.tags.includes("repair") && facet.tags.some((tag) => tag === "touch" || tag === "kiss" || tag === "jealousy")) return false;
    return facet.minCloseness <= closeness + 1 && facet.phases.includes(phase);
  });

  const observed = ROMANTIC_CLICHE_FACETS.filter((facet) => facet.patterns.some((pattern) => pattern.test(text)));
  const source = observed.length ? observed : available;
  const targetPool = source.length ? source : ROMANTIC_CLICHE_FACETS.filter((facet) => facet.minCloseness <= closeness + 1);
  const facets = targetPool.slice(0, 12).map((facet) => toObservedFacet(facet, observed.some((item) => item.facet === facet.facet)));
  const persistentDetails = facets
    .filter((facet) => facet.lifetime === "scene" || facet.lifetime === "relationship" || facet.lifetime === "arc")
    .map((facet) => `${facet.family}:${facet.label} [${facet.lifetime}]`);
  const beatDetails = facets
    .filter((facet) => facet.lifetime === "instant" || facet.lifetime === "beat")
    .map((facet) => `${facet.family}:${facet.label} [${facet.lifetime}]`);
  const detailLifetimes = [...persistentDetails, ...beatDetails];
  const targetFacets = facets.slice(0, 6).map((facet) => `${facet.family}:${facet.label}`);
  const families = [...new Set(facets.map((facet) => facet.family))];
  const callback = callbackDetail && callbackDetail !== "(none)" ? ` Callback available: ${callbackDetail}.` : "";

  return {
    active: facets.length > 0,
    detailSummary: facets.length
      ? facets.map((facet) => `${facet.family}=${facet.label}${facet.observed ? " (observed)" : ""}`).join("; ")
      : "No romantic-cliche facets are currently selected.",
    detailLifetimes,
    facets,
    targetFacets,
    persistentDetails,
    beatDetails,
    noveltyInstruction: facets.length
      ? `Use at most one romantic cliche facet as the novelty lever; preserve scene/relationship/arc lifetime details unless the current text explicitly changes them.${callback}`
      : `No romantic cliche facet is active; use ordinary romance novelty.${callback}`,
    families
  };
}

function toObservedFacet(facet: ClicheFacetDefinition, observed: boolean): RomanceClicheFacet {
  const { patterns, ...rest } = facet;
  return { ...rest, observed };
}

function phaseForCloseness(closeness: number, turnCount: number): RomancePhase {
  if (closeness >= 9 || turnCount >= 42) return "resolution";
  if (closeness >= 8) return "intimacy";
  if (closeness >= 7) return "threshold";
  if (closeness >= 5) return "trust";
  if (closeness >= 3) return "charge";
  return "spark";
}

function closenessLabel(level: number): string {
  const match = CLOSENESS_LEVELS.find((item) => item.level === level) ?? CLOSENESS_LEVELS[0]!;
  return match.label + " - " + match.description;
}

function inferCurrentTension(text: string): string {
  if (detectPacingBoundaryCue(text)) return "boundary, pace, or consent needs attention";
  if (/\b(?:kiss|want|desire|close|touch|hand|stay)\b/i.test(text)) return "romantic closeness is available but must remain chosen";
  if (/\b(?:truth|honest|afraid|trust|promise|remember)\b/i.test(text)) return "emotional honesty and trust are active";
  if (/\b(?:tease|joke|smile|banter|compliment)\b/i.test(text)) return "playful attraction and subtext are active";
  return "early rapport and curiosity";
}

function detectPacingBoundaryCue(text: string): boolean {
  return /\b(?:stop|halt|wait|pause|no|don't|do not|not comfortable|uncomfortable|slow down|too fast|boundary|not yet|later)\b/i.test(text);
}

function inferOpenHook(node: StoryNodeFields): string {
  const latest = latestPreviousTurnFromContext(node.context || "") || node.dialogue || node.userText || "";
  const normalized = normalizeContextSnippet(latest);

  if (!normalized) return "(none)";

  const sentences = splitSentences(normalized);
  return sentences.at(-1)?.slice(0, 180) || normalized.slice(0, 180);
}

function inferCallbackDetail(node: StoryNodeFields): string {
  const text = [node.context, node.visualDescription]
    .join("\n")
    .replace(/\b(?:the|and|that|with|from|this|there|their|your|hers?|him|she|he|you|they)\b/gi, " ");
  const candidates = [
    ...text.matchAll(/\b(?:ring|ribbon|book|letter|coat|glove|door|window|rain|candle|lantern|table|flower|necklace|sword|cup|scar|mark|promise|joke|name|hand)\b/gi)
  ].map((match) => match[0].toLowerCase());
  const unique = [...new Set(candidates)];

  return unique.slice(-3).join(", ") || "(none)";
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

const CLOSENESS_LEVELS: ClosenessLevel[] = [
  { level: 0, label: "No bond", description: "Strangers, cold start, or purely transactional contact." },
  { level: 1, label: "Awareness", description: "They notice each other; mild curiosity is plausible." },
  { level: 2, label: "Rapport", description: "Basic comfort, early warmth, and light friction are plausible." },
  { level: 3, label: "Flirt signal", description: "Playful tension, ambiguous attraction, and banter are plausible." },
  { level: 4, label: "Mutual charge", description: "Romantic tension is visible, but trust is still limited." },
  { level: 5, label: "Trust opening", description: "Small vulnerability, emotional honesty, or boundary checks are plausible." },
  { level: 6, label: "Chosen closeness", description: "Gentle closeness is plausible if clearly agency-preserving." },
  { level: 7, label: "Romantic threshold", description: "Near-confession, near-kiss, or a direct romantic choice is plausible." },
  { level: 8, label: "Intimate invitation", description: "Adult desire or intimacy invitation is plausible only with clear consent and adult framing." },
  { level: 9, label: "Intimate bond", description: "Adult intimacy, aftermath, aftercare, or deep vulnerability may be plausible if already chosen." },
  { level: 10, label: "Resolution", description: "Commitment, closure, goodbye, promise, or final callback payoff." }
];

const PHASE_LABELS: Record<RomancePhase, string> = {
  spark: "Spark: attention, rapport, light attraction",
  charge: "Charge: chemistry, subtext, romantic tension",
  trust: "Trust test: vulnerability, boundary, meaningful choice",
  threshold: "Threshold: near-confession, invitation, chosen closeness",
  intimacy: "Intimacy: adult consensual escalation or fade-to-black threshold",
  resolution: "Resolution: aftermath, promise, final callback, closure"
};

const ROMANTIC_CLICHE_FACETS: ClicheFacetDefinition[] = [
  {
    facet: "locked_gaze",
    label: "locked eye contact",
    family: "gaze",
    lifetime: "instant",
    minCloseness: 1,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "gaze", "subtext", "low-intensity"],
    directive: "Use eye contact, a held look, or a look-away as the romantic action instead of adding plot noise.",
    constraint: "The gaze must not declare the player's feelings; it only creates an opening.",
    avoid: "Do not loop the same blush-and-stare beat.",
    patterns: [/\b(?:eyes? meet|held (?:his|her|their) gaze|locked eyes|looked away|could not look away|caught (?:him|her|them) staring)\b/i]
  },
  {
    facet: "shared_shelter",
    label: "shared umbrella or shelter",
    family: "weather",
    lifetime: "scene",
    minCloseness: 2,
    phases: ["spark", "charge", "trust", "threshold"],
    tags: ["cliche", "shelter", "proximity", "setting"],
    directive: "Use a rain, snow, wind, or doorway shelter setup to make closeness practical before it becomes emotional.",
    constraint: "Shelter may narrow distance, but it must not force touch or acceptance.",
    avoid: "Do not add sudden weather if the scene already has a different stable setting.",
    patterns: [/\b(?:umbrella|rain|downpour|storm|snow|shared shelter|under the awning|doorway|porch|coat over)\b/i]
  },
  {
    facet: "accidental_touch",
    label: "accidental hand brush",
    family: "touch",
    lifetime: "instant",
    minCloseness: 2,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "touch", "spark", "agency"],
    directive: "Use one brief accidental brush of hands, sleeves, shoulders, or reaching for the same object as a spark.",
    constraint: "Make it brief and reversible; do not decide the player's reaction.",
    avoid: "Do not escalate the accidental touch into guaranteed desire.",
    patterns: [/\b(?:hands? brush|fingers? brush|same cup|same book|same object|reached at the same time|shoulders? bump|sleeves? touch)\b/i]
  },
  {
    facet: "fixing_detail",
    label: "fixing hair, ribbon, collar, or tie",
    family: "care",
    lifetime: "beat",
    minCloseness: 3,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "care", "proximity", "touch"],
    directive: "Use a tiny grooming or clothing adjustment as a permission-aware excuse for closeness.",
    constraint: "Ask, hover, or offer before touching; preserve refusal and redirect options.",
    avoid: "Do not make the player passive or silently consenting.",
    patterns: [/\b(?:fix(?:es|ed|ing)? (?:his|her|their|your)? ?(?:hair|ribbon|collar|tie|scarf|button)|brush(?:es|ed)? (?:hair|lint|dust)|straighten(?:s|ed)? (?:collar|tie|scarf))\b/i]
  },
  {
    facet: "offer_warmth",
    label: "offered coat, blanket, or warmth",
    family: "care",
    lifetime: "scene",
    minCloseness: 2,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "care", "comfort", "setting"],
    directive: "Use an offered coat, blanket, warm drink, or seat near warmth as practical tenderness.",
    constraint: "Offer care without implying ownership or deciding the player's comfort.",
    avoid: "Do not turn protective care possessive.",
    patterns: [/\b(?:coat|blanket|shawl|scarf|warm drink|tea|coffee|fireplace|warmth|shivering|cold)\b/i]
  },
  {
    facet: "shared_drink",
    label: "shared drink or dessert",
    family: "domestic",
    lifetime: "scene",
    minCloseness: 2,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "domestic", "banter", "low-intensity"],
    directive: "Use tea, coffee, dessert, or a shared cup as a soft route into teasing or honesty.",
    constraint: "Keep it conversational and grounded in the current setting.",
    avoid: "Do not make the shared object magical proof of destiny.",
    patterns: [/\b(?:tea|coffee|cup|glass|dessert|cake|spoon|shared drink|sip|taste this)\b/i]
  },
  {
    facet: "walk_home",
    label: "walk home or escort offer",
    family: "transition",
    lifetime: "scene",
    minCloseness: 3,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "care", "transition", "choice"],
    directive: "Use an offer to walk together, wait together, or escort as a low-pressure transition beat.",
    constraint: "The player must be able to decline, walk separately, or redirect the destination.",
    avoid: "Do not trap the player into being alone.",
    patterns: [/\b(?:walk (?:you )?home|escort|go with you|wait with you|see you home|take you back|path home)\b/i]
  },
  {
    facet: "private_dance",
    label: "private dance or guided step",
    family: "movement",
    lifetime: "scene",
    minCloseness: 4,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "dance", "proximity", "choice"],
    directive: "Use a dance, guided step, or near-dance as a mutual rhythm test.",
    constraint: "Frame it as an invitation, not a completed acceptance.",
    avoid: "Do not describe the player's body moving unless the player chose it.",
    patterns: [/\b(?:dance|waltz|music|guide(?:s|d)? (?:his|her|their|your)? ?step|hand at (?:his|her|their|your)? ?waist)\b/i]
  },
  {
    facet: "almost_kiss",
    label: "almost kiss",
    family: "threshold",
    lifetime: "beat",
    minCloseness: 5,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["cliche", "kiss", "restraint", "consent"],
    directive: "Use an almost-kiss, pause before a kiss, or stopped-short closeness as a consent-aware threshold.",
    constraint: "Do not complete the kiss unless consent is already explicit in context or the user authored it.",
    avoid: "Do not repeat almost-kiss interruptions every turn.",
    patterns: [/\b(?:almost kiss(?:es)?|near-kiss|nearly kiss(?:es)?|lips? almost|stopp(?:ed|ing) short|paused before (?:the )?kiss|not quite kissing)\b/i]
  },
  {
    facet: "caught_stumble",
    label: "caught from a stumble",
    family: "support",
    lifetime: "instant",
    minCloseness: 2,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "support", "touch", "care"],
    directive: "Use catching, steadying, or bracing from a stumble as a brief support beat.",
    constraint: "Keep the support practical and immediately releasable.",
    avoid: "Do not injure or endanger characters just to force closeness.",
    patterns: [/\b(?:stumble|trip|catch(?:es|ing)?|steady(?:ing|ies|ied)|brace(?:s|d)?|grabbed (?:his|her|their)? ?arm)\b/i]
  },
  {
    facet: "sleepy_vigil",
    label: "sleepy vigil or staying up",
    family: "care",
    lifetime: "scene",
    minCloseness: 5,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "care", "vulnerability", "quiet"],
    directive: "Use staying nearby, keeping watch, or refusing to leave as quiet care.",
    constraint: "Do not make care surveillance or control; keep it offered and gentle.",
    avoid: "Do not make the player helpless.",
    patterns: [/\b(?:stay up|kept watch|sat beside|fell asleep beside|dozed|vigil|would not leave|kept (?:him|her|them) company)\b/i]
  },
  {
    facet: "domestic_tenderness",
    label: "ordinary domestic tenderness",
    family: "domestic",
    lifetime: "scene",
    minCloseness: 4,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "domestic", "care", "softness"],
    directive: "Use cooking, tidying, washing cups, sharing a table, or a quiet routine as intimacy without spectacle.",
    constraint: "Keep the detail small and grounded; do not imply permanent commitment unless resolution is active.",
    avoid: "Do not turn the scene into a montage.",
    patterns: [/\b(?:cook|breakfast|kitchen|dishes|laundry|fold(?:ing)?|table|home|domestic|morning light|shared meal)\b/i]
  },
  {
    facet: "token_exchange",
    label: "keepsake or token exchange",
    family: "callback",
    lifetime: "relationship",
    minCloseness: 4,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "callback", "gift", "memory"],
    directive: "Use a ribbon, ring, flower, book, note, glove, or other established token as a romantic memory anchor.",
    constraint: "Prefer an existing object; if introducing a token, keep it small and scene-plausible.",
    avoid: "Do not invent a grand heirloom or promise ring out of nowhere.",
    patterns: [/\b(?:ring|ribbon|flower|book|letter|note|glove|necklace|keepsake|token|gift|promise)\b/i]
  },
  {
    facet: "name_softening",
    label: "name softening or nickname",
    family: "dialogue",
    lifetime: "relationship",
    minCloseness: 3,
    phases: ["charge", "trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "dialogue", "recognition", "intimacy"],
    directive: "Use a first name, softened title, or nickname as the sign that the dynamic changed.",
    constraint: "Only use a nickname if it fits the established tone and does not insult the player.",
    avoid: "Do not overuse pet names.",
    patterns: [/\b(?:first name|nickname|called (?:him|her|them) by name|said (?:his|her|their) name|softened (?:his|her|their) name)\b/i]
  },
  {
    facet: "mild_jealousy",
    label: "mild jealousy without ownership",
    family: "friction",
    lifetime: "beat",
    minCloseness: 5,
    phases: ["trust", "threshold"],
    tags: ["cliche", "jealousy", "friction", "choice"],
    directive: "Use a tiny flicker of jealousy as vulnerability, then immediately make room for honesty or reassurance.",
    constraint: "Jealousy must never become ownership, accusation, stalking, or punishment.",
    avoid: "Do not introduce a rival character just to trigger jealousy.",
    patterns: [/\b(?:jealous|envy|rival|someone else|looked at them|possessive|mine)\b/i]
  },
  {
    facet: "reunion_pause",
    label: "reunion pause",
    family: "transition",
    lifetime: "beat",
    minCloseness: 4,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "reunion", "restraint", "emotion"],
    directive: "Use the first second after seeing each other again as the whole romantic beat.",
    constraint: "Keep it compact; one look, one unfinished line, or one offered step is enough.",
    avoid: "Do not summarize the whole separation.",
    patterns: [/\b(?:again|returned|came back|reunion|after so long|first saw|at the station|at the gate)\b/i]
  },
  {
    facet: "farewell_linger",
    label: "lingering farewell",
    family: "transition",
    lifetime: "beat",
    minCloseness: 3,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "farewell", "restraint", "choice"],
    directive: "Use a goodbye that lasts one beat too long as the romantic signal.",
    constraint: "The farewell must leave the player free to go, stay, or say something.",
    avoid: "Do not force a chase or melodramatic airport scene unless it is already set up.",
    patterns: [/\b(?:goodbye|farewell|leave|leaving|last train|door closed|linger(?:ed|ing)?|one more minute)\b/i]
  },
  {
    facet: "secret_place",
    label: "secret or favorite place",
    family: "setting",
    lifetime: "arc",
    minCloseness: 4,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "setting", "trust", "callback"],
    directive: "Use a favorite place, rooftop, garden, archive corner, pier, or overlook as an intimacy anchor.",
    constraint: "It must be offered as trust, not used to isolate or trap the player.",
    avoid: "Do not relocate the scene if the current turn is clearly mid-action elsewhere.",
    patterns: [/\b(?:rooftop|garden|favorite place|secret place|hideaway|overlook|pier|balcony|archive corner|quiet corner)\b/i]
  },
  {
    facet: "protective_cover",
    label: "protective cover without possession",
    family: "care",
    lifetime: "scene",
    minCloseness: 4,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["cliche", "protective", "care", "agency"],
    directive: "Use shielding from rain, crowd, cold, embarrassment, or view as practical care.",
    constraint: "Care must be optional and non-possessive; the player can step away.",
    avoid: "Do not use danger, dominance, or control to manufacture romance.",
    patterns: [/\b(?:shield(?:ed|ing)?|covered (?:him|her|them)|blocked the view|hid(?:den)? from sight|crowd|pulled the curtain|closed the door)\b/i]
  },
  {
    facet: "forehead_touch",
    label: "forehead touch or hand check",
    family: "care",
    lifetime: "beat",
    minCloseness: 5,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "care", "touch", "tenderness"],
    directive: "Use a forehead touch, temperature check, or hand-over-hand care as tenderness.",
    constraint: "Make permission explicit or implied only by already established consent; never decide the player's response.",
    avoid: "Do not infantilize the player.",
    patterns: [/\b(?:forehead|temperature|fever|hand over (?:his|her|their)? ?hand|pressed (?:his|her|their)? ?hand|touched (?:his|her|their)? ?forehead)\b/i]
  }
];

const ROMANCE_BEATS: AdvancementCard[] = [
  {
    id: "specific_recognition",
    label: "Specific recognition",
    weight: 16,
    minCloseness: 1,
    typicalAfter: 3,
    phases: ["spark", "charge"],
    tags: ["recognition", "attention", "low-intensity"],
    directive:
      "Let the romance partner notice one concrete detail about the player-side character, their words, their choice, or the current scene.",
    constraint:
      "Do not infer the player's private feelings; the recognition must be based on visible words, actions, or context.",
    avoid: "Do not use generic beauty praise; make the observation specific."
  },
  {
    id: "gentle_tease",
    label: "Gentle tease",
    weight: 14,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge"],
    tags: ["flirt", "banter", "chemistry"],
    directive:
      "Use playful friction or teasing that reveals attraction, nervousness, or affection underneath.",
    constraint: "Keep the tease warm; it must not become cruel, humiliating, or scene-derailing.",
    avoid: "Do not repeat smirk/blush banter without a new relationship shift."
  },
  {
    id: "charged_silence",
    label: "Charged silence",
    weight: 12,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold"],
    tags: ["subtext", "body-language", "tension"],
    directive:
      "Let a pause, gaze, breath, hesitation, or restrained movement make the unspoken tension more important than the spoken words.",
    constraint: "Do not describe the player's internal state or bodily response.",
    avoid: "Do not make silence the whole reply; pair it with one clear next opening."
  },
  {
    id: "callback_intimacy",
    label: "Callback intimacy",
    weight: 18,
    minCloseness: 3,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["callback", "recognition", "trust"],
    directive:
      "Reuse a small earlier phrase, object, gesture, or choice as evidence that the romance partner noticed and remembered.",
    constraint: "The callback must come from FULL_STORY_CONTEXT, LATEST_PREVIOUS_TURN, CURRENT_TURN, or the visible scene.",
    avoid: "Do not invent a fake prior memory."
  },
  {
    id: "emotional_opening",
    label: "Emotional opening",
    weight: 15,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["vulnerability", "truth", "intimacy"],
    directive:
      "Let the romance partner reveal one brief true feeling, insecurity, hope, or fear without fully confessing everything.",
    constraint: "Keep it compact and grounded in the current moment; no long backstory monologue.",
    avoid: "Do not resolve all romantic tension in one speech."
  },
  {
    id: "consent_aware_closeness",
    label: "Consent-aware closeness",
    weight: 14,
    minCloseness: 5,
    typicalAfter: 7,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["consent", "touch", "agency"],
    directive:
      "Create a moment of physical or emotional closeness while clearly leaving the player room to accept, refuse, or redirect.",
    constraint: "Do not assume consent, desire, reciprocation, or bodily reaction from the player.",
    avoid: "Do not make the romance partner pushy, possessive, or entitled."
  },
  {
    id: "soft_reversal",
    label: "Soft reversal",
    weight: 12,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold"],
    tags: ["power-shift", "vulnerability", "novelty"],
    directive:
      "Shift the emotional power balance: the confident character falters, the guarded character becomes bold, or teasing turns sincere.",
    constraint: "Make the reversal subtle and believable from the exchange.",
    avoid: "Do not change the character's core personality."
  },
  {
    id: "protective_tenderness",
    label: "Protective tenderness",
    weight: 12,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["care", "action", "trust"],
    directive:
      "Show care through a small concrete action, offered help, or protective positioning instead of a speech.",
    constraint: "The action must preserve player agency and should not decide the player's reaction.",
    avoid: "Avoid possessiveness unless the story explicitly frames it as a flaw."
  },
  {
    id: "honest_question",
    label: "Honest question",
    weight: 10,
    minCloseness: 5,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["choice", "truth", "agency"],
    directive:
      "Ask one direct question that invites emotional truth or choice from the player-side character.",
    constraint: "Ask only one question and do not imply there is a required answer.",
    avoid: "Do not make every reply a question."
  },
  {
    id: "almost_confession",
    label: "Almost-confession",
    weight: 9,
    minCloseness: 6,
    typicalAfter: 7,
    phases: ["threshold"],
    tags: ["confession", "restraint", "tension"],
    directive:
      "Let the romance partner come close to admitting something important, then express it through action, an unfinished sentence, or a safer truth.",
    constraint: "Do not fully resolve the romantic tension yet.",
    avoid: "Do not fake interruptions repeatedly; make the hesitation emotionally grounded."
  },
  {
    id: "partial_confession",
    label: "Partial confession",
    weight: 8,
    minCloseness: 6,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["confession", "truth", "desire"],
    directive:
      "State a clear but limited romantic truth: missing them, wanting them near, fearing the moment matters, or choosing honesty.",
    constraint: "Leave the player free to accept, deflect, refuse, or redirect.",
    avoid: "Do not jump directly to permanent commitment unless the scene is at resolution."
  },
  {
    id: "desire_without_pressure",
    label: "Desire without pressure",
    weight: 7,
    minCloseness: 7,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["adult", "desire", "consent"],
    directive:
      "Let the romance partner express adult desire or longing clearly while leaving the pace and next step to the player.",
    constraint:
      "All characters must be adults; consent must be clear, ongoing, and unpressured. If the story has not opted into explicit adult mode, keep this sensual or fade-to-black.",
    avoid: "Do not write explicit acts, player bodily reactions, or assumed consent."
  },
  {
    id: "romantic_invitation",
    label: "Romantic invitation",
    weight: 8,
    minCloseness: 6,
    typicalAfter: 8,
    phases: ["threshold", "intimacy"],
    tags: ["choice", "kiss", "invitation"],
    directive:
      "Offer a clear romantic next step: stay, come closer, take a hand, dance, talk honestly, or invite a kiss if earned.",
    constraint: "Frame the invitation so refusal or slowing down remains easy and safe.",
    avoid: "Do not complete the player's acceptance."
  },
  {
    id: "cliche_locked_gaze",
    label: "Cliche: locked gaze",
    weight: 9,
    minCloseness: 1,
    typicalAfter: 3,
    phases: ["spark", "charge", "trust", "threshold"],
    tags: ["cliche", "gaze", "subtext", "low-intensity"],
    directive: "Use one held look, look-away, or caught stare as the familiar romantic signal.",
    constraint: "The gaze must create an opening, not declare the player's inner feelings.",
    avoid: "Do not pair it with generic blushing unless the blush is already in context."
  },
  {
    id: "cliche_shared_shelter",
    label: "Cliche: shared shelter",
    weight: 8,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "shelter", "proximity", "setting"],
    directive: "Use shared shelter from rain, snow, wind, crowding, or a doorway to make closeness practical.",
    constraint: "Do not add a new weather event if it contradicts the visible scene.",
    avoid: "Do not force physical contact; closeness can be spatial only."
  },
  {
    id: "cliche_accidental_touch",
    label: "Cliche: accidental touch",
    weight: 9,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "touch", "spark", "agency"],
    directive: "Use a brief accidental brush of hands, sleeves, shoulders, or reaching for the same object.",
    constraint: "Keep it reversible and do not decide the player's reaction.",
    avoid: "Do not escalate from accident to assumed desire."
  },
  {
    id: "cliche_fixing_detail",
    label: "Cliche: fixing a detail",
    weight: 8,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold"],
    tags: ["cliche", "care", "proximity", "touch"],
    directive: "Use fixing hair, a ribbon, a collar, a scarf, a button, or a smudge as a tiny permission-aware closeness beat.",
    constraint: "Offer or pause before touch unless the text already permits it.",
    avoid: "Do not make the player silently compliant."
  },
  {
    id: "cliche_offer_warmth",
    label: "Cliche: offered warmth",
    weight: 8,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "care", "comfort", "setting"],
    directive: "Use an offered coat, blanket, seat by the fire, warm drink, or dry cloth as practical tenderness.",
    constraint: "Offer help without ownership or deciding the player's comfort.",
    avoid: "Do not turn care into possessiveness."
  },
  {
    id: "cliche_shared_drink",
    label: "Cliche: shared drink or dessert",
    weight: 7,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "domestic", "banter", "low-intensity"],
    directive: "Use tea, coffee, dessert, or tasting from the same plate as a low-stakes route into banter or honesty.",
    constraint: "Keep it grounded in the current setting.",
    avoid: "Do not make a prop do all the emotional work."
  },
  {
    id: "cliche_walk_home",
    label: "Cliche: walk home",
    weight: 7,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "care", "transition", "choice"],
    directive: "Use an offer to walk together, escort, wait, or take the long way as a low-pressure transition.",
    constraint: "The player can decline, choose the route, or redirect.",
    avoid: "Do not isolate or corner the player."
  },
  {
    id: "cliche_private_dance",
    label: "Cliche: private dance",
    weight: 6,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "dance", "proximity", "choice"],
    directive: "Use a dance, guided step, or improvised rhythm as a mutual closeness test.",
    constraint: "Make it an invitation; do not narrate the player's body accepting.",
    avoid: "Do not suddenly add music unless the setting supports it."
  },
  {
    id: "cliche_almost_kiss",
    label: "Cliche: almost kiss",
    weight: 8,
    minCloseness: 5,
    typicalAfter: 7,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["cliche", "kiss", "restraint", "consent"],
    directive: "Use a pause before a kiss, a stopped-short lean-in, or a near-kiss as a consent-aware threshold.",
    constraint: "Do not complete the kiss unless explicit consent or prior player-authored consent is already present.",
    avoid: "Do not repeat interrupted almost-kisses as a loop."
  },
  {
    id: "cliche_caught_stumble",
    label: "Cliche: caught from a stumble",
    weight: 6,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust"],
    tags: ["cliche", "support", "touch", "care"],
    directive: "Use catching, steadying, or bracing from a stumble as one brief support beat.",
    constraint: "The support must be practical and immediately releasable.",
    avoid: "Do not create danger or injury solely to force closeness."
  },
  {
    id: "cliche_sleepy_vigil",
    label: "Cliche: sleepy vigil",
    weight: 6,
    minCloseness: 5,
    typicalAfter: 7,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "care", "vulnerability", "quiet"],
    directive: "Use staying nearby, keeping watch, or quietly refusing to leave as a care beat.",
    constraint: "Care must remain offered, not surveillant or controlling.",
    avoid: "Do not make the player helpless."
  },
  {
    id: "cliche_domestic_tenderness",
    label: "Cliche: domestic tenderness",
    weight: 7,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "domestic", "care", "softness"],
    directive: "Use cooking, cleaning up, sharing a table, folding fabric, or a quiet ordinary routine as intimacy.",
    constraint: "Small ordinary detail only; do not imply permanent commitment unless the phase is resolution.",
    avoid: "Do not turn one reply into a montage."
  },
  {
    id: "cliche_token_exchange",
    label: "Cliche: token exchange",
    weight: 7,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "callback", "gift", "memory"],
    directive: "Use an established ring, ribbon, book, note, flower, glove, or keepsake as a romantic anchor.",
    constraint: "Prefer an existing object; any new token must be small and scene-plausible.",
    avoid: "Do not invent a grand symbolic object out of nowhere."
  },
  {
    id: "cliche_name_softening",
    label: "Cliche: softened name",
    weight: 7,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "dialogue", "recognition", "intimacy"],
    directive: "Use a first name, softened title, or fitting nickname as the small sign that the dynamic changed.",
    constraint: "The name shift must fit tone and must not insult or belittle the player.",
    avoid: "Do not overuse pet names."
  },
  {
    id: "cliche_mild_jealousy",
    label: "Cliche: mild jealousy",
    weight: 4,
    minCloseness: 5,
    typicalAfter: 6,
    phases: ["trust", "threshold"],
    tags: ["cliche", "jealousy", "friction", "choice"],
    directive: "Use a tiny flicker of jealousy as vulnerability, then turn it toward honesty or humor.",
    constraint: "Jealousy must never become ownership, accusation, stalking, or punishment.",
    avoid: "Do not introduce a rival just to trigger jealousy."
  },
  {
    id: "cliche_reunion_pause",
    label: "Cliche: reunion pause",
    weight: 6,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "reunion", "restraint", "emotion"],
    directive: "Use the first second after seeing each other again as the whole romantic beat.",
    constraint: "One look, unfinished line, or offered step is enough.",
    avoid: "Do not summarize an entire separation."
  },
  {
    id: "cliche_farewell_linger",
    label: "Cliche: lingering farewell",
    weight: 6,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["cliche", "farewell", "restraint", "choice"],
    directive: "Use a goodbye that lasts one beat too long as the romantic signal.",
    constraint: "Leave the player free to go, stay, or speak.",
    avoid: "Do not force a chase scene unless the setup already supports it."
  },
  {
    id: "cliche_secret_place",
    label: "Cliche: secret place",
    weight: 5,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "resolution"],
    tags: ["cliche", "setting", "trust", "callback"],
    directive: "Use a favorite place, rooftop, garden, archive corner, pier, balcony, or overlook as a trust anchor.",
    constraint: "Offer the place as trust, not as isolation or entrapment.",
    avoid: "Do not relocate the scene if the current turn is mid-action elsewhere."
  },
  {
    id: "cliche_protective_cover",
    label: "Cliche: protective cover",
    weight: 6,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["cliche", "protective", "care", "agency"],
    directive: "Use shielding from rain, crowd, cold, view, or embarrassment as practical care.",
    constraint: "Care must be optional and non-possessive.",
    avoid: "Do not use danger, dominance, or control to manufacture romance."
  },
  {
    id: "cliche_forehead_touch",
    label: "Cliche: forehead touch",
    weight: 5,
    minCloseness: 5,
    typicalAfter: 7,
    phases: ["trust", "threshold", "intimacy", "resolution"],
    tags: ["cliche", "care", "touch", "tenderness"],
    directive: "Use a forehead touch, temperature check, or hand-over-hand care as tenderness.",
    constraint: "Permission must be explicit or already established by context; do not decide the player's response.",
    avoid: "Do not infantilize the player."
  },

  {
    id: "persona_clumsy_mishap",
    label: "Personna: harmless clumsy mishap",
    weight: 6,
    minCloseness: 1,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust", "threshold"],
    tags: ["personna", "clumsy", "mishap", "care", "low-intensity"],
    directive:
      "Let the NPC's seeded personna surface through one harmless fumble, dropped object, near-stumble, or badly timed movement that becomes a romantic opening.",
    constraint:
      "The mishap must be small, non-injuring, and immediately playable; do not decide the player's reaction or turn it into danger.",
    avoid: "Do not use slapstick to derail the scene or repeat the same fall gag."
  },
  {
    id: "persona_protective_intercept",
    label: "Personna: protective intercept",
    weight: 6,
    minCloseness: 3,
    typicalAfter: 6,
    phases: ["charge", "trust", "threshold", "intimacy"],
    tags: ["personna", "protective", "sacrifice", "care", "agency"],
    directive:
      "Let the NPC's protective streak appear as one practical intercept, shield, cover, or offered position, possibly for an absurdly small reason like thunder, cold, or a bad umbrella angle.",
    constraint:
      "Protection must be offered or immediately releasable; never make it possessive, coercive, or a substitute for player choice.",
    avoid: "Do not invent a serious attack or emergency just to justify protection."
  },
  {
    id: "persona_dumb_sacrifice",
    label: "Personna: dramatic tiny sacrifice",
    weight: 4,
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold", "resolution"],
    tags: ["personna", "sacrifice", "dumb_sacrifice", "dramatic", "care"],
    directive:
      "Let the NPC overcommit heroically to a tiny inconvenience, then reveal the affection or embarrassment underneath.",
    constraint:
      "Keep the stakes tiny and comic-romantic: noise, weather, a spill, a cold seat, a curtain, or a troublesome prop.",
    avoid: "Do not create violence, disaster, or guilt pressure."
  },
  {
    id: "persona_dere_contradiction",
    label: "Personna: dere contradiction",
    weight: 7,
    minCloseness: 2,
    typicalAfter: 5,
    phases: ["spark", "charge", "trust", "threshold", "intimacy"],
    tags: ["personna", "soft_reversal", "flustered", "cool_to_soft", "truth"],
    directive:
      "Let the NPC's dere archetype contradict itself for one beat: sharp words with gentle action, cool phrasing with exact care, shy silence with brave movement, or grand pride with a tiny honest request.",
    constraint: "The contradiction must deepen the established personna instead of replacing it.",
    avoid: "Do not swing into a completely different personality."
  },
  {
    id: "persona_signature_tell",
    label: "Personna: signature tell",
    weight: 5,
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge", "trust", "threshold", "resolution"],
    tags: ["personna", "precision", "gift", "callback", "expression"],
    directive:
      "Use one stable private tell, speech slip, tiny gift logic, exact observation, or repeated micro-habit as the NPC's character-specific romantic signal.",
    constraint: "Use one tell only and connect it to the current exchange or established memory.",
    avoid: "Do not list personality traits in narration; show the tell through action or dialogue."
  },
  {
    id: "boundary_check",
    label: "Boundary check",
    weight: 10,
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold", "intimacy"],
    tags: ["consent", "trust", "agency"],
    directive:
      "Let the romance partner notice the edge of intimacy and give the player a natural way to choose the pace.",
    constraint: "Make it romantic and in-character, not clinical or bureaucratic.",
    avoid: "Do not turn consent into pressure for reassurance."
  },
  {
    id: "repair_and_respect",
    label: "Repair and respect",
    weight: 11,
    minCloseness: 3,
    typicalAfter: 6,
    phases: ["trust", "threshold", "resolution"],
    tags: ["repair", "boundary", "trust"],
    directive:
      "If there is hesitation, refusal, discomfort, or boundary language, slow down, respect it, and create a safer emotional next step.",
    constraint: "Never punish the player for slowing or refusing intimacy.",
    avoid: "Do not make the romance partner sulk, guilt-trip, or push past the boundary."
  },
  {
    id: "final_callback_payoff",
    label: "Final callback payoff",
    weight: 5,
    minCloseness: 7,
    typicalAfter: 10,
    phases: ["resolution"],
    tags: ["ending", "callback", "closure"],
    directive:
      "Use an earlier detail as the emotional payoff for a kiss, promise, goodbye, commitment, or bittersweet closure.",
    constraint: "Only use this if the scene feels near an ending.",
    avoid: "Do not open unrelated new plot threads."
  }
];

const VISUAL_ROMANCE_BEATS: AdvancementCard[] = [
  {
    id: "visual_proximity",
    label: "Visual proximity",
    weight: 14,
    directive:
      "Represent the current romantic tension through distance, orientation, hands, posture, and where each character is looking.",
    constraint: "Do not add new touch, new actions, or new story events not already present.",
    minCloseness: 1,
    typicalAfter: 1,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  },
  {
    id: "visual_expression",
    label: "Visible expression",
    weight: 12,
    directive:
      "Make the current emotional temperature visible through expression, pose, stillness, or restraint.",
    constraint: "Do not describe thoughts, desire, motives, or invisible feelings.",
    minCloseness: 1,
    typicalAfter: 1,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  },
  {
    id: "visual_callback_object",
    label: "Meaningful object callback",
    weight: 10,
    directive:
      "Include a visible object, prop, clothing detail, or setting element already present in the exchange as a romantic visual anchor.",
    constraint: "Do not invent a new symbolic object unless it already exists in context.",
    minCloseness: 2,
    typicalAfter: 2,
    phases: ["charge", "trust", "threshold", "resolution"]
  },
  {
    id: "visual_lighting_mood",
    label: "Lighting and mood",
    weight: 10,
    directive:
      "Use lighting, framing, and setting details to make the current romantic mood legible.",
    constraint: "Keep it literal and image-friendly; no poetic abstraction.",
    minCloseness: 0,
    typicalAfter: 0,
    phases: ["spark", "charge", "trust", "threshold", "intimacy", "resolution"]
  }
];
