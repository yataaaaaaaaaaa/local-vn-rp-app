import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryNodeFields } from "@local-vn/story-domain";

import type { StoryGenerationBackend } from "../ports";
import {
    addSingleTagChoiceByNumber,
    addTagsFromQuestion,
    askTagsFromQuestion,
    isVisible,
    type VisualPlannerRuntime
} from "./visualPromptQuestionHelpers";
import {
    dedupeTags,
    formatVisualPromptPlan,
    type VisualPromptPlan
} from "./visualPromptProtocol";
import {
    hasTagAmong,
    type AllowedTag
} from "./visualPromptTagHelpers";

const SUBJECT_TAGS: AllowedTag[] = [
    { tag: "1girl", aliases: ["one girl", "a girl", "female character"] },
    { tag: "1boy", aliases: ["one boy", "a boy", "male character"] },
    { tag: "solo", aliases: ["alone", "single character"] },
    { tag: "1girl, 1boy", aliases: ["one girl and one boy", "girl and boy"] },
    { tag: "2girls", aliases: ["two girls"] },
    { tag: "2boys", aliases: ["two boys"] },
    { tag: "multiple girls" },
    { tag: "multiple boys" },
    { tag: "group" }
];

const CAMERA_ANGLE_TAGS: AllowedTag[] = [
    { tag: "straight-on", aliases: ["front view", "straight on", "facing camera"] },
    { tag: "from above", aliases: ["high angle", "view from above", "viewed from above"] },
    { tag: "from below", aliases: ["low angle", "view from below", "viewed from below"] },
    { tag: "from side", aliases: ["side view", "side profile"] },
    { tag: "from behind", aliases: ["back view", "rear view"] },
    { tag: "dutch angle" },
    { tag: "high up" },
    { tag: "sideways" },
    { tag: "upside-down", aliases: ["upside down"] },
    { tag: "multiple views" }
];

const FRAMING_TAGS: AllowedTag[] = [
    { tag: "close-up", aliases: ["close up"] },
    { tag: "portrait" },
    { tag: "upper body" },
    { tag: "cowboy shot" },
    { tag: "thighs" },
    { tag: "knees up" },
    { tag: "full body" },
    { tag: "wide shot" }
];

const FOCUS_TAGS: AllowedTag[] = [
    { tag: "eye focus" },
    { tag: "hand focus" },
    { tag: "leg focus" },
    { tag: "foot focus" },
    { tag: "back focus" },
    { tag: "clothes focus" },
    { tag: "footwear focus" },
    { tag: "object focus" },
    { tag: "text focus" },
    { tag: "vehicle focus" },
    { tag: "weapon focus" },
    { tag: "animal focus" },
    { tag: "plant focus" },
    { tag: "solo focus" },
    { tag: "soft focus" }
];

const VISIBLE_BODY_REGION_TAGS: AllowedTag[] = [
    { tag: "face" },
    { tag: "eyes" },
    { tag: "mouth" },
    { tag: "hair" },
    { tag: "neck" },
    { tag: "shoulders", aliases: ["shoulder"] },
    { tag: "arms", aliases: ["arm"] },
    { tag: "hands", aliases: ["hand"] },
    { tag: "chest" },
    { tag: "midriff", aliases: ["abdomen", "stomach", "belly", "ventre"] },
    { tag: "navel" },
    { tag: "hips" },
    { tag: "bottomwear" },
    { tag: "underwear" },
    { tag: "legs", aliases: ["leg"] },
    { tag: "feet", aliases: ["foot"] },
    { tag: "footwear" }
];

const EMOTION_TAGS: AllowedTag[] = [
    { tag: "neutral expression" },
    { tag: "soft smile" },
    { tag: "smile" },
    { tag: "seductive smile" },
    { tag: "grin" },
    { tag: "laughing" },
    { tag: "serious" },
    { tag: "shy" },
    { tag: "blush, shy", aliases: ["blush shy", "shy blush", "blush, shy,"] },
    { tag: "embarrassed, blush" },
    { tag: "surprised" },
    { tag: "sad" },
    { tag: "angry" },
    { tag: "confident" },
    { tag: "smirk" },
    { tag: "sleepy" },
    { tag: "peaceful" }
];

const FACIAL_EXPRESSION_DETAIL_TAGS: AllowedTag[] = [
    { tag: "seductive smile" },
    { tag: "grin" },
    { tag: "shy" },
    { tag: "blush, shy", aliases: ["blush shy", "shy blush", "blush, shy,"] }
];

const EYE_EXPRESSION_TAGS: AllowedTag[] = [
    { tag: "pleading eyes" },
    { tag: "tareme" },
    { tag: "heart-shaped pupils" },
    { tag: "closing eyes", aliases: ["closed eyes", "eyes closing"] }
];

const MOUTH_EXPRESSION_TAGS: AllowedTag[] = [
    { tag: "wavy mouth" }
];

const BODY_STATE_TAGS: AllowedTag[] = [
    { tag: "shaking" },
    { tag: "trembling" },
    { tag: "sweating" },
    { tag: "trembling, sweating", aliases: ["trembling sweating"] }
];

const SHOULDER_TAGS: AllowedTag[] = [
    { tag: "naked shoulder", aliases: ["bare shoulder"] },
    { tag: "naked shoulders", aliases: ["bare shoulders"] },
    { tag: "bare shoulders" },
    { tag: "one bare shoulder" },
    { tag: "off shoulder" },
    { tag: "shoulder cutout" },
    { tag: "sleeveless" }
];

const NECKWEAR_TAGS: AllowedTag[] = [
    { tag: "scarf" },
    { tag: "scarf, enpera", aliases: ["enpera scarf", "scarf enpera"] },
    {
        tag: "turtleneck sweater",
        aliases: ["turtlecneck sweater", "turtleneck", "turtle neck sweater"]
    }
];

const UPPER_BODY_EXPOSURE_TAGS: AllowedTag[] = [
    { tag: "open clothes, midriff" },
    { tag: "midriff" },
    { tag: "navel" },
    { tag: "stomach" },
    { tag: "collarbone" },
    { tag: "cleavage" },
    { tag: "stomach cutout" }
];

const FULL_OUTFIT_TAGS: AllowedTag[] = [
    { tag: "fully clothed" },
    { tag: "casual clothes" },
    { tag: "school uniform" },
    { tag: "maid outfit" },
    { tag: "miku outfit", aliases: ["hatsune miku outfit", "miku costume"] },
    { tag: "medieval armor" },
    { tag: "dress" },
    { tag: "uniform" },
    { tag: "robe" },
    { tag: "cloak" },
    { tag: "bodysuit" }
];

