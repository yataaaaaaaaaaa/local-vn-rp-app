import type { RpAgent } from "./types";
import { createClothingVisualPlanContribution } from "./clothing-agent-helpers";

export const NPC_CLOTHING_AGENT: RpAgent = {
  id: "npc_clothing_agent",
  run(input) {
    return createClothingVisualPlanContribution({
      factPrefix: "npc",
      promptSubjectLabel: "NPC counterpart",
      text: [
        input.node.context,
        input.node.dialogue,
        input.node.visualDescription
      ].join("\n")
    });
  }
};
