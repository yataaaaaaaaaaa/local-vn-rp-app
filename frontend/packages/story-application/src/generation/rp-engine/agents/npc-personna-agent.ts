import type { StoryNodeFields } from "@local-vn/story-domain";

import { stableHash } from "../runtime/cache-store";
import { latestPreviousTurnFromContext, previousTurnCount, storySetupFromContext } from "../state/story-context";
import type {
  NpcPersonnaDereType,
  NpcPersonnaLifetime,
  NpcPersonnaNoveltyContext,
  NpcPersonnaNoveltyInfluence,
  RpActorNames
} from "../types";
import type { AgentContribution, AgentNoveltyCandidate, AgentNote, RpAgent } from "./types";

type NpcPersonnaSource = "explicit" | "seeded";

type DereProfile = {
  id: NpcPersonnaDereType;
  label: string;
  core: string;
  publicMask: string;
  privateTell: string;
  defaultDialogueStyle: string;
  allowedTemperaments: string[];
  influenceFamilies: string[];
};

type DepthDimensionCard = {
  id: string;
  label: string;
  lifetime: NpcPersonnaLifetime;
  promptView: string;
  tags: string[];
};

type PersonnaDraft = {
  contextHash: string;
  source: NpcPersonnaSource;
  dere: DereProfile;
  temperament: DepthDimensionCard;
  attachment: DepthDimensionCard;
  value: DepthDimensionCard;
  flaw: DepthDimensionCard;
  vulnerability: DepthDimensionCard;
  loveLanguage: DepthDimensionCard;
  socialMask: DepthDimensionCard;
  privateTell: DepthDimensionCard;
  comedy: DepthDimensionCard;
  pressureResponse: DepthDimensionCard;
  speech: DepthDimensionCard;
  selectedInfluence: NpcPersonnaNoveltyInfluence | null;
  noveltyRoll: number;
};

export const NPC_PERSONNA_AGENT: RpAgent = {
  id: "npc_personna_agent",
  run(input) {
    const context = extractNpcPersonnaContext(input.node, input.actorNames ?? null);

    return {
      facts: {
        npc_personna_state: context.summary,
        npc_personna_context_hash: context.contextHash,
        npc_personna_source: context.source,
        npc_personna_dere_type: context.dereType,
        npc_personna_dimensions: context.dimensions,
        npc_personna_detail_lifetimes: context.detailLifetimes,
        npc_personna_novelty_levers: context.noveltyLevers,
        npc_personna_selected_novelty: context.selectedInfluence
          ? `${context.selectedInfluence.family}:${context.selectedInfluence.label}`
          : "none"
      },
      fixedTags: context.visualTags,
      promptViews: {
        npcPersonna: npcPersonnaPromptView(context)
      },
      novelty: {
        npcPersonna: context
      },
      notes: npcPersonnaNotes(context),
      candidates: npcPersonnaCandidates(context)
    };
  }
};

function npcPersonnaNotes(context: NpcPersonnaNoveltyContext): AgentNote[] {
  return [
    {
      source: "npc-personna",
      text: [
        `NPC personna: ${context.dereLabel}; ${context.core}`,
        `temperament=${context.temperament}`,
        `pressure=${context.pressureResponse}`,
        `private tell=${context.privateTell}`,
        `dialogue=${context.dialogueStyle}`,
        `selected influence=${context.selectedInfluence ? `${context.selectedInfluence.family}:${context.selectedInfluence.label}` : "none"}`
      ].join("; ")
    }
  ];
}

function npcPersonnaCandidates(context: NpcPersonnaNoveltyContext): AgentNoveltyCandidate[] {
  const influences = context.selectedInfluence
    ? [context.selectedInfluence]
    : context.influences.slice(0, 3);

  return influences.map((influence) => ({
    id: `npc-personna:${influence.id}`,
    source: "npc_personna",
    weight: Math.max(0.05, influence.triggerChance),
    label: influence.label,
    text: [
      `Use one NPC-personna redirect (${influence.label}): ${influence.directive}`,
      `Constraint: ${influence.constraint}`,
      `Keep the seeded personna stable: ${context.dereLabel}, ${context.temperament}, ${context.pressureResponse}.`,
      "Do not add an unrelated romantic cliché or external plot event."
    ].join(" "),
    rationale: `NPC personna candidate from ${context.dereLabel}: ${influence.family}`,
  }));
}

