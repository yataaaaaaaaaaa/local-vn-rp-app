import type { AdvancementCard } from "../types";

export const PLAYER_RESPONSE_BEATS: AdvancementCard[] = [
  {
    id: "player_tease_back",
    label: "Tease back",
    weight: 12,
    directive: "Write a short playful reply or action that answers romantic tension with light friction.",
    constraint: "Do not narrate the counterpart's reaction.",
    minCloseness: 2,
    typicalAfter: 4,
    phases: ["spark", "charge"]
  },
  {
    id: "player_ask_directly",
    label: "Ask directly",
    weight: 10,
    directive: "Write one direct question from the player-side character about what the counterpart means or wants.",
    constraint: "Use one question only; do not continue as the counterpart.",
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold"]
  },
  {
    id: "player_step_closer",
    label: "Step closer",
    weight: 8,
    directive: "Write one concise player action that accepts or tests closeness without resolving everything.",
    constraint: "Do not assume the counterpart's consent or reaction.",
    minCloseness: 5,
    typicalAfter: 6,
    phases: ["trust", "threshold"]
  },
  {
    id: "player_hold_boundary",
    label: "Hold boundary",
    weight: 10,
    directive: "Write one short player line or action that slows the pace or sets a boundary while keeping the scene playable.",
    constraint: "Do not punish the boundary or make the counterpart react.",
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["trust", "threshold", "intimacy"]
  },
  {
    id: "player_admit_small_truth",
    label: "Admit small truth",
    weight: 11,
    directive: "Write a small, vulnerable player-side admission that gives the counterpart something meaningful to answer.",
    constraint: "Do not fully confess or define the whole relationship unless the scene is near resolution.",
    minCloseness: 4,
    typicalAfter: 6,
    phases: ["trust", "threshold"]
  },
  {
    id: "player_slow_pace",
    label: "Slow the pace",
    weight: 8,
    directive: "Write a player response that keeps romantic tension but asks for time, clarity, or gentleness.",
    constraint: "Keep it short and agency-preserving.",
    minCloseness: 4,
    typicalAfter: 5,
    phases: ["trust", "threshold", "intimacy"]
  },
  {
    id: "player_accept_invitation",
    label: "Accept invitation",
    weight: 7,
    directive: "Write one short player response that accepts the offered romantic step without jumping too far ahead.",
    constraint: "Do not write the counterpart's reaction or explicit outcome.",
    minCloseness: 6,
    typicalAfter: 7,
    phases: ["threshold", "intimacy"]
  },
  {
    id: "player_challenge_softly",
    label: "Challenge softly",
    weight: 9,
    directive: "Write a player line that challenges the counterpart to be more honest, braver, or clearer.",
    constraint: "Do not become cruel or adversarial unless the existing scene supports it.",
    minCloseness: 3,
    typicalAfter: 5,
    phases: ["charge", "trust", "threshold"]
  }
];