const MIKU_OUTFIT_DETAIL_TAGS: AllowedTag[] = [
    { tag: "detached sleeves" },
    { tag: "necktie" },
    { tag: "pleated skirt" },
    { tag: "thighhighs" },
    { tag: "headset" }
];

const MAID_OUTFIT_DETAIL_TAGS: AllowedTag[] = [
    { tag: "maid headdress" },
    { tag: "apron" },
    { tag: "frilled dress" },
    { tag: "frills" },
    { tag: "bow" },
    { tag: "white gloves" }
];

const MEDIEVAL_ARMOR_DETAIL_TAGS: AllowedTag[] = [
    { tag: "breastplate" },
    { tag: "pauldrons" },
    { tag: "gauntlets" },
    { tag: "greaves" },
    { tag: "armored boots" },
    { tag: "helmet" },
    { tag: "chainmail" },
    { tag: "cape" }
];

const UPPER_CLOTHING_TAGS: AllowedTag[] = [
    { tag: "shirt" },
    { tag: "t-shirt" },
    { tag: "blouse" },
    { tag: "sweater" },
    { tag: "hoodie", aliases: ["hoodies"] },
    {
        tag: "turtleneck sweater",
        aliases: ["turtlecneck sweater", "turtleneck", "turtle neck sweater"]
    },
    { tag: "jacket" },
    { tag: "coat" },
    { tag: "dress" },
    { tag: "breastplate" },
    { tag: "chainmail" },
    { tag: "detached sleeves" },
    { tag: "frilled dress" },
    { tag: "crop top" },
    { tag: "tank top" },
    { tag: "camisole" }
];

const HOODIE_STATE_TAGS: AllowedTag[] = [
    { tag: "hood up" },
    { tag: "hood down" }
];

const BOTTOMWEAR_TAGS: AllowedTag[] = [
    { tag: "skirt" },
    { tag: "short skirt" },
    { tag: "long skirt" },
    { tag: "pants" },
    { tag: "jeans" },
    { tag: "shorts" },
    { tag: "dress" },
    { tag: "pleated skirt" },
    { tag: "armor skirt" },
    { tag: "leggings" }
];

const UNDERWEAR_TAGS: AllowedTag[] = [
    { tag: "underwear" },
    { tag: "panties" },
    { tag: "bra" },
    { tag: "lingerie" },
    { tag: "underwear only" }
];

const LEGWEAR_TAGS: AllowedTag[] = [
    { tag: "bare legs" },
    { tag: "thighs" },
    { tag: "knees" },
    { tag: "pantyhose" },
    { tag: "leggings" },
    { tag: "thighhighs" },
    { tag: "kneehighs" },
    { tag: "socks" }
];

const FOOTWEAR_TAGS: AllowedTag[] = [
    { tag: "barefoot" },
    { tag: "shoes" },
    { tag: "sneakers" },
    { tag: "boots" },
    { tag: "sandals" },
    { tag: "high heels" }
];

const MOTION_EFFECT_TAGS: AllowedTag[] = [
    { tag: "motion lines" },
    { tag: "speed lines" },
    { tag: "motion blur" }
];

const SECONDARY_CONTACT_ACTION_TAGS: AllowedTag[] = [
    { tag: "ass grab", aliases: ["grabbing another's ass", "grabbing ass"] },
    { tag: "breast grab", aliases: ["grabbing another's breast", "grabbing breast"] },
    { tag: "waist grab", aliases: ["grabbing another's waist", "grabbing waist"] },
    { tag: "stomach grab", aliases: ["grabbing another's stomach", "grabbing stomach"] },
    { tag: "arm grab", aliases: ["grabbing another's arm", "grabbing arms"] },
    { tag: "holding hands", aliases: ["hands holding", "holding another's hand"] }
];

const ACTION_FAMILY_TAGS: AllowedTag[] = [
    { tag: "idle/static pose" },
    { tag: "locomotion/body movement" },
    { tag: "gesture" },
    { tag: "self-contact" },
    { tag: "object interaction" },
    { tag: "character interaction" },
    { tag: "combat/impact" },
    { tag: "reaction/expressive movement" }
];

const ACTION_SUBFAMILY_TAGS: Record<string, AllowedTag[]> = {
    "idle/static pose": [
        { tag: "standing pose" },
        { tag: "sitting pose" },
        { tag: "kneeling pose" },
        { tag: "lying pose" },
        { tag: "leaning pose" },
        { tag: "solo everyday pose" },
        { tag: "resting/bed pose" },
        { tag: "strategic/composed pose" }
    ],
    "locomotion/body movement": [
        { tag: "walking movement" },
        { tag: "running movement" },
        { tag: "turning movement" },
        { tag: "jumping movement" },
        { tag: "falling movement" },
        { tag: "dance/performance movement" },
        { tag: "dodging movement" }
    ],
    gesture: [
        { tag: "waving gesture" },
        { tag: "pointing gesture" },
        { tag: "reaching gesture" },
        { tag: "raised hand gesture" },
        { tag: "hand near face gesture" }
    ],
    "self-contact": [
        { tag: "hand on body" },
        { tag: "touching face" },
        { tag: "adjusting hair" },
        { tag: "undressing action" },
        { tag: "clasped hands" },
        { tag: "covering self" }
    ],
    "object interaction": [
        { tag: "holding object" },
        { tag: "using object" },
        { tag: "carrying object" },
        { tag: "opening object" },
        { tag: "eating or drinking" },
        { tag: "reading/writing interaction" },
        { tag: "music/performance interaction" },
        { tag: "game interaction" },
        { tag: "work/analysis interaction" }
    ],
    "character interaction": [
        { tag: "hugging interaction" },
        { tag: "holding hands interaction" },
        { tag: "romantic interaction" },
        { tag: "friendly pair interaction" },
        { tag: "comfort/cuddle interaction" },
        { tag: "playful/teasing interaction" },
        { tag: "adult intimate interaction", aliases: ["nsfw interaction", "sexual interaction", "sex"] },
        { tag: "touching another character" },
        { tag: "facing another character" },
        { tag: "supporting another character" }
    ],
    "combat/impact": [
        { tag: "weapon action" },
        { tag: "defensive action" },
        { tag: "impact reaction" },
        { tag: "falling after impact" },
        { tag: "dynamic attack pose" },
        { tag: "armed combat pose" },
        { tag: "ranged aiming pose" }
    ],
    "reaction/expressive movement": [
        { tag: "startled reaction" },
        { tag: "flinching reaction" },
        { tag: "turning back reaction" },
        { tag: "celebrating reaction" },
        { tag: "hiding reaction" },
        { tag: "drunk/recovering reaction" },
        { tag: "analytical reaction" },
        { tag: "shy/covered reaction" }
    ]
};