export function extractNpcPersonnaContext(
  node: StoryNodeFields,
  actorNames: RpActorNames | null = null
): NpcPersonnaNoveltyContext {
  const seedText = seedTextForNode(node, actorNames);
  const contextHash = stableHash(seedText);
  const allText = [node.context, node.userText, node.dialogue, node.visualDescription, node.resolverText]
    .join("\n")
    .toLowerCase();
  const explicitDere = detectExplicitDere(allText);
  const source: NpcPersonnaSource = explicitDere ? "explicit" : "seeded";
  const seed = seedNumber(contextHash);
  const turnCount = previousTurnCount(node.context || "");
  const dere = explicitDere ? DERE_PROFILES.find((profile) => profile.id === explicitDere)! : pick(DERE_PROFILES, seed, 0);
  const temperament = pickByTags(TEMPERAMENTS, dere.allowedTemperaments, seed, 1);
  const attachment = pick(ATTACHMENT_STYLES, seed, 2);
  const value = pick(CORE_VALUES, seed, 3);
  const flaw = pick(CHARACTER_FLAWS, seed, 4);
  const vulnerability = pick(VULNERABILITIES, seed, 5);
  const loveLanguage = pick(LOVE_LANGUAGES, seed, 6);
  const socialMask = pick(SOCIAL_MASKS, seed, 7);
  const privateTell = detectPrivateTell(allText) ?? pick(PRIVATE_TELLS, seed, 8);
  const comedy = detectComedyQuirk(allText) ?? pick(COMEDY_QUIRKS, seed, 9);
  const pressureResponse = pick(PRESSURE_RESPONSES, seed, 10);
  const speech = pick(SPEECH_PATTERNS, seed, 11);
  const noveltyRoll = deterministicUnit(`${contextHash}:${turnCount}:${latestPreviousTurnFromContext(node.context || "").slice(-180)}`);
  const selectedInfluence = selectNpcPersonnaInfluence({
    contextHash,
    text: allText,
    turnCount,
    noveltyRoll,
    dere,
    temperament,
    flaw,
    comedy,
    pressureResponse
  });
  const draft: PersonnaDraft = {
    contextHash,
    source,
    dere,
    temperament,
    attachment,
    value,
    flaw,
    vulnerability,
    loveLanguage,
    socialMask,
    privateTell,
    comedy,
    pressureResponse,
    speech,
    selectedInfluence,
    noveltyRoll
  };

  return draftToNoveltyContext(draft);
}

function seedTextForNode(node: StoryNodeFields, actorNames: RpActorNames | null): string {
  const setup = storySetupFromContext(node.context || "");
  const rootMemory = setup || (node.context || "").slice(0, 2400);

  return [
    "npc-personna-seed-v1",
    actorNames?.npcName ?? "unknown-npc",
    actorNames?.playerName ?? "unknown-player",
    rootMemory
  ].join("\n");
}

function detectExplicitDere(text: string): NpcPersonnaDereType | null {
  for (const profile of DERE_PROFILES) {
    const normalized = profile.id.replace(/_/g, "[-_ ]?");
    if (new RegExp(`\\b${normalized}\\b`, "i").test(text)) return profile.id;
  }

  if (/\bclassic\s+tsun|tsuntsun|sharp-tongued but sweet\b/i.test(text)) return "tsundere";
  if (/\bquiet\s+cool|cool\s+beauty|icy\s+outside\b/i.test(text)) return "kuudere";
  if (/\bshy\s+sweet|soft-spoken|timid\s+crush\b/i.test(text)) return "dandere";
  if (/\bopenly\s+affectionate|sunshine\s+crush|warm\s+and\s+clingy\b/i.test(text)) return "deredere";

  return null;
}

function detectPrivateTell(text: string): DepthDimensionCard | null {
  const cue = PRIVATE_TELLS.find((card) => card.tags.some((tag) => new RegExp(`\\b${escapeRegExp(tag)}\\b`, "i").test(text)));
  return cue ?? null;
}

function detectComedyQuirk(text: string): DepthDimensionCard | null {
  if (/\b(?:clumsy|trips?|stumbles?|drops?|falls?|fell|slips?)\b/i.test(text)) {
    return COMEDY_QUIRKS.find((card) => card.id === "clumsy_timing")!;
  }
  if (/\b(?:overdramatic|dramatic|melodrama|theatrical)\b/i.test(text)) {
    return COMEDY_QUIRKS.find((card) => card.id === "overdramatic")!;
  }
  if (/\b(?:sleepy|dozy|yawns?|drowsy)\b/i.test(text)) {
    return COMEDY_QUIRKS.find((card) => card.id === "sleepy")!;
  }

  return null;
}

