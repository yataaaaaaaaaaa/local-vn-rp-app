import type { CoherentNoveltySelection } from "../novelty/coherence-judge";
import type { AdvancementCard } from "../types";

export type ConcreteNoveltyInstruction = {
  selectedBeat: string;
  execution: string;
  allowedForms: string[];
  avoid: string[];
};

/**
 * Converts the selected novelty redirect into concrete prompt guidance.
 *
 * This module is prompt-facing only: it does not score, validate, reject, or
 * mutate generated text. Its job is to make the final RP prompt ask for one
 * specific observable move instead of a vague novelty vibe.
 */
export function buildConcreteNoveltyInstruction(
  selection?: CoherentNoveltySelection | null
): ConcreteNoveltyInstruction {
  const candidate = selection?.candidate;
  const beat = selection?.beat ?? candidate?.beat;
  const label = candidate?.label ?? beat?.label ?? (selection?.acceptedByJudge ? "selected redirect" : "stabilization");
  const source = candidate?.source ?? sourceFromBeat(beat) ?? "fallback";

  return {
    selectedBeat: label,
    execution: executionInstructionFor(source, beat, selection),
    allowedForms: allowedFormsFor(source),
    avoid: avoidListFor(source, selection)
  };
}

function sourceFromBeat(beat?: AdvancementCard): string | null {
  if (!beat) return null;
  if (beat.id.startsWith("player_")) return "player";
  if (beat.id.startsWith("cliche_")) return "romance_cliche";
  if (beat.id.startsWith("persona_")) return "npc_personna";
  if (beat.id.startsWith("visual_")) return "visual";
  if (beat.id === "repair_and_respect" || beat.id === "boundary_check") return "safety";
  return "base";
}

function executionInstructionFor(
  source: string,
  beat?: AdvancementCard,
  selection?: CoherentNoveltySelection | null
): string {
  if (!selection?.acceptedByJudge) {
    return "Answer the latest turn directly, then add exactly one low-risk concrete move such as a practical choice, a small object interaction, or a clear next-step question.";
  }

  if (source === "player") {
    return "Turn the selected player beat into one playable choice: a short spoken line, a direct action, or an action plus one short line.";
  }

  if (source === "safety" || beat?.tags?.includes("consent")) {
    return "Make the novelty a consent-aware next step: name the pace, offer a choice, ask one clear question, or physically give space.";
  }

  if (source === "romance_cliche" || beat?.id.startsWith("cliche_")) {
    return "Instantiate the selected romantic facet through one concrete scene move, not a mood label: one prop, distance change, offered task, practical obstacle, or spoken invitation.";
  }

  if (source === "npc_personna" || beat?.id.startsWith("persona_")) {
    return "Show the selected personna influence through one small behavior, mistake, tell, protective choice, or contradiction visible in the next textbox.";
  }

  if (source === "sex_scene" || beat?.tags?.includes("adult")) {
    return "Use one intimacy detail only, framed as choice and consent; make the concrete move about pace, invitation, aftercare, or fade-to-black setup.";
  }

  if (source === "visual" || beat?.id.startsWith("visual_")) {
    return "Make the visual novelty one concrete visible change: distance, expression, object callback, lighting state, or composition change.";
  }

  return "Convert the selected redirect into one observable move in the next textbox: a specific action, a specific question, or a specific offered choice.";
}

function allowedFormsFor(source: string): string[] {
  if (source === "player") {
    return [
      "spoken line only",
      "direct player action only",
      "direct player action plus one short spoken line"
    ];
  }

  return [
    "one visible action",
    "one clear spoken question or invitation",
    "one practical object, space, or task interaction"
  ];
}

function avoidListFor(source: string, selection?: CoherentNoveltySelection | null): string[] {
  const avoid = [
    "do not restate the beat label as prose",
    "do not add a second unrelated novelty beat",
    "do not rely only on atmosphere, scent, gaze, breath, silence, or hesitation"
  ];

  if (source !== "player") {
    avoid.push("do not decide the player-side character's reaction or consent");
  }

  if (!selection?.acceptedByJudge) {
    avoid.push("do not introduce new lore, danger, rivals, or external plot while stabilizing");
  }

  return avoid;
}