// Action-final choices can intentionally be comma-separated bundles.
// Janku often needs the core relation/action tags together instead of a single isolated tag.
// These bundles are intentionally cleaned to avoid duplicating tags handled by later planner steps:
// subject count, camera/framing/POV/focus, visible body regions, facial expression, body state,
// outfit/clothing, motion effects, background, lighting, and time of day. Secondary contact
// details are also asked by `addSecondaryContactActionTags` when relevant.
// Adult-intimate bundles should only be used when all depicted characters are clearly adults.
const SOLO_EVERYDAY_ACTION_TAGS: AllowedTag[] = [
    { tag: "umbrella, looking away" },
    { tag: "sitting, book, arm support, reading" },
    { tag: "eating, sandwich, sitting" },
    { tag: "writing, notebook, sitting" },
    { tag: "microphone, singing" },
    { tag: "guitar, playing instrument" },
    { tag: "dancing, arm up" },
    { tag: "looking back" },
    { tag: "gardening, standing" },
    { tag: "looking away" },
    { tag: "lying, book" },
    { tag: "jumping, looking at viewer" },
    { tag: "playing games, sitting" },
    { tag: "lying, hugging plush, fluffy plush, big plush" },
    { tag: "arms under breasts, breast hold" },
    { tag: "lap pillow invitation, patting lap" },
    { tag: "wrapped towel" }
];

const RESTING_BED_ACTION_TAGS: AllowedTag[] = [
    { tag: "lying in bed, hugging plush, tight hug" },
    { tag: "under covers, sitting, covering" },
    { tag: "under blanket, afterglow, lying" },
    { tag: "sleeping together, blanket" },
    { tag: "lying, on back, arms outstretched" },
    { tag: "lap pillow, lap pov" }
];

const STRATEGIC_COMPOSED_ACTION_TAGS: AllowedTag[] = [
    { tag: "arm rest, looking to the side, thinking" },
    { tag: "holding flower, smelling flower" },
    { tag: "hands on table, maps, shaded face, wooden table" },
    { tag: "playing chess, hand on piece, focused, thinking, strategic atmosphere, winning" },
    { tag: "hands together, composed, manipulative aura" },
    { tag: "analyzing data, holographic interface, focused, intelligent, futuristic" },
    { tag: "connecting clues, notes, diagrams, cause and effect, analyzing, focused, board, red string" },
    { tag: "clean organized workspace, advanced tools, assembling machine, efficient movements, controlled environment" }
];

const PAIR_FRIENDLY_ACTION_TAGS: AllowedTag[] = [
    { tag: "walking, holding hands" },
    { tag: "running, holding hands" },
    { tag: "sitting, book, looking at another" },
    { tag: "sitting, playing games, teasing" },
    { tag: "headpat" },
    { tag: "hair ruffling, teasing" },
    { tag: "hug" },
    { tag: "hug from behind" },
    { tag: "arm hug, walking" },
    { tag: "cuddling, sitting" },
    { tag: "piggyback" },
    { tag: "head on another's shoulder, sitting" },
    { tag: "comforting, head on another's shoulder" },
    { tag: "looking at another" },
    { tag: "pointing at another, teasing" },
    { tag: "fidgeting, looking at another" },
    { tag: "bowing, standing" },
    { tag: "microphone, singing" },
    { tag: "violin, playing instrument" },
    { tag: "dancing, looking at another" },
    { tag: "drinking, mug, sitting" },
    { tag: "eating, sandwich" },
    { tag: "cooking, stirring" },
    { tag: "giving flower" },
    { tag: "feeding, shared food" },
    { tag: "cheering, hands up" },
    { tag: "fanning, standing" },
    { tag: "hands on another's shoulders, lifting person" },
    { tag: "hands on another's chest, head rest" },
    { tag: "lap pillow, headpat, lying on lap, sleeping on person" },
    { tag: "breasts on head, breast smother, head between breasts" },
    { tag: "grabbing another's chin" },
    { tag: "shoulder-to-shoulder, head tilt" },
    { tag: "leaning forward, kissing, hand on another's cheek" },
    { tag: "breasts on another's back, hug from behind, breast press" }
];

const PLAYFUL_TEASING_ACTION_TAGS: AllowedTag[] = [
    { tag: "tickling stomach, belly rub, lying" },
    { tag: "tickling, lying" },
    { tag: "hand under clothes, lifting another's clothes, reach-around, sitting" },
    { tag: "lying on top, sleeping, hand on another's stomach" }
];

const ADULT_INTIMATE_ACTION_TAGS: AllowedTag[] = [
    { tag: "shared bathing, mixed-sex bathing, arms around neck, hug, girl on top, upright straddle, sex, vaginal" },
    { tag: "girl on top, straddling, sex, vaginal, interlocked fingers" },
    { tag: "missionary, sex, lying, breasts squeezed together" },
    { tag: "missionary, sex, lying, interlocked fingers, vaginal" },
    { tag: "groping, lying, sex" },
    { tag: "embracing, hugging, lying, sex" },
    { tag: "girl on top, hugging, lying, sex, vaginal" },
    { tag: "breast sucking, sitting, sex, woman on top" },
    { tag: "on stomach, sex" },
    { tag: "sitting, embracing, hug, kissing, girl on top, sex" },
    { tag: "spooning, sex, vaginal" },
    { tag: "licking another's face, spooning, sex, vaginal" },
    { tag: "doggystyle, all fours, sex" },
    { tag: "doggystyle, on stomach, sex" },
    { tag: "missionary, lying, on back, sex, arched back" },
    { tag: "doggystyle, sex, vaginal, creampie, squirting" },
    { tag: "hug, vaginal, penetration, ejaculation, pussy juice" },
    { tag: "cowgirl position, girl on top, upright straddle, straddling, sex, vaginal, cum in pussy" },
    { tag: "under blanket, missionary, sex" },
    { tag: "standing, suspended, sex, leg lock" },
    { tag: "sitting, sofa, face to face, sex, straddling, hug" },
    { tag: "standing, doggystyle, sex, breasts press, against glass" },
    { tag: "embracing, hugging, lying, sex, femdom, girl on top" },
    { tag: "hugging, kissing, breasts press, face to face" },
    { tag: "standing, sex, leg lock, lifting person, suspended congress" },
    { tag: "standing, doggystyle, sex, grabbing another's hips, tiptoes" },
    { tag: "spread legs, spread pussy" },
    { tag: "lying, on back, sex, bouncing breasts" },
    { tag: "mating press, sex, breast press, kissing, hands on another's face, lying, on back" },
    { tag: "mating press, sex, breast press, kissing, hugging, lying, on back, leg lock" },
    { tag: "spooning, vaginal, sex, grabbing one leg" },
    { tag: "sitting, upright straddle, breast press, kissing, sitting on person, sex" },
    { tag: "reach around, sitting, sex, vaginal" },
    { tag: "lying in bed, squeezing head between breasts, hugging, tight hug" },
    { tag: "lying, on stomach, girl on top, breasts press, kissing, tight hug" },
    { tag: "undressing, clothed male nude female" },
    { tag: "public indecency, clothes lift, showing off" },
    { tag: "covering privates, covered nipples" }
];