function selectNpcPersonnaInfluence(input: {
  contextHash: string;
  text: string;
  turnCount: number;
  noveltyRoll: number;
  dere: DereProfile;
  temperament: DepthDimensionCard;
  flaw: DepthDimensionCard;
  comedy: DepthDimensionCard;
  pressureResponse: DepthDimensionCard;
}): NpcPersonnaNoveltyInfluence | null {
  const candidates = NPC_PERSONNA_INFLUENCES.filter((influence) => {
    const personaTags = [
      input.dere.id,
      ...input.dere.influenceFamilies,
      ...input.temperament.tags,
      ...input.flaw.tags,
      ...input.comedy.tags,
      ...input.pressureResponse.tags
    ];
    return influence.tags.some((tag) => personaTags.includes(tag));
  });
  const contextual = candidates.find((influence) => influence.contextPatterns.some((pattern) => pattern.test(input.text)));

  if (contextual) return stripInfluencePatterns(contextual);
  if (candidates.length === 0) return null;

  const selected = pick(candidates, seedNumber(input.contextHash) + input.turnCount, 12);
  const cadenceBonus = input.turnCount <= 1 ? 0.07 : 0;
  const trigger = Math.min(0.72, selected.triggerChance + cadenceBonus);

  return input.noveltyRoll <= trigger ? stripInfluencePatterns(selected) : null;
}

function stripInfluencePatterns(
  influence: NpcPersonnaNoveltyInfluence & { contextPatterns: RegExp[] }
): NpcPersonnaNoveltyInfluence {
  const { contextPatterns, ...rest } = influence;
  return rest;
}

function draftToNoveltyContext(draft: PersonnaDraft): NpcPersonnaNoveltyContext {
  const dimensions = [
    `dere=${draft.dere.label}`,
    `temperament=${draft.temperament.label}`,
    `attachment=${draft.attachment.label}`,
    `core_value=${draft.value.label}`,
    `flaw=${draft.flaw.label}`,
    `vulnerability=${draft.vulnerability.label}`,
    `love_language=${draft.loveLanguage.label}`,
    `social_mask=${draft.socialMask.label}`,
    `private_tell=${draft.privateTell.label}`,
    `comedy=${draft.comedy.label}`,
    `pressure_response=${draft.pressureResponse.label}`,
    `speech=${draft.speech.label}`
  ];
  const detailLifetimes = [
    `dere:${draft.dere.label} [seed]`,
    `${draft.temperament.id}:${draft.temperament.label} [${draft.temperament.lifetime}]`,
    `${draft.attachment.id}:${draft.attachment.label} [${draft.attachment.lifetime}]`,
    `${draft.value.id}:${draft.value.label} [${draft.value.lifetime}]`,
    `${draft.flaw.id}:${draft.flaw.label} [${draft.flaw.lifetime}]`,
    `${draft.vulnerability.id}:${draft.vulnerability.label} [${draft.vulnerability.lifetime}]`,
    `${draft.loveLanguage.id}:${draft.loveLanguage.label} [${draft.loveLanguage.lifetime}]`,
    `${draft.privateTell.id}:${draft.privateTell.label} [${draft.privateTell.lifetime}]`,
    `${draft.comedy.id}:${draft.comedy.label} [${draft.comedy.lifetime}]`,
    `${draft.pressureResponse.id}:${draft.pressureResponse.label} [${draft.pressureResponse.lifetime}]`,
    `${draft.speech.id}:${draft.speech.label} [${draft.speech.lifetime}]`
  ];
  const noveltyLevers = [
    ...draft.dere.influenceFamilies,
    ...draft.temperament.tags,
    ...draft.flaw.tags,
    ...draft.comedy.tags,
    ...draft.pressureResponse.tags
  ].filter(uniqueOnly).slice(0, 12);
  const visualTags = [
    ...draft.privateTell.tags.filter((tag) => tag.includes("smile") || tag.includes("gaze") || tag.includes("blush") || tag.includes("expression")),
    ...draft.comedy.tags.filter((tag) => tag === "clumsy" || tag === "sleepy")
  ].filter(uniqueOnly);
  const selected = draft.selectedInfluence;
  const selectedLine = selected ? ` Selected novelty lever: ${selected.family}:${selected.label}.` : "";
  const summary = [
    `NPC_PERSONNA_STATE: ${draft.source} ${draft.dere.label} from context hash ${draft.contextHash}.`,
    `Core: ${draft.dere.core}`,
    `Mask/private tell: ${draft.socialMask.promptView} / ${draft.privateTell.promptView}`,
    `Depth: ${draft.value.promptView}; flaw: ${draft.flaw.promptView}; vulnerability: ${draft.vulnerability.promptView}.`,
    `Affection style: ${draft.loveLanguage.promptView}; pressure response: ${draft.pressureResponse.promptView}; speech: ${draft.speech.promptView}.`,
    `Comedy/imperfection: ${draft.comedy.promptView}.${selectedLine}`
  ].join("\n");

  return {
    active: true,
    contextHash: draft.contextHash,
    source: draft.source,
    dereType: draft.dere.id,
    dereLabel: draft.dere.label,
    core: draft.dere.core,
    publicMask: draft.dere.publicMask,
    privateTell: draft.privateTell.promptView,
    temperament: draft.temperament.label,
    attachmentStyle: draft.attachment.label,
    coreValue: draft.value.label,
    flaw: draft.flaw.label,
    vulnerability: draft.vulnerability.label,
    loveLanguage: draft.loveLanguage.label,
    pressureResponse: draft.pressureResponse.label,
    dialogueStyle: draft.speech.promptView,
    dimensions,
    detailLifetimes,
    noveltyLevers,
    influences: NPC_PERSONNA_INFLUENCES.map(stripInfluencePatterns),
    selectedInfluence: selected ?? undefined,
    shouldInfluenceNovelty: Boolean(selected),
    noveltyRoll: draft.noveltyRoll,
    noveltyInstruction: selected
      ? `Let the NPC's ${draft.dere.label} personna influence novelty through exactly one lever (${selected.family}:${selected.label}); keep all seed/arc traits stable.`
      : `Keep the NPC's ${draft.dere.label} personna stable; do not force a quirk unless the selected beat benefits from it.`,
    summary,
    visualTags
  };
}

