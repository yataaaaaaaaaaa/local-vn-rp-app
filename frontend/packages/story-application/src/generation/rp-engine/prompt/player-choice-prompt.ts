/**
 * Prompt blocks for generated player turns.
 *
 * This module is intentionally narrow: it renders player-choice prompt text
 * only. It does not build story context, run agents, select novelty, clean
 * output, or decide workflow commit behavior.
 */

export function playerChoiceIdentityBlockTemplate(): string {
  return [
    "PLAYER_CHOICE_GENERATOR:",
    "You generate exactly one playable USER_REPLY for {{user.name}}.",
    "A USER_REPLY is a player choice or command, not NPC dialogue and not scene prose.",
    "Return only the reply text. No headings, labels, JSON, markdown, or explanations."
  ].join("\n");
}

export function playerChoiceRulesBlockTemplate(): string {
  return [
    "PLAYER_CHOICE_RULES:",
    "- Output one short playable choice for {{user.name}} only.",
    "- Allowed forms: spoken line only; direct player action only; direct player action plus one short spoken line.",
    "- Continue from LATEST_PREVIOUS_TURN. The current player turn has not started yet.",
    "- Keep it concise: target 18 words, hard maximum 28 words.",
    "- Use first person only for {{user.name}}'s own action or speech.",
    "- Do not write third-person scene narration.",
    "- Do not describe {{npc.name}}, the room, lighting, sounds, scent, facial expressions, body language, or atmosphere.",
    "- Do not write the NPC reaction, inner state, or future response.",
    "- Do not control {{npc.name}} or decide what {{npc.name}} feels, does, says, notices, or permits.",
    "- Do not use asterisks, markdown stage directions, or implementation labels.",
    "- End with complete terminal punctuation."
  ].join("\n");
}

export function playerChoiceExamplesBlockTemplate(): string[] {
  return [
    "GOOD USER_REPLY EXAMPLES:",
    "\"Wait. Explain what the ritual does first.\"",
    "I pull my hand back. \"Slow down.\"",
    "\"Fine. But no more secrets.\"",
    "Take the book back.",
    "",
    "BAD USER_REPLY EXAMPLES:",
    "*Your fingers brush mine as candlelight trembles over the parchment.*",
    "She smiles, overwhelmed by my response.",
    "The room fills with moonlight as destiny seals us together.",
    "I blush uncontrollably and realize I love you."
  ];
}

export function playerChoiceContextBlockTemplate(): string {
  return [
    "PLAYER_CHOICE_CONTEXT:",
    "STORY_SETUP:",
    "{{node.worldInfoBefore}}",
    "",
    "RECENT_EXCHANGE_BEFORE_LATEST:",
    "{{node.fullExchange}}",
    "",
    "LATEST_PREVIOUS_TURN:",
    "{{node.latestPreviousTurn}}",
    "",
    "RECENT_ACCEPTED_TEXT_TO_AVOID:",
    "{{node.recentOutputToAvoid}}",
    "",
    "Use STORY_SETUP only for facts and names. Use LATEST_PREVIOUS_TURN as the immediate prompt for the player choice."
  ].join("\n");
}

export function playerChoiceNoveltyBlockTemplate(): string {
  return [
    "PLAYER_CHOICE_NOVELTY:",
    "- TURN_REDIRECT: {{novelty.turnRedirect}}",
    "- RP-LLM coherence: {{novelty.coherenceSummary}}",
    "- Concrete beat: {{novelty.concreteSelectedBeat}}",
    "- Concrete execution: {{novelty.concreteExecution}}",
    "- Convert the concrete beat into one playable player choice only.",
    "- If TURN_REDIRECT says stabilize, choose one safe, direct, low-risk action or spoken line.",
    "- Do not add a second novelty beat. Do not expose beat labels or hidden planning."
  ].join("\n");
}

export function playerChoiceFinalTaskBlockTemplate(): string[] {
  return [
    "FINAL TASK:",
    "Write exactly one USER_REPLY for {{user.name}}.",
    "It must be a playable choice or command, not romance prose and not an NPC response.",
    "Maximum 28 words.",
    "",
    "OUTPUT ONLY THAT TEXT BELOW:"
  ];
}