const ARMED_COMBAT_ACTION_TAGS: AllowedTag[] = [
    { tag: "fighting stance, sword" },
    { tag: "ready to draw, katana, fighting stance, holding sheath" },
    { tag: "aiming, gun" },
    { tag: "dodging, afterimage, projectile trail" }
];

const DRUNK_RECOVERING_ACTION_TAGS: AllowedTag[] = [
    { tag: "wasted, lying, drunk" },
    { tag: "wasted, lying, sofa, bottles, drunk, holding bottle" }
];

const ACTION_FINAL_TAGS: Record<string, AllowedTag[]> = {
    "standing pose": [
        { tag: "standing" },
        { tag: "standing, looking at viewer" },
        { tag: "standing, leaning forward" }
    ],
    "sitting pose": [
        { tag: "sitting" },
        { tag: "sitting, crossed legs" },
        { tag: "sitting, leaning back" }
    ],
    "kneeling pose": [
        { tag: "kneeling" },
        { tag: "kneeling, leaning forward" },
        { tag: "one knee" }
    ],
    "lying pose": [
        { tag: "lying" },
        { tag: "on back" },
        { tag: "on side" },
        { tag: "on stomach" }
    ],
    "leaning pose": [
        { tag: "leaning forward" },
        { tag: "leaning back" },
        { tag: "leaning against object" }
    ],
    "solo everyday pose": SOLO_EVERYDAY_ACTION_TAGS,
    "resting/bed pose": RESTING_BED_ACTION_TAGS,
    "strategic/composed pose": STRATEGIC_COMPOSED_ACTION_TAGS,
    "walking movement": [
        { tag: "walking" },
        { tag: "walking toward viewer" },
        { tag: "walking away" }
    ],
    "running movement": [
        { tag: "running" },
        { tag: "running toward viewer" },
        { tag: "running away" }
    ],
    "turning movement": [
        { tag: "turning" },
        { tag: "looking back" },
        { tag: "turning around" }
    ],
    "jumping movement": [
        { tag: "jumping" },
        { tag: "midair" },
        { tag: "dynamic pose" }
    ],
    "falling movement": [
        { tag: "falling" },
        { tag: "off balance" },
        { tag: "dynamic pose" }
    ],
    "dance/performance movement": [
        { tag: "dancing" },
        { tag: "dancing, arm up" },
        { tag: "dancing, looking at another" }
    ],
    "dodging movement": [
        { tag: "dodging" },
        { tag: "dodging, afterimage, projectile trail" }
    ],
    "waving gesture": [
        { tag: "waving" },
        { tag: "waving at viewer" },
        { tag: "raised hand" }
    ],
    "pointing gesture": [
        { tag: "pointing" },
        { tag: "pointing at viewer" },
        { tag: "pointing up" }
    ],
    "reaching gesture": [
        { tag: "reaching" },
        { tag: "reaching out" },
        { tag: "outstretched hand" }
    ],
    "raised hand gesture": [
        { tag: "raised hand" },
        { tag: "both hands up" },
        { tag: "hand up" }
    ],
    "hand near face gesture": [
        { tag: "hand near face" },
        { tag: "hand on cheek" },
        { tag: "finger to mouth" }
    ],
    "hand on body": [
        { tag: "hand on hip" },
        { tag: "hand on chest" },
        { tag: "hand on own arm" }
    ],
    "touching face": [
        { tag: "touching face" },
        { tag: "hand on cheek" },
        { tag: "covering mouth" }
    ],
    "adjusting hair": [
        { tag: "adjusting hair" },
        { tag: "hand in hair" },
        { tag: "brushing hair" }
    ],
    "undressing action": [
        { tag: "undressing" },
        { tag: "removing clothes" },
        { tag: "shirt lift" },
        { tag: "clothes lift" }
    ],
    "clasped hands": [
        { tag: "clasped hands" },
        { tag: "own hands clasped" },
        { tag: "hands together" }
    ],
    "covering self": [
        { tag: "covering" },
        { tag: "covering chest" },
        { tag: "covering face" }
    ],
    "holding object": [
        { tag: "holding" },
        { tag: "holding object" },
        { tag: "holding with both hands" }
    ],
    "using object": [
        { tag: "using object" },
        { tag: "holding tool" },
        { tag: "looking at object" }
    ],
    "carrying object": [
        { tag: "carrying" },
        { tag: "carrying bag" },
        { tag: "holding object" }
    ],
    "opening object": [
        { tag: "opening" },
        { tag: "opening door" },
        { tag: "reaching for object" }
    ],
    "eating or drinking": [
        { tag: "eating" },
        { tag: "drinking" },
        { tag: "holding food" }
    ],
    "reading/writing interaction": [
        { tag: "sitting, book, arm support, reading" },
        { tag: "writing, notebook, sitting" },
        { tag: "lying, book" }
    ],
    "music/performance interaction": [
        { tag: "microphone, singing, open mouth" },
        { tag: "guitar, playing instrument" },
        { tag: "violin, playing instrument" }
    ],
    "game interaction": [
        { tag: "playing games, sitting" },
        { tag: "sitting, playing games, teasing" },
        { tag: "playing chess, hand on piece, focused, thinking, strategic atmosphere, winning" }
    ],
    "work/analysis interaction": STRATEGIC_COMPOSED_ACTION_TAGS,
    "hugging interaction": [
        { tag: "hugging" },
        { tag: "embrace" },
        { tag: "arms around another" }
    ],
    "holding hands interaction": [
        { tag: "holding hands" },
        { tag: "hand in hand" },
        { tag: "reaching for hand" }
    ],
    "romantic interaction": [
        { tag: "kiss" },
        { tag: "almost kiss" },
        { tag: "hugging, eye contact" },
        { tag: "holding hands, looking at another" }
    ],
    "friendly pair interaction": PAIR_FRIENDLY_ACTION_TAGS,
    "comfort/cuddle interaction": [
        { tag: "cuddling, sitting" },
        { tag: "head on another's shoulder, sitting" },
        { tag: "comforting, head on another's shoulder" },
        { tag: "lap pillow, headpat, lying, sleeping on person, lying on lap" },
        { tag: "hug from behind" },
        { tag: "arm hug, walking" }
    ],
    "playful/teasing interaction": PLAYFUL_TEASING_ACTION_TAGS,
    "adult intimate interaction": ADULT_INTIMATE_ACTION_TAGS,
    "touching another character": [
        { tag: "touching" },
        { tag: "hand on shoulder" },
        { tag: "patting head" }
    ],
    "facing another character": [
        { tag: "facing another" },
        { tag: "looking at another" },
        { tag: "eye contact" }
    ],
    "supporting another character": [
        { tag: "supporting another" },
        { tag: "helping" },
        { tag: "holding another" }
    ],
    "weapon action": [
        { tag: "holding weapon" },
        { tag: "ready stance" },
        { tag: "dynamic pose" }
    ],
    "defensive action": [
        { tag: "defensive stance" },
        { tag: "guarding" },
        { tag: "covering" }
    ],
    "impact reaction": [
        { tag: "impact" },
        { tag: "flinching" },
        { tag: "off balance" }
    ],
    "falling after impact": [
        { tag: "falling" },
        { tag: "off balance" },
        { tag: "motion blur" }
    ],
    "dynamic attack pose": [
        { tag: "dynamic pose" },
        { tag: "action pose" },
        { tag: "motion blur" }
    ],
    "armed combat pose": ARMED_COMBAT_ACTION_TAGS,
    "ranged aiming pose": [
        { tag: "aiming, gun" },
        { tag: "ready to draw, katana, fighting stance, holding sheath" }
    ],
    "startled reaction": [
        { tag: "startled" },
        { tag: "surprised" },
        { tag: "flinching" }
    ],
    "flinching reaction": [
        { tag: "flinching" },
        { tag: "recoiling" },
        { tag: "defensive posture" }
    ],
    "turning back reaction": [
        { tag: "looking back" },
        { tag: "turning around" },
        { tag: "over shoulder" }
    ],
    "celebrating reaction": [
        { tag: "cheering" },
        { tag: "raised arms" },
        { tag: "excited" }
    ],
    "hiding reaction": [
        { tag: "hiding" },
        { tag: "covering face" },
        { tag: "peeking" }
    ],
    "drunk/recovering reaction": DRUNK_RECOVERING_ACTION_TAGS,
    "analytical reaction": STRATEGIC_COMPOSED_ACTION_TAGS,
    "shy/covered reaction": [
        { tag: "covering, shy" },
        { tag: "under covers, sitting, covering, shy, naked shoulder" },
        { tag: "covering privates, covered nipples, unworn serafuku" }
    ]
};