function npcPersonnaPromptView(context: NpcPersonnaNoveltyContext): Record<string, unknown> {
  return {
    active: context.active,
    source: context.source,
    contextHash: context.contextHash,
    dereType: context.dereType,
    dereLabel: context.dereLabel,
    core: context.core,
    publicMask: context.publicMask,
    privateTell: context.privateTell,
    temperament: context.temperament,
    attachmentStyle: context.attachmentStyle,
    coreValue: context.coreValue,
    flaw: context.flaw,
    vulnerability: context.vulnerability,
    loveLanguage: context.loveLanguage,
    pressureResponse: context.pressureResponse,
    dialogueStyle: context.dialogueStyle,
    dimensions: context.dimensions,
    detailLifetimes: context.detailLifetimes,
    noveltyLevers: context.noveltyLevers,
    selectedInfluence: context.selectedInfluence ? `${context.selectedInfluence.family}:${context.selectedInfluence.label}` : "none",
    selectedInfluenceDirective: context.selectedInfluence?.directive ?? "No personna quirk is selected for this turn.",
    selectedInfluenceConstraint: context.selectedInfluence?.constraint ?? "Keep personna stable and subtle.",
    shouldInfluenceNovelty: context.shouldInfluenceNovelty,
    noveltyInstruction: context.noveltyInstruction,
    summary: context.summary
  };
}

function pick<T>(items: T[], seed: number, salt: number): T {
  return items[Math.abs(seed + salt * 2654435761) % items.length]!;
}

function pickByTags<T extends { tags: string[] }>(items: T[], preferredTags: string[], seed: number, salt: number): T {
  const preferred = items.filter((item) => item.tags.some((tag) => preferredTags.includes(tag)));
  return pick(preferred.length ? preferred : items, seed, salt);
}

function seedNumber(hash: string): number {
  let value = 0;
  for (let index = 0; index < hash.length; index += 1) {
    value = Math.imul(value ^ hash.charCodeAt(index), 16777619);
  }
  return value >>> 0;
}

function deterministicUnit(input: string): number {
  return seedNumber(stableHash(input)) / 0xffffffff;
}

