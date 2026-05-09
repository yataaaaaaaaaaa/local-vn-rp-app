import type { RpAgent } from "./types";
import { createClothingVisualPlanContribution } from "./clothing-agent-helpers";

export const USER_CLOTHING_AGENT: RpAgent = {
  id: "user_clothing_agent",
  run(input) {
    return createClothingVisualPlanContribution({
      factPrefix: "user",
      promptSubjectLabel: "player-side character",
      text: [
        input.node.context,
        input.node.userText,
        input.node.visualDescription
      ].join("\n")
    });
  }
};