const BACKGROUND_GROUP_TAGS: AllowedTag[] = [
    { tag: "simple background" },
    { tag: "indoors" },
    { tag: "outdoors" },
    { tag: "bedroom" },
    { tag: "living room" },
    { tag: "kitchen" },
    { tag: "bathroom" },
    { tag: "classroom" },
    { tag: "office" },
    { tag: "street" },
    { tag: "city" },
    { tag: "park" },
    { tag: "forest" },
    { tag: "beach" },
    { tag: "sky" },
    { tag: "night sky" }
];

const BACKGROUND_MODIFIER_TAGS: AllowedTag[] = [
    { tag: "window" },
    { tag: "rain" },
    { tag: "snow" },
    { tag: "cloudy sky" },
    { tag: "sunset" },
    { tag: "night" },
    { tag: "blurry background" }
];

const LIGHTING_TAGS: AllowedTag[] = [
    { tag: "soft lighting" },
    { tag: "cinematic lighting" },
    { tag: "dramatic lighting" },
    { tag: "backlighting" },
    { tag: "rim light" },
    { tag: "low light" },
    { tag: "warm light" },
    { tag: "cool light" },
    { tag: "neon lighting" },
    { tag: "moonlight" },
    { tag: "sunlight" },
    { tag: "dappled sunlight" },
    { tag: "golden hour" },
    { tag: "volumetric light" }
];

const TIME_OF_DAY_TAGS: AllowedTag[] = [
    { tag: "dawn" },
    { tag: "sunrise" },
    { tag: "morning" },
    { tag: "day" },
    { tag: "noon" },
    { tag: "afternoon" },
    { tag: "golden hour" },
    { tag: "sunset" },
    { tag: "dusk" },
    { tag: "twilight" },
    { tag: "evening" },
    { tag: "night" },
    { tag: "midnight" }
];