function uniqueOnly<T>(value: T, index: number, array: T[]): boolean {
  return array.indexOf(value) === index;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DERE_PROFILES: DereProfile[] = [
  {
    id: "deredere",
    label: "deredere",
    core: "Openly warm, affectionate, emotionally available, and eager to share delight.",
    publicMask: "sunny, direct warmth",
    privateTell: "affection becomes quieter and more careful when it matters",
    defaultDialogueStyle: "plainspoken warmth with small excited slips",
    allowedTemperaments: ["warm", "playful", "bright", "earnest"],
    influenceFamilies: ["warmth", "clumsy", "care", "confession"]
  },
  {
    id: "tsundere",
    label: "tsundere",
    core: "Deflects tenderness with sharpness, then reveals care through practical action.",
    publicMask: "prickly denial and teasing",
    privateTell: "over-explains practical help to hide affection",
    defaultDialogueStyle: "short teasing lines that soften at the end",
    allowedTemperaments: ["sharp", "playful", "guarded", "earnest"],
    influenceFamilies: ["soft_reversal", "flustered", "care", "banter"]
  },
  {
    id: "kuudere",
    label: "kuudere",
    core: "Cool, composed, and sparse with words, with affection shown through precise attention.",
    publicMask: "calm, unreadable control",
    privateTell: "one unusually specific protective detail gives them away",
    defaultDialogueStyle: "dry, minimal lines with exact observations",
    allowedTemperaments: ["cool", "guarded", "precise", "protective"],
    influenceFamilies: ["protective", "cool_to_soft", "sacrifice", "precision"]
  },
  {
    id: "dandere",
    label: "dandere",
    core: "Quiet and shy until trust gives them enough safety to speak honestly.",
    publicMask: "soft silence and careful distance",
    privateTell: "brave eye contact or one unexpectedly clear sentence",
    defaultDialogueStyle: "brief hesitant lines with sincere specifics",
    allowedTemperaments: ["shy", "earnest", "gentle", "guarded"],
    influenceFamilies: ["quiet_bravery", "soft_reversal", "care", "confession"]
  },
  {
    id: "himedere",
    label: "himedere",
    core: "Wants to be treated as special, but the arrogance hides a need to be chosen sincerely.",
    publicMask: "regal confidence and dramatic standards",
    privateTell: "drops the grand tone for one honest request",
    defaultDialogueStyle: "commanding elegance broken by vulnerable specificity",
    allowedTemperaments: ["dramatic", "proud", "playful", "guarded"],
    influenceFamilies: ["dramatic", "soft_reversal", "gift", "care"]
  },
  {
    id: "kamidere",
    label: "kamidere",
    core: "Acts impossibly self-assured, then becomes human through tiny failures and unwanted tenderness.",
    publicMask: "godlike certainty and theatrical control",
    privateTell: "a tiny mistake they pretend was intentional",
    defaultDialogueStyle: "grand claims clipped by awkward sincerity",
    allowedTemperaments: ["dramatic", "proud", "cool", "playful"],
    influenceFamilies: ["dramatic", "clumsy", "soft_reversal", "precision"]
  },
  {
    id: "bakadere",
    label: "bakadere",
    core: "Good-hearted, impulsive, and foolishly brave, with affection arriving before strategy.",
    publicMask: "chaotic cheer and confidence without planning",
    privateTell: "admits confusion but keeps trying anyway",
    defaultDialogueStyle: "fast sincere lines with accidental honesty",
    allowedTemperaments: ["bright", "playful", "earnest", "clumsy"],
    influenceFamilies: ["clumsy", "dumb_sacrifice", "care", "confession"]
  },
  {
    id: "mayadere",
    label: "mayadere",
    core: "Initially guarded or oppositional, then redirects loyalty into fierce but negotiable care.",
    publicMask: "dangerous distance and testing words",
    privateTell: "chooses the player's safety over winning the exchange",
    defaultDialogueStyle: "controlled challenge with visible restraint",
    allowedTemperaments: ["guarded", "cool", "protective", "sharp"],
    influenceFamilies: ["protective", "soft_reversal", "trust_test", "care"]
  }
];

const TEMPERAMENTS: DepthDimensionCard[] = [
  { id: "warm", label: "warm and expressive", lifetime: "arc", promptView: "leans into sincerity quickly", tags: ["warm", "care"] },
  { id: "cool", label: "cool and controlled", lifetime: "arc", promptView: "keeps emotion under exact wording", tags: ["cool", "precision", "protective"] },
  { id: "playful", label: "playful and teasing", lifetime: "arc", promptView: "uses humor to test closeness", tags: ["playful", "banter", "flustered"] },
  { id: "guarded", label: "guarded and watchful", lifetime: "arc", promptView: "trusts slowly but notices everything", tags: ["guarded", "trust_test"] },
  { id: "bright", label: "bright and impulsive", lifetime: "arc", promptView: "moves before thinking, then laughs at the mess", tags: ["bright", "clumsy"] },
  { id: "shy", label: "shy but brave in flashes", lifetime: "arc", promptView: "hesitates, then chooses one clear action", tags: ["shy", "quiet_bravery"] },
  { id: "dramatic", label: "dramatic and image-conscious", lifetime: "arc", promptView: "turns small moments theatrical", tags: ["dramatic", "gift"] },
  { id: "precise", label: "precise and observant", lifetime: "arc", promptView: "shows affection through exact recall", tags: ["precision", "cool"] },
  { id: "protective", label: "protective but restrained", lifetime: "arc", promptView: "steps in first, asks permission immediately after", tags: ["protective", "sacrifice"] },
  { id: "clumsy", label: "clumsy and earnest", lifetime: "arc", promptView: "turns mishaps into honest openings", tags: ["clumsy", "warm"] }
];

const ATTACHMENT_STYLES: DepthDimensionCard[] = [
  { id: "steady", label: "steady secure attachment", lifetime: "arc", promptView: "offers closeness without chasing", tags: ["care", "stable"] },
  { id: "seeking", label: "attention-seeking but correctable", lifetime: "arc", promptView: "asks for signs they matter, then backs off if needed", tags: ["confession", "flustered"] },
  { id: "avoidant", label: "avoidant under pressure", lifetime: "arc", promptView: "retreats into tasks when emotions sharpen", tags: ["guarded", "soft_reversal"] },
  { id: "protective", label: "protective attachment", lifetime: "arc", promptView: "feels safest while helping", tags: ["protective", "care"] },
  { id: "rivalrous", label: "rivalrous attachment", lifetime: "arc", promptView: "turns affection into challenge", tags: ["banter", "trust_test"] }
];

const CORE_VALUES: DepthDimensionCard[] = [
  { id: "honesty", label: "honesty", lifetime: "seed", promptView: "hates fake reassurance", tags: ["truth"] },
  { id: "competence", label: "competence", lifetime: "seed", promptView: "wants to be useful, not pitied", tags: ["precision"] },
  { id: "loyalty", label: "loyalty", lifetime: "seed", promptView: "chooses sides clearly once trust is earned", tags: ["protective"] },
  { id: "freedom", label: "freedom", lifetime: "seed", promptView: "will not cage affection or be caged by it", tags: ["agency"] },
  { id: "beauty", label: "beauty in small rituals", lifetime: "seed", promptView: "notices presentation, gifts, and ceremonial details", tags: ["gift", "dramatic"] },
  { id: "courage", label: "courage", lifetime: "seed", promptView: "acts despite fear and then admits the fear later", tags: ["sacrifice", "quiet_bravery"] }
];

const CHARACTER_FLAWS: DepthDimensionCard[] = [
  { id: "overhelps", label: "overhelps", lifetime: "arc", promptView: "tries to solve feelings with practical help", tags: ["care", "protective"] },
  { id: "deflects", label: "deflects with jokes", lifetime: "arc", promptView: "jokes when sincerity gets too close", tags: ["banter", "flustered"] },
  { id: "self_sacrifices", label: "self-sacrifices for tiny stakes", lifetime: "arc", promptView: "treats a small inconvenience like a heroic last stand", tags: ["sacrifice", "dumb_sacrifice"] },
  { id: "overthinks", label: "overthinks", lifetime: "arc", promptView: "turns one glance into a plan with three backups", tags: ["precision", "guarded"] },
  { id: "pride", label: "proud about needing care", lifetime: "arc", promptView: "accepts help only after dressing it up as strategy", tags: ["dramatic", "soft_reversal"] },
  { id: "literal", label: "too literal", lifetime: "arc", promptView: "misses flirtation unless it is almost impossible to miss", tags: ["clumsy", "precision"] }
];

const VULNERABILITIES: DepthDimensionCard[] = [
  { id: "replaceable", label: "fear of being replaceable", lifetime: "arc", promptView: "reacts strongly to being specifically chosen", tags: ["confession"] },
  { id: "incompetent", label: "fear of being useless", lifetime: "arc", promptView: "hides shame behind competence", tags: ["precision", "care"] },
  { id: "too_much", label: "fear of being too much", lifetime: "arc", promptView: "pulls back after intense affection", tags: ["guarded", "agency"] },
  { id: "ordinary", label: "fear of being ordinary", lifetime: "arc", promptView: "makes simple romance theatrical", tags: ["dramatic", "gift"] },
  { id: "abandoned", label: "fear of being left behind", lifetime: "arc", promptView: "lingers at departures", tags: ["care", "confession"] },
  { id: "misread", label: "fear of being misread", lifetime: "arc", promptView: "corrects the emotional meaning of small gestures", tags: ["truth", "precision"] }
];

const LOVE_LANGUAGES: DepthDimensionCard[] = [
  { id: "acts", label: "acts of service", lifetime: "arc", promptView: "does small tasks before making speeches", tags: ["care", "protective"] },
  { id: "words", label: "careful words", lifetime: "arc", promptView: "uses one precise line instead of a monologue", tags: ["truth", "confession"] },
  { id: "time", label: "quality time", lifetime: "arc", promptView: "finds excuses to stay nearby", tags: ["care"] },
  { id: "gifts", label: "tiny gifts or tokens", lifetime: "arc", promptView: "turns small objects into meaning", tags: ["gift"] },
  { id: "play", label: "playful challenge", lifetime: "arc", promptView: "flirts by daring the player to be honest", tags: ["banter", "trust_test"] },
  { id: "protection", label: "protective positioning", lifetime: "arc", promptView: "takes the exposed side of the room without announcing it", tags: ["protective", "sacrifice"] }
];

const SOCIAL_MASKS: DepthDimensionCard[] = [
  { id: "competent", label: "competent mask", lifetime: "scene", promptView: "pretends everything is handled", tags: ["precision"] },
  { id: "cheerful", label: "cheerful mask", lifetime: "scene", promptView: "keeps smiling one second too long", tags: ["warm"] },
  { id: "aloof", label: "aloof mask", lifetime: "scene", promptView: "answers softly but looks away", tags: ["cool", "guarded"] },
  { id: "regal", label: "regal mask", lifetime: "scene", promptView: "speaks like the moment is a ceremony", tags: ["dramatic"] },
  { id: "chaotic", label: "chaotic mask", lifetime: "scene", promptView: "moves first, explains second", tags: ["clumsy", "bright"] }
];

const PRIVATE_TELLS: DepthDimensionCard[] = [
  { id: "ear_blush", label: "ear blush", lifetime: "beat", promptView: "their ears give them away before their words do", tags: ["blush", "flustered", "expression"] },
  { id: "name_softens", label: "softened name", lifetime: "relationship", promptView: "their voice changes around the player's name", tags: ["confession", "voice"] },
  { id: "sleeve_fidget", label: "sleeve fidget", lifetime: "beat", promptView: "one hand worries at a sleeve or hem", tags: ["fidget", "shy"] },
  { id: "too_direct_gaze", label: "too-direct gaze", lifetime: "beat", promptView: "they hold eye contact a fraction too long", tags: ["gaze", "cool"] },
  { id: "formal_slip", label: "formal speech slip", lifetime: "beat", promptView: "their polished wording slips into plain honesty", tags: ["truth", "dramatic"] },
  { id: "quick_smile", label: "hidden quick smile", lifetime: "beat", promptView: "a smile appears and is hidden almost immediately", tags: ["smile", "cool_to_soft"] }
];

const COMEDY_QUIRKS: DepthDimensionCard[] = [
  { id: "clumsy_timing", label: "clumsy timing", lifetime: "scene", promptView: "minor slips, dropped objects, or near-stumbles puncture tension", tags: ["clumsy", "mishap"] },
  { id: "overdramatic", label: "overdramatic framing", lifetime: "scene", promptView: "treats tiny romantic stakes like opera", tags: ["dramatic", "gift"] },
  { id: "too_literal", label: "too-literal reactions", lifetime: "scene", promptView: "answers subtext as if it were instructions", tags: ["precision", "clumsy"] },
  { id: "sleepy", label: "sleepy softness", lifetime: "scene", promptView: "gets honest when tired", tags: ["sleepy", "care"] },
  { id: "tiny_rivalry", label: "tiny rivalry", lifetime: "scene", promptView: "competes with harmless objects, weather, or timing", tags: ["banter", "trust_test"] },
  { id: "heroic_overkill", label: "heroic overkill", lifetime: "scene", promptView: "protects against absurdly small inconveniences", tags: ["dumb_sacrifice", "protective"] }
];

const PRESSURE_RESPONSES: DepthDimensionCard[] = [
  { id: "tease", label: "teases under pressure", lifetime: "scene", promptView: "turns fear into playful challenge", tags: ["banter", "flustered"] },
  { id: "freeze", label: "freezes then acts", lifetime: "scene", promptView: "pauses, chooses one small brave action", tags: ["quiet_bravery"] },
  { id: "overhelp", label: "overhelps", lifetime: "scene", promptView: "solves the nearest practical problem too intensely", tags: ["care", "protective"] },
  { id: "protect", label: "protects first", lifetime: "scene", promptView: "steps between the player and even ridiculous inconvenience", tags: ["protective", "sacrifice"] },
  { id: "confess", label: "blurts a partial truth", lifetime: "scene", promptView: "accidentally says the honest part out loud", tags: ["confession", "flustered"] },
  { id: "deflect_task", label: "turns feelings into a task", lifetime: "scene", promptView: "rearranges cups, blankets, routes, or plans instead of admitting fear", tags: ["care", "precision"] }
];

const SPEECH_PATTERNS: DepthDimensionCard[] = [
  { id: "short_exact", label: "short exact lines", lifetime: "arc", promptView: "compact sentences with one concrete observation", tags: ["precision", "cool"] },
  { id: "warm_spill", label: "warm spillover", lifetime: "arc", promptView: "affection slips out faster than planned", tags: ["warm", "confession"] },
  { id: "teasing_turn", label: "teasing turn", lifetime: "arc", promptView: "starts with teasing and ends sincere", tags: ["banter", "flustered"] },
  { id: "formal_crack", label: "formal crack", lifetime: "arc", promptView: "formal phrasing cracks into plain wanting", tags: ["dramatic", "truth"] },
  { id: "hesitant_clear", label: "hesitant clarity", lifetime: "arc", promptView: "soft starts followed by one clear request", tags: ["shy", "quiet_bravery"] },
  { id: "bold_wrong", label: "bold but wrong", lifetime: "arc", promptView: "confident declaration immediately corrected by reality", tags: ["clumsy", "dramatic"] }
];

const NPC_PERSONNA_INFLUENCES: Array<NpcPersonnaNoveltyInfluence & { contextPatterns: RegExp[] }> = [
  {
    id: "clumsy_mishap",
    label: "harmless clumsy mishap",
    family: "clumsy",
    lifetime: "beat",
    triggerChance: 0.42,
    tags: ["clumsy", "mishap", "warm", "bakadere", "deredere", "kamidere"],
    directive: "Use one harmless clumsy slip, dropped object, near-fall, or badly timed movement as the novelty lever, then turn it into a romantic opening.",
    constraint: "No serious injury, no player reaction control, and no slapstick that destroys the scene tone.",
    contextPatterns: [/\b(?:clumsy|trip|stumble|fall|dropped|slipped|thunder|startled|bumped)\b/i]
  },
  {
    id: "protective_intercept",
    label: "protective intercept",
    family: "protective",
    lifetime: "beat",
    triggerChance: 0.38,
    tags: ["protective", "sacrifice", "care", "kuudere", "mayadere"],
    directive: "Let the NPC step in, shield, cover, redirect, or take the exposed side for a small practical reason.",
    constraint: "Protection must not become control; the player can refuse, move, or handle it themselves.",
    contextPatterns: [/\b(?:rain|storm|thunder|crowd|cold|door|falling|glass|wind|danger|protect|shield|cover)\b/i]
  },
  {
    id: "dumb_sacrifice",
    label: "dramatic sacrifice for tiny stakes",
    family: "sacrifice",
    lifetime: "beat",
    triggerChance: 0.3,
    tags: ["dumb_sacrifice", "sacrifice", "dramatic", "bakadere", "himedere", "kamidere"],
    directive: "Make the NPC treat a trivial inconvenience like a noble sacrifice, then undercut it with tenderness or embarrassment.",
    constraint: "The stakes must stay tiny: thunder, spilled tea, a cold chair, a bad umbrella angle, or a noisy hallway.",
    contextPatterns: [/\b(?:thunder|tea|umbrella|chair|cold|noise|hallway|blanket|rain)\b/i]
  },
  {
    id: "cool_to_soft",
    label: "cool mask cracks soft",
    family: "cool_to_soft",
    lifetime: "beat",
    triggerChance: 0.36,
    tags: ["cool", "cool_to_soft", "kuudere", "precision"],
    directive: "Let the NPC's composed mask crack through one exact protective detail, softened name, or unplanned admission.",
    constraint: "Do not make them suddenly verbose or out of character; one crack is enough.",
    contextPatterns: [/\b(?:are you okay|cold|hurt|name|remember|wait|stay)\b/i]
  },
  {
    id: "flustered_cover",
    label: "flustered cover-up",
    family: "flustered",
    lifetime: "beat",
    triggerChance: 0.4,
    tags: ["flustered", "tsundere", "banter", "deredere"],
    directive: "Let the NPC cover genuine affection with a too-fast excuse, correction, or teasing line.",
    constraint: "The cover-up must still reveal care; do not make it cruel.",
    contextPatterns: [/\b(?:blush|tease|cute|close|hand|thanks|sorry|like)\b/i]
  },
  {
    id: "quiet_bravery",
    label: "quiet brave action",
    family: "quiet_bravery",
    lifetime: "beat",
    triggerChance: 0.34,
    tags: ["quiet_bravery", "dandere", "shy", "care"],
    directive: "Let the shy or guarded NPC choose one small brave action instead of explaining everything.",
    constraint: "One action or one line only; do not force confession or player reciprocation.",
    contextPatterns: [/\b(?:quiet|afraid|nervous|hand|stay|please|step)\b/i]
  },
  {
    id: "tiny_gift_logic",
    label: "tiny gift logic",
    family: "gift",
    lifetime: "scene",
    triggerChance: 0.26,
    tags: ["gift", "dramatic", "himedere", "care"],
    directive: "Use a small token, folded note, ribbon, food, or object as how the NPC expresses care without saying too much.",
    constraint: "Prefer an existing object and keep the gesture small enough for the scene.",
    contextPatterns: [/\b(?:ribbon|note|book|cup|tea|flower|gift|token|keepsake)\b/i]
  },
  {
    id: "trust_test_softened",
    label: "softened trust test",
    family: "trust_test",
    lifetime: "beat",
    triggerChance: 0.28,
    tags: ["trust_test", "mayadere", "guarded", "banter"],
    directive: "Let the NPC test the player with a small challenge, then immediately make it safer or more honest.",
    constraint: "The test must be playful or emotionally honest, not manipulative.",
    contextPatterns: [/\b(?:prove|trust|challenge|dare|honest|truth|choose)\b/i]
  }
];
