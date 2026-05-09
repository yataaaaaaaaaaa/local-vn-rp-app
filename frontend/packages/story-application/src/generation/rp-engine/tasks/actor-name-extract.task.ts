import type { StoryNodeFields } from "@local-vn/story-domain";

import { stripProtocolNoise } from "../cleaning/protocol-noise";
import { renderPromptTemplate } from "../prompt/mustache-renderer";
import { normalizeActorNames } from "../state/actor-state";
import { storySetupFromContext } from "../state/story-context";
import type { RpActorNames } from "../types";

type ActorNamePromptData = {
  node: {
    storySetup: string;
  };
};

export function buildActorNameExtractionPrompt(node: StoryNodeFields): string {
  return renderPromptTemplate(layoutActorNameExtractionPromptTemplate(), {
    node: {
      storySetup: storySetupFromContext(node.context || "") || "(empty)"
    }
  } satisfies ActorNamePromptData);
}

export function parseActorNameExtractionOutput(raw: string): RpActorNames | null {
  const cleaned = stripProtocolNoise(raw)
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const lineProtocolResult = parseActorNameText(cleaned);
  if (lineProtocolResult.playerName || lineProtocolResult.npcName) return lineProtocolResult;

  try {
    const parsed = JSON.parse(cleaned) as Partial<RpActorNames>;
    return normalizeActorNames({
      playerName: typeof parsed.playerName === "string" ? parsed.playerName : null,
      npcName: typeof parsed.npcName === "string" ? parsed.npcName : null
    });
  } catch {
    return null;
  }
}

export function parseActorNameText(raw: string): RpActorNames {
  const player = raw.match(/^PLAYER_NAME:\s*(.+)$/im)?.[1]?.trim();
  const npc = raw.match(/^NPC_NAME:\s*(.+)$/im)?.[1]?.trim();

  return normalizeActorNames({
    playerName: normalizeUnknown(player),
    npcName: normalizeUnknown(npc)
  });
}

function layoutActorNameExtractionPromptTemplate(): string {
  return [
    "Extract actor names from the RP context.",
    "Return exactly two lines.",
    "",
    "PLAYER_NAME: <name or UNKNOWN>",
    "NPC_NAME: <name or UNKNOWN>",
    "",
    "Rules:",
    "- PLAYER_NAME is the controlled/player-side character.",
    "- NPC_NAME is the main two-character romance counterpart currently interacting with the player-side character.",
    "- Do not infer names unless the context clearly assigns roles.",
    "- Do not include titles, descriptions, or extra fields.",
    "",
    "STABLE_STORY_SETUP:",
    "{{node.storySetup}}",
    "",
    "OUTPUT:"
  ].join("\n");
}

function normalizeUnknown(value?: string): string | null {
  if (!value) return null;
  if (/^(unknown|null|none|n\/a)$/i.test(value.trim())) return null;
  return value.trim();
}