export async function generateVisualPromptPlan(input: {
    backend: StoryGenerationBackend;
    config: BackendRuntimeConfig;
    node: StoryNodeFields;
    storyId: string | null;
    selectedNodeId: string | null;
    abortSignal?: AbortSignal;
}): Promise<string> {
    const plan: VisualPromptPlan = {
        fixedTags: [],
        rawDanbotDescriptions: []
    };

    const runtime: VisualPlannerRuntime = {
        backend: input.backend,
        config: input.config,
        node: input.node,
        storyId: input.storyId,
        selectedNodeId: input.selectedNodeId,
        facts: {},
        abortSignal: input.abortSignal
    };

    await addTagsFromQuestion(plan, runtime, {
        key: "subject",
        question: "Which subject-count tags best describe the visible characters?",
        allowedTags: SUBJECT_TAGS,
        fallback: ["1girl", "solo"],
        example: "The tags that describe the image are: 1girl, solo."
    });

    const cameraAngleTag = await addSingleTagChoiceByNumber(plan, runtime, {
        key: "camera_angle",
        question:
            "Choose exactly one camera angle by number. Pick the single best angle that is directly supported by the scene. If unclear, choose the neutral default.",
        allowedTags: CAMERA_ANGLE_TAGS,
        fallback: "straight-on",
        example: "1",
        addToPlan: false
    });
    plan.fixedTags.push(cameraAngleTag ?? "straight-on");

    const framingTag = await addSingleTagChoiceByNumber(plan, runtime, {
        key: "framing",
        question:
            "Choose exactly one framing or crop tag by number. Pick the single best framing that is directly supported by the scene. If unclear, choose the safer broader framing.",
        allowedTags: FRAMING_TAGS,
        fallback: "upper body",
        example: "3",
        addToPlan: false
    });

    let validatedFramingTag = framingTag ?? "upper body";

    if (validatedFramingTag === "close-up") {
        const closeUpAppropriate = await isVisible(runtime, {
            key: "framing_close_up_appropriate",
            target: "close-up framing as an appropriate visualization choice",
            question:
                'Do you think a "close-up" framing is genuinely appropriate to visualize this scene here? Answer yes only if the scene clearly benefits from a very tight crop. If unclear, answer no.',
            fallback: false,
            example: "No, a broader framing such as upper body is more appropriate here."
        });

        if (!closeUpAppropriate) {
            validatedFramingTag = "upper body";
        }
    }

    plan.fixedTags.push(validatedFramingTag);

    const povVisible = await isVisible(runtime, {
        key: "pov_visible",
        target: "POV perspective as an appropriate visualization choice",
        question:
            "Do you think a POV perspective is genuinely appropriate to visualize the scene here? Answer yes only if the scene is clearly shown from a character or viewer viewpoint. If unclear, answer no.",
        fallback: false,
        example: "No, a regular third-person view is more appropriate here."
    });

    if (povVisible) {
        plan.fixedTags.push("pov");

        const povHandsVisible = await isVisible(runtime, {
            key: "pov_hands_visible",
            target: "pov hands as an appropriate visualization choice",
            question:
                'If POV is appropriate, do you think the tag "pov hands" is also genuinely appropriate here? Answer yes only if the viewer or character hands would clearly be visible in frame. If unclear, answer no.',
            fallback: false,
            example: "No, POV may fit, but the viewer's hands would not clearly be visible."
        });

        if (povHandsVisible) {
            plan.fixedTags.push("pov hands");
        }
    }

    await addDetachedOptionalTags(plan, runtime, {
        key: "focus",
        introQuestion:
            "For each possible focus tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the scene clearly emphasizes that subject. If unclear, answer no.",
        allowedTags: FOCUS_TAGS,
        fallback: [],
        maxTags: 1,
        example: "No, there is no special focus tag that clearly needs to be added here."
    });

    // Disabled for now: raw-text resolver questions require per-description DanBot passes.
    // We keep these blocks commented instead of deleting them so the old behavior is easy to restore.
    // await addRawDanbotDescription(plan, runtime, {
    //     key: "pose_action",
    //     question: "Describe the visible pose and action as one short visual sentence.",
    //     example: "She stands in side profile, leaning slightly forward with one hand near her scarf."
    // });

    // await addRawDanbotDescription(plan, runtime, {
    //     key: "general_appearance",
    //     question: "Describe the visible physical appearance of the character as one short visual sentence.",
    //     example: "She has long silver hair, pale skin, and a slim build."
    // });

    // await addRawDanbotDescription(plan, runtime, {
    //     key: "visible_outfit_details",
    //     question:
    //         "Describe only the outfit details and uncovered body parts visible from the selected camera angle and framing.",
    //     example: "Her off-shoulder sweater reveals one bare shoulder and her collarbone."
    // });

    const visibleBodyRegions = await askTagsFromQuestion(runtime, {
        key: "visible_body_regions",
        question:
            "Which body regions are clearly visible or emphasized in the image, considering POV, framing, camera angle, pose, action, clothing, hair, and occlusion?",
        allowedTags: VISIBLE_BODY_REGION_TAGS,
        fallback: [],
        example: "The visible body regions are: face, eyes, shoulders, hands, midriff."
    });

    if (regionVisible(visibleBodyRegions, ["face"])) {
        await addSingleTagChoiceByNumber(plan, runtime, {
            key: "emotion",
            question: "Choose the visible facial-expression group by number.",
            allowedTags: EMOTION_TAGS,
            fallback: "neutral expression",
            example: "2"
        });

        await addDetachedOptionalTags(plan, runtime, {
            key: "facial_expression_details",
            introQuestion:
                "For each possible facial-expression detail tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the detail is clearly visible. If unclear, answer no.",
            allowedTags: FACIAL_EXPRESSION_DETAIL_TAGS,
            fallback: [],
            example: "No, there is no extra facial-expression detail that is clearly visible here."
        });

        if (regionVisible(visibleBodyRegions, ["eyes"])) {
            await addDetachedOptionalTags(plan, runtime, {
                key: "eye_expression_details",
                introQuestion:
                    "For each possible eye-expression or pupil detail tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the detail is clearly visible. If unclear, answer no.",
                allowedTags: EYE_EXPRESSION_TAGS,
                fallback: [],
                example: "No, there is no extra eye-expression detail that is clearly visible here."
            });
        }

        if (regionVisible(visibleBodyRegions, ["mouth"])) {
            await addDetachedOptionalTags(plan, runtime, {
                key: "mouth_expression_details",
                introQuestion:
                    "For each possible mouth-expression detail tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the detail is clearly visible. If unclear, answer no.",
                allowedTags: MOUTH_EXPRESSION_TAGS,
                fallback: [],
                example: "No, there is no extra mouth-expression detail that is clearly visible here."
            });
        }

        // await addRawDanbotDescription(plan, runtime, {
        //     key: "face_description",
        //     question: "Describe the visible face, expression, gaze, and eye color as one short visual sentence.",
        //     example: "Her face is visible in side profile with a soft smile and blue eyes."
        // });

        // if (regionVisible(visibleBodyRegions, ["eyes"])) {
        //     await addRawDanbotDescription(plan, runtime, {
        //         key: "eye_color",
        //         question: "Describe only the visible eye color as one short visual sentence.",
        //         example: "Her visible eyes are bright blue."
        //     });
        // }
    }

    await addActionTreeTags(plan, runtime);
    await addSecondaryContactActionTags(plan, runtime);

    const motionEffectsVisible = await isVisible(runtime, {
        key: "motion_effects_visible",
        target: "motion effects such as movement lines, speed lines, or motion blur",
        question: "Are motion effects visibly used to indicate movement?",
        fallback: false,
        example: "Yes, motion lines are visible around the moving hand."
    });

    if (motionEffectsVisible) {
        await addDetachedOptionalTags(plan, runtime, {
            key: "motion_effects",
            introQuestion:
                "For each possible motion-effect tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the effect is clearly visible. If unclear, answer no.",
            allowedTags: MOTION_EFFECT_TAGS,
            fallback: [],
            maxTags: 1,
            example: "No, there is no clearly visible motion effect here."
        });
    }

    await addDetachedOptionalTags(plan, runtime, {
        key: "body_state",
        introQuestion:
            "For each possible body-state tag below, decide whether it is genuinely appropriate for visualizing this scene. Answer yes only if the state is clearly visible. If unclear, answer no.",
        allowedTags: BODY_STATE_TAGS,
        fallback: [],
        maxTags: 1,
        example: "No, there is no clearly visible body-state tag that needs to be added here."
    });

    // if (hasTagAmong(plan.fixedTags, ["from side"])) {
    //     await addRawDanbotDescription(plan, runtime, {
    //         key: "side_visible_details",
    //         question:
    //             "Because the image is from the side, describe only the side-visible body, hair, and clothing details.",
    //         example: "Her side profile, visible shoulder, hair over one shoulder, and side neckline are visible."
    //     });
    // }

    // if (hasTagAmong(plan.fixedTags, ["from behind"])) {
    //     await addRawDanbotDescription(plan, runtime, {
    //         key: "back_visible_details",
    //         question:
    //             "Because the image is from behind, describe only the back-visible body, hair, and clothing details.",
    //         example: "Her long hair falls down her back, with her nape and back-facing outfit details visible."
    //     });
    // }

    const nakedVisible = await isVisible(runtime, {
        key: "naked_visible",
        target: "naked or nude body",
        question: "Is the visible character naked or nude in the image?",
        fallback: false,
        example: "No, the character is wearing visible clothing."
    });

    if (nakedVisible) {
        plan.fixedTags.push("naked");
        runtime.facts.clothing_state = "naked";
    }

    await addFullOutfitTags(plan, runtime, visibleBodyRegions);

    if (regionVisible(visibleBodyRegions, ["shoulders"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "shoulder_tags",
            question: "Which shoulder or shoulder-outfit tags apply?",
            allowedTags: SHOULDER_TAGS,
            fallback: [],
            example: "The tags that describe the image are: one bare shoulder, off shoulder."
        });

        // await addRawDanbotDescription(plan, runtime, {
        //     key: "visible_shoulder",
        //     question: "Describe the visible shoulder and nearby clothing details as one short visual sentence.",
        //     example: "One bare shoulder and the collarbone are visible above the loose neckline."
        // });
    }

    if (regionVisible(visibleBodyRegions, ["neck"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "neckwear",
            question: "Which neckwear or high-neck clothing tags are visibly present?",
            allowedTags: NECKWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: scarf, turtleneck sweater."
        });
    }

    if (regionVisible(visibleBodyRegions, ["chest", "midriff", "navel"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "upper_body_exposure",
            question: "Which upper-body exposure or abdomen/midriff tags apply?",
            allowedTags: UPPER_BODY_EXPOSURE_TAGS,
            fallback: [],
            example: "The tags that describe the image are: midriff, navel."
        });

        const upperClothingTags = await addTagsFromQuestion(plan, runtime, {
            key: "upper_clothing",
            question: "Which top-level upper-clothing tags are visibly present?",
            allowedTags: UPPER_CLOTHING_TAGS,
            fallback: [],
            example: "The tags that describe the image are: crop top, jacket."
        });

        if (upperClothingTags.length) {
            if (hasTagAmong(upperClothingTags, ["hoodie"])) {
                await addSingleTagChoiceByNumber(plan, runtime, {
                    key: "hoodie_state",
                    question: "Choose whether the visible hoodie's hood is up or down by number.",
                    allowedTags: HOODIE_STATE_TAGS,
                    fallback: "hood down",
                    example: "2"
                });
            }

            await addOpenClothesTagIfVisible(plan, runtime, {
                key: "upper_clothing_open",
                target: "upper clothing opening",
                question: "Is the visible upper clothing open, parted, lifted, unbuttoned, or otherwise exposing the body?",
                example: "Yes, the visible upper clothing is open."
            });
        }
    }

    if (regionVisible(visibleBodyRegions, ["bottomwear", "hips"])) {
        const bottomwearTags = await addTagsFromQuestion(plan, runtime, {
            key: "bottomwear",
            question: "Which bottomwear tags are visibly present?",
            allowedTags: BOTTOMWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: skirt, shorts."
        });

        if (bottomwearTags.length) {
            await addOpenClothesTagIfVisible(plan, runtime, {
                key: "bottomwear_open",
                target: "bottomwear opening or displacement",
                question: "Is the visible bottomwear open, unzipped, parted, lifted, or displaced?",
                example: "No, the bottomwear is not open or displaced."
            });
        }
    }

    if (regionVisible(visibleBodyRegions, ["underwear"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "underwear",
            question: "Which underwear tags are visibly present?",
            allowedTags: UNDERWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: underwear, bra."
        });

        await addOpenClothesTagIfVisible(plan, runtime, {
            key: "underwear_revealed_by_open_clothes",
            target: "open or displaced clothing revealing underwear",
            question: "Is open or displaced clothing what reveals the visible underwear?",
            example: "Yes, open clothing reveals the underwear."
        });
    }

    if (regionVisible(visibleBodyRegions, ["legs"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "legwear",
            question: "Which leg or legwear tags apply?",
            allowedTags: LEGWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: bare legs, thighhighs."
        });
    }

    if (regionVisible(visibleBodyRegions, ["feet", "footwear"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "footwear",
            question: "Which foot or footwear tags apply?",
            allowedTags: FOOTWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: boots."
        });
    }

    const backgroundVisible = await isVisible(runtime, {
        key: "background_visible",
        target: "background environment",
        question: "Is the background visible enough to classify the environment?",
        fallback: true,
        example: "Yes, the background environment is visible."
    });

    if (backgroundVisible) {
        await addSingleTagChoiceByNumber(plan, runtime, {
            key: "background_group",
            question: "Choose the main background group by number.",
            allowedTags: BACKGROUND_GROUP_TAGS,
            fallback: "simple background",
            example: "10"
        });

        await addTagsFromQuestion(plan, runtime, {
            key: "background_modifiers",
            question: "Which background modifier tags also apply?",
            allowedTags: BACKGROUND_MODIFIER_TAGS,
            fallback: [],
            example: "The tags that describe the image are: rain, blurry background."
        });
    }

    // await addRawDanbotDescription(plan, runtime, {
    //     key: "background",
    //     question: "Describe the visible background as one short visual sentence.",
    //     example: "The background is a rainy neon city street with wet pavement and blurred storefronts."
    // });

    await addTagsFromQuestion(plan, runtime, {
        key: "lighting",
        question: "Which lighting tags best describe the scene?",
        allowedTags: LIGHTING_TAGS,
        fallback: ["soft lighting"],
        example: "The tags that describe the image are: cinematic lighting, neon lighting."
    });

    await addTagsFromQuestion(plan, runtime, {
        key: "time_of_day",
        question: "Which time-of-day tag best describes the scene?",
        allowedTags: TIME_OF_DAY_TAGS,
        fallback: ["day"],
        example: "The tag that describes the image is: night."
    });

    return formatVisualPromptPlan({
        fixedTags: dedupeTags(plan.fixedTags),
        rawDanbotDescriptions: plan.rawDanbotDescriptions
    });
}

