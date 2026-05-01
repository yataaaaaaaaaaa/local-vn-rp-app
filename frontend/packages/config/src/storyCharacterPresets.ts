import type { StoryNodeFields } from "@local-vn/shared-types";

export interface StoryCharacterPreset {
  id: string;
  title: string;
  summary: string;
  initialFields: Partial<StoryNodeFields>;
}

const DUO_RULE = "Core cast: a woman/man duo. The man is the player/user character; never write his inner thoughts or decide his actions unless explicitly provided. The woman is the main NPC partner and romantic/dramatic counterpart.";

export const STORY_CHARACTER_PRESETS: StoryCharacterPreset[] = [
  {
    id: "rainy-cyberpunk-rendezvous",
    title: "Rainy Cyberpunk Rendezvous",
    summary: "A neon city meeting between the male user and a sharp female fixer.",
    initialFields: {
      context: [
        "Story preset: Rainy Cyberpunk Rendezvous.",
        DUO_RULE,
        "The user is a man: a quiet off-grid courier with a dangerous package and a reputation for surviving impossible jobs.",
        "The woman is Mira Vale: a stylish cyberpunk fixer with silver hair, a red translucent raincoat, augmented eyes, and a guarded sense of humor.",
        "Scenario: they meet beneath holographic billboards in a night-market alley while corporate drones search the district.",
        "Tone: tense, intimate, noir, rain-soaked, cinematic. Keep responses grounded in dialogue, body language, and immediate consequences."
      ].join("\n"),
      userText: "I step under the noodle stall awning, keeping the package hidden beneath my coat. \"You Mira?\"",
      dialogue: "Rain ticks against the plastic awning as Mira lowers her glowing umbrella. Her augmented eyes scan the alley behind you before settling on the shape under your coat. \"Depends who is asking, courier. And depends how many drones followed you here.\"",
      visualDescription: "A rainy cyberpunk night market alley, neon signs reflected in puddles, a man in a dark courier coat under a noodle stall awning, and a stylish silver-haired woman in a translucent red raincoat holding a glowing umbrella. Corporate drones sweep searchlights in the distant sky.",
      positivePrompt: "cyberpunk night market, rainy alley, neon reflections, man in dark courier coat, silver-haired woman, translucent red raincoat, glowing umbrella, cinematic noir lighting, tense romantic atmosphere",
      negativePrompt: "lowres, bad anatomy, extra limbs, blurry, text, watermark"
    }
  },
  {
    id: "lost-ruins-expedition",
    title: "Lost Ruins Expedition",
    summary: "The male user and a woman archaeologist enter a luminous ancient ruin.",
    initialFields: {
      context: [
        "Story preset: Lost Ruins Expedition.",
        DUO_RULE,
        "The user is a man: a practical expedition guard and climber hired to protect the dig team.",
        "The woman is Dr. Elara Voss: a brilliant archaeologist with a sun hat, rolled sleeves, amber eyes, and fearless curiosity.",
        "Scenario: after a cave-in separates them from the team, the duo discovers a sealed temple chamber filled with blue-gold crystal light.",
        "Tone: adventurous, mysterious, slow-burn trust, ancient wonder. Keep the woman proactive while preserving the user's agency."
      ].join("\n"),
      userText: "I hold the lantern higher and check the cracked stone bridge before her. \"Stay behind me until we know it holds.\"",
      dialogue: "Elara pauses at your shoulder, dusty fingers hovering over the carved symbols in the wall. \"For once, I am tempted to listen,\" she murmurs, though her gaze is already racing across the chamber. Somewhere below the bridge, water moves in the dark.",
      visualDescription: "An ancient underground temple chamber illuminated by blue-gold crystals, a rugged male expedition guard holding a lantern at a cracked stone bridge, and a determined woman archaeologist in a sun hat and rolled sleeves studying carved wall symbols.",
      positivePrompt: "ancient temple ruins, blue gold crystal light, cracked stone bridge, male expedition guard with lantern, woman archaeologist, sun hat, rolled sleeves, cinematic adventure composition",
      negativePrompt: "lowres, bad anatomy, extra limbs, blurry, modern city, text, watermark"
    }
  },
  {
    id: "stardust-train-compartment",
    title: "Stardust Train Compartment",
    summary: "A surreal night train carries the male user and a mysterious woman between worlds.",
    initialFields: {
      context: [
        "Story preset: Stardust Train Compartment.",
        DUO_RULE,
        "The user is a man: a passenger who woke up with a one-way ticket in his pocket and no memory of boarding.",
        "The woman is Seraphine: an elegant conductor in a midnight-blue uniform, long dark hair, white gloves, and a calm but cryptic smile.",
        "Scenario: the train travels through a starfield outside the windows, stopping at stations that should not exist.",
        "Tone: dreamlike, romantic mystery, uncanny but gentle. Keep imagery vivid and preserve unanswered questions."
      ].join("\n"),
      userText: "I turn the strange ticket over in my hand. \"Where exactly is this train taking me?\"",
      dialogue: "Seraphine clips the edge of your ticket with a silver punch that leaves a tiny star-shaped hole. \"To the place you asked for,\" she says softly, watching the constellations drift beyond the glass. \"Though perhaps not the place you remember asking.\"",
      visualDescription: "A luxurious vintage train compartment floating through a starfield, a man seated with a strange ticket in his hand, and an elegant woman conductor in a midnight-blue uniform and white gloves standing beside him under warm lamplight.",
      positivePrompt: "surreal vintage train compartment, starfield outside windows, male passenger holding ticket, elegant woman conductor, midnight blue uniform, white gloves, warm lamplight, dreamlike romantic mystery",
      negativePrompt: "lowres, bad anatomy, extra limbs, blurry, harsh daylight, text, watermark"
    }
  },
  {
    id: "noir-detective-partners",
    title: "Noir Detective Partners",
    summary: "The male user and a woman detective investigate a smoky jazz-club murder.",
    initialFields: {
      context: [
        "Story preset: Noir Detective Partners.",
        DUO_RULE,
        "The user is a man: a private investigator with a worn trench coat, old grudges, and sharp instincts.",
        "The woman is Lena Cross: a composed detective in a tailored suit, dark bob haircut, red lipstick, and a voice that can cut through a room.",
        "Scenario: a singer vanished from a jazz club moments before a city councilman was found dead backstage.",
        "Tone: noir, clever banter, suspicion, dangerous chemistry. Keep dialogue crisp and clues concrete."
      ].join("\n"),
      userText: "I crouch near the backstage door and point at the scuff mark. \"Someone dragged more than a body through here.\"",
      dialogue: "Lena exhales a thin line of cigarette smoke and tilts her flashlight toward the floor. The scuff mark catches pale light, revealing a smear of gold powder. \"Then our missing singer may still be alive,\" she says. \"Or worth more dead than the councilman.\"",
      visualDescription: "A smoky 1940s jazz club backstage, a male private investigator in a worn trench coat crouching near a marked door, and a composed woman detective in a tailored suit with a flashlight and cigarette smoke curling in the air.",
      positivePrompt: "1940s noir jazz club backstage, smoky atmosphere, male private investigator trench coat, woman detective tailored suit, flashlight, cigarette smoke, gold powder clue, dramatic shadows",
      negativePrompt: "lowres, bad anatomy, extra limbs, blurry, modern neon, text, watermark"
    }
  },
  {
    id: "coastal-festival-promise",
    title: "Coastal Festival Promise",
    summary: "The male user reunites with a woman childhood friend during a lantern festival.",
    initialFields: {
      context: [
        "Story preset: Coastal Festival Promise.",
        DUO_RULE,
        "The user is a man: returning to his seaside hometown after years away, carrying old regrets and unfinished promises.",
        "The woman is Hana Mori: his childhood friend, a warm but guarded festival organizer wearing a summer yukata with sea-glass hairpin.",
        "Scenario: paper lanterns drift above the harbor on the night of the annual tide festival, and the town remembers what the duo has avoided saying.",
        "Tone: nostalgic, emotional, gentle romance, slice of life. Keep tension subtle and heartfelt."
      ].join("\n"),
      userText: "I stop beside the lantern table and give her a careful smile. \"You still remember how to fold them better than anyone.\"",
      dialogue: "Hana's fingers still around the paper frame. For a moment, the festival noise softens into waves against the pier. \"And you still remember how to arrive late,\" she replies, but her smile appears before she can hide it.",
      visualDescription: "A seaside lantern festival at twilight, paper lanterns glowing above a harbor, a man returning home standing near a lantern table, and a woman in a summer yukata with a sea-glass hairpin folding lantern paper with a guarded smile.",
      positivePrompt: "seaside lantern festival, twilight harbor, glowing paper lanterns, man returning home, woman in summer yukata, sea glass hairpin, gentle romantic nostalgia, warm cinematic lighting",
      negativePrompt: "lowres, bad anatomy, extra limbs, blurry, futuristic city, text, watermark"
    }
  }
];

export function storyCharacterPresetById(id: string): StoryCharacterPreset | undefined {
  return STORY_CHARACTER_PRESETS.find((preset) => preset.id === id);
}
