import { latestPreviousTurnFromContext, recentOutputToAvoidText } from "../state/story-context";
import type { RpAgent } from "./types";

export const DIALOGUE_QUALITY_AGENT: RpAgent = {
  id: "dialogue_quality_agent",
  run(input) {
    const recent = recentOutputToAvoidText(input.node);
    const previous = latestPreviousTurnFromContext(input.node.context || "");
    const latestText = [input.node.userText, input.node.dialogue, previous, recent].join("\n");
    const repeatedQuestionRisk = /\b(?:can i ask|are you sure|really\?|what do you mean|why do you say that)\b/i.test(latestText);
    const petNameRisk = repeatedPetNameRisk(latestText);
    const stallRisk = repeatedQuestionRisk || /\b(?:silence stretches|smirk|blush|heart beats|leans closer)\b/i.test(recent);

    const notes = [
      {
        source: "dialogue-quality",
        text: [
          `stall risk=${stallRisk}`,
          `repeated question risk=${repeatedQuestionRisk}`,
          `pet-name loop risk=${petNameRisk}`,
          recent && recent !== "(empty)" ? `recent output to avoid=${recent}` : "recent output to avoid=none"
        ].join("; ")
      }
    ];

    const candidates = [
      {
        id: "dialogue-quality:direct-answer-or-choice",
        source: "dialogue_quality",
        weight: stallRisk ? 1.1 : 0.55,
        label: "direct answer or concrete choice",
        text: "Use one dialogue-quality redirect: answer the latest player input directly or make one concrete NPC choice that moves the scene forward. Do not ask another vague question or repeat a recent phrase.",
        rationale: "Dialogue quality guard against stalling, phrase loops, and passive replies.",
      },
      {
        id: "dialogue-quality:physical-progress-without-hijack",
        source: "dialogue_quality",
        weight: 0.45,
        label: "small physical progress without hijacking",
        text: "Use one dialogue-quality redirect: include a small visible NPC action that changes the scene state, while leaving the player's thoughts, dialogue, consent, and irreversible actions untouched.",
        rationale: "Dialogue quality guard against static talking-head replies.",
      }
    ];

    return {
      facts: {
        dialogue_quality_state: notes[0]!.text
      },
      fixedTags: [],
      notes,
      candidates
    };
  }
};

function repeatedPetNameRisk(text: string): boolean {
  const matches = text.match(/\b(?:darling|dear|sweetheart|love|princess|kitten|baby)\b/gi) ?? [];
  return matches.length >= 3;
}