async function addActionTreeTags(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime
): Promise<void> {
    const actionFamily = await addSingleTagChoiceByNumber(plan, runtime, {
        key: "action_family",
        question: "Choose the main action family by number.",
        allowedTags: ACTION_FAMILY_TAGS,
        fallback: "idle/static pose",
        example: "1",
        addToPlan: false
    });

    const subfamilyTags = ACTION_SUBFAMILY_TAGS[actionFamily ?? ""] ??
        ACTION_SUBFAMILY_TAGS["idle/static pose"];

    const actionSubfamily = await addSingleTagChoiceByNumber(plan, runtime, {
        key: "action_subfamily",
        question: "Choose the action subtype by number.",
        allowedTags: subfamilyTags,
        fallback: subfamilyTags[0]?.tag,
        example: "1",
        addToPlan: false
    });

    const finalActionTags = ACTION_FINAL_TAGS[actionSubfamily ?? ""] ??
        (actionSubfamily ? [{ tag: actionSubfamily }] : [{ tag: "standing" }]);

    await addSingleTagChoiceByNumber(plan, runtime, {
        key: "action_final_tag",
        question: "Choose the final Danbooru-friendly action tag group by number.",
        allowedTags: finalActionTags,
        fallback: finalActionTags[0]?.tag,
        example: "1"
    });
}

