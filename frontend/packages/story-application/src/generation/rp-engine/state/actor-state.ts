import type { RpActorLabels, RpActorNames } from "../types";

export function resolvedActorLabels(actorNames?: RpActorNames | null): RpActorLabels {
  const player = normalizeActorName(actorNames?.playerName) || "the player character";
  const npc = normalizeActorName(actorNames?.npcName) || "the romance partner";

  return {
    player,
    npc,
    Player: sentenceStart(player),
    Npc: sentenceStart(npc),
    playerPossessive: possessive(player),
    npcPossessive: possessive(npc)
  };
}

export function normalizeActorNames(actorNames: RpActorNames): RpActorNames {
  return {
    playerName: normalizeActorName(actorNames.playerName),
    npcName: normalizeActorName(actorNames.npcName)
  };
}

export function normalizeActorName(name: string | null | undefined): string | null {
  const cleaned = (name ?? "")
    .replace(/\s+/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .trim();

  if (!cleaned || cleaned.toLowerCase() === "null" || cleaned.toLowerCase() === "unknown") return null;

  return cleaned.slice(0, 80);
}

export function sentenceStart(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function possessive(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return /s$/i.test(trimmed) ? trimmed + "'" : trimmed + "'s";
}
