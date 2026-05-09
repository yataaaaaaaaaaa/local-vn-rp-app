import type { AgentContribution } from "./types";

type ClothingCoverage =
  | "unknown"
  | "clothed"
  | "partially_undressed"
  | "underwear"
  | "naked";

type ClothingChange = "none" | "dressed" | "undressed";

type ClothingState = {
  coverage: ClothingCoverage;
  change: ClothingChange;
  visualTags: string[];
  evidence: string[];
};

type ClothingCue = {
  coverage: ClothingCoverage;
  change?: ClothingChange;
  tags: string[];
  pattern: RegExp;
  evidenceLabel: string;
};

export function createClothingVisualPlanContribution(input: {
  factPrefix: string;
  promptSubjectLabel: string;
  text: string;
}): AgentContribution {
  const state = extractClothingState(input.text);
  const facts: Record<string, string | boolean | string[]> = {
    [`${input.factPrefix}_clothing_state`]: clothingStateToPromptText({
      state,
      subjectLabel: input.promptSubjectLabel
    })
  };

  if (state.coverage !== "unknown") {
    facts[`${input.factPrefix}_clothing_coverage`] = state.coverage;
  }

  if (state.change !== "none") {
    facts[`${input.factPrefix}_clothing_change`] = state.change;
  }

  return {
    facts,
    fixedTags: state.coverage === "unknown" ? [] : state.visualTags
  };
}

function extractClothingState(text: string): ClothingState {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matchedCues = CLOTHING_CUES.filter((cue) => cue.pattern.test(normalized));
  const strongestCue = matchedCues.reduce<ClothingCue | null>((best, cue) => {
    if (!best) return cue;
    return coverageRank(cue.coverage) >= coverageRank(best.coverage) ? cue : best;
  }, null);

  return {
    coverage: strongestCue?.coverage ?? "unknown",
    change: strongestCue?.change ?? changeFromCues(matchedCues),
    visualTags: [...new Set(matchedCues.flatMap((cue) => cue.tags))],
    evidence: matchedCues.map((cue) => cue.evidenceLabel)
  };
}

function clothingStateToPromptText(input: {
  state: ClothingState;
  subjectLabel: string;
}): string {
  const coverage = input.state.coverage.replace(/_/g, " ");
  const change = input.state.change === "none" ? "" : ` Recent change: ${input.state.change}.`;
  const evidence = input.state.evidence.length ? ` Evidence: ${input.state.evidence.join("; ")}.` : "";

  return `${input.subjectLabel} clothing state: ${coverage}.${change}${evidence}`;
}

function changeFromCues(cues: ClothingCue[]): ClothingChange {
  if (cues.some((cue) => cue.change === "undressed")) return "undressed";
  if (cues.some((cue) => cue.change === "dressed")) return "dressed";
  return "none";
}

function coverageRank(coverage: ClothingCoverage): number {
  switch (coverage) {
    case "naked":
      return 4;
    case "underwear":
      return 3;
    case "partially_undressed":
      return 2;
    case "clothed":
      return 1;
    case "unknown":
      return 0;
  }
}

const UNDRESS_VERBS = String.raw`(?:undress(?:es|ed|ing)?|strip(?:s|ped|ping)?|remove(?:s|d|ing)?|take(?:s|n|ing)?\s+off|slip(?:s|ped|ping)?\s+off|pull(?:s|ed|ing)?\s+off|shed(?:s|ding)?)`;
const CLOTHING_NOUNS = String.raw`(?:clothes?|clothing|outfit|dress|shirt|blouse|sweater|jacket|coat|skirt|pants|shorts|armor|robe|cloak|bra|panties|underwear|lingerie)`;

const CLOTHING_CUES: ClothingCue[] = [
  {
    coverage: "naked",
    change: "undressed",
    tags: ["naked"],
    pattern: new RegExp(String.raw`\b(?:naked|nude|unclothed|bare body|stripped bare|nothing on)\b|${UNDRESS_VERBS}\s+(?:all\s+)?(?:their|her|his|your|my|the)?\s*clothes?\b`, "i"),
    evidenceLabel: "naked or fully undressed language"
  },
  {
    coverage: "underwear",
    change: "undressed",
    tags: ["underwear"],
    pattern: /\b(?:underwear|bra|panties|lingerie|boxers|briefs|underwear only)\b/i,
    evidenceLabel: "underwear is visible"
  },
  {
    coverage: "partially_undressed",
    change: "undressed",
    tags: ["open clothes"],
    pattern: new RegExp(String.raw`\b(?:unbutton(?:s|ed|ing)?|unzips?|zip(?:s|ped|ping)?\s+down|open(?:s|ed|ing)?\s+(?:shirt|blouse|dress|jacket|coat|robe)|loosens?\s+(?:tie|collar)|${UNDRESS_VERBS}\s+(?:their|her|his|your|my|the)?\s*${CLOTHING_NOUNS})\b`, "i"),
    evidenceLabel: "clothing is opened, loosened, or removed"
  },
  {
    coverage: "partially_undressed",
    tags: ["bare shoulders"],
    pattern: /\b(?:bare shoulders?|naked shoulders?|one bare shoulder|off shoulder|slips? (?:down|from) (?:her|his|their|your|my)?\s*shoulder)\b/i,
    evidenceLabel: "shoulders are exposed"
  },
  {
    coverage: "partially_undressed",
    tags: ["midriff"],
    pattern: /\b(?:bare midriff|exposed midriff|midriff|navel|stomach visible|bare stomach)\b/i,
    evidenceLabel: "midriff or stomach is exposed"
  },
  {
    coverage: "clothed",
    change: "dressed",
    tags: ["fully clothed"],
    pattern: /\b(?:fully clothed|dressed|wearing|puts? on|slips? into|buttons? up|zips? up)\b/i,
    evidenceLabel: "clothing is worn or put on"
  }
];