async function addFullOutfitTags(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    visibleBodyRegions: string[]
): Promise<void> {
    if (!clothingVisible(visibleBodyRegions)) {
        return;
    }

    const fullOutfitTags = await addTagsFromQuestion(plan, runtime, {
        key: "full_outfit",
        question:
            "Which full-outfit, costume, or overall clothing tags are visibly present?",
        allowedTags: FULL_OUTFIT_TAGS,
        fallback: [],
        example: "The tags that describe the image are: fully clothed, maid outfit."
    });

    if (hasTagAmong(fullOutfitTags, ["miku outfit"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "miku_outfit_details",
            question: "Which Miku-style outfit detail tags are visibly present?",
            allowedTags: MIKU_OUTFIT_DETAIL_TAGS,
            fallback: [],
            example: "The tags that describe the image are: detached sleeves, necktie, pleated skirt."
        });
    }

    if (hasTagAmong(fullOutfitTags, ["maid outfit"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "maid_outfit_details",
            question: "Which maid outfit detail tags are visibly present?",
            allowedTags: MAID_OUTFIT_DETAIL_TAGS,
            fallback: [],
            example: "The tags that describe the image are: maid headdress, apron, frills."
        });
    }

    if (hasTagAmong(fullOutfitTags, ["medieval armor"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "medieval_armor_details",
            question: "Which medieval armor piece tags are visibly present?",
            allowedTags: MEDIEVAL_ARMOR_DETAIL_TAGS,
            fallback: [],
            example: "The tags that describe the image are: breastplate, pauldrons, gauntlets."
        });
    }
}

async function addSecondaryContactActionTags(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime
): Promise<void> {
    if (!secondaryContactActionsEnabled(plan)) {
        return;
    }

    await addTagsFromQuestion(plan, runtime, {
        key: "secondary_contact_actions",
        question:
            "Which secondary contact action tags also apply? Only choose tags for visible contact from the boy or POV hands.",
        allowedTags: SECONDARY_CONTACT_ACTION_TAGS,
        fallback: [],
        example: "The tags that describe the image are: waist grab, holding hands."
    });
}

function secondaryContactActionsEnabled(plan: VisualPromptPlan): boolean {
    return hasTagAmong(plan.fixedTags, ["1boy", "1girl, 1boy", "pov hands"]);
}

async function addDetachedOptionalTags(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        introQuestion: string;
        allowedTags: AllowedTag[];
        fallback: string[];
        example: string;
        maxTags?: number;
    }
): Promise<string[]> {
    const selectedTags: string[] = [];

    for (const allowedTag of input.allowedTags) {
        if (input.maxTags !== undefined && selectedTags.length >= input.maxTags) {
            break;
        }

        const detachedVisible = await isVisible(runtime, {
            key: `${input.key}_${toQuestionKeySuffix(allowedTag.tag)}`,
            target: `${allowedTag.tag} as a visualization choice`,
            question:
                `${input.introQuestion}

` +
                `Tag to evaluate: "${allowedTag.tag}". ` +
                "Answer yes only if this tag is clearly supported by the current scene and would genuinely help visualize it. If unclear, answer no.",
            fallback: false,
            example: input.example
        });

        if (detachedVisible) {
            selectedTags.push(allowedTag.tag);
            plan.fixedTags.push(allowedTag.tag);
        }
    }

    return selectedTags.length > 0 ? selectedTags : input.fallback;
}

function toQuestionKeySuffix(tag: string): string {
    return tag
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function clothingVisible(regions: string[]): boolean {
    return regionVisible(regions, [
        "shoulders",
        "arms",
        "chest",
        "midriff",
        "hips",
        "bottomwear",
        "underwear",
        "legs",
        "footwear"
    ]);
}

async function addOpenClothesTagIfVisible(
    plan: VisualPromptPlan,
    runtime: VisualPlannerRuntime,
    input: {
        key: string;
        target: string;
        question: string;
        example: string;
    }
): Promise<void> {
    const open = await isVisible(runtime, {
        key: input.key,
        target: input.target,
        question: input.question,
        fallback: false,
        example: input.example
    });

    if (open) {
        plan.fixedTags.push("open clothes");
    }
}

function regionVisible(regions: string[], candidates: string[]): boolean {
    return hasTagAmong(regions, candidates);
}
