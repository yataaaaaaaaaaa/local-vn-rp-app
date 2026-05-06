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
    selectActionCompositionTreeTags,
    type ActionCompositionNode,
    type ActionCompositionSelectionIssue
} from "./actionCompositionTree";
import {
    dedupeTags,
    formatVisualPromptPlan,
    type VisualPromptPlan
} from "./visualPromptProtocol";
import {
    hasTagAmong,
    type AllowedTag
} from "./visualPromptTagHelpers";


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
    { tag: "peaceful" },
    { tag: "seductive smile" },
    { tag: "grin" },
    { tag: "heart-shaped pupils", aliases: ['pleading eyes', "tareme", "wavy mouth"] },
    { tag: "closing eyes", aliases: ["closed eyes", "eyes closing"] },
    { tag: "serious eyes", aliases: ["closed eyes", "eyes closing"] }
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
    { tag: "sleeveless" },
    { tag: "covered shoulders" },
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
    { tag: "closed clothes" },
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

const BACKGROUND_GROUP_TAGS: AllowedTag[] = [
    { tag: "simple background" },
    { tag: "indoors" },
    { tag: "outdoors" },
    { tag: "bedroom" },
    { tag: "living room" },
    { tag: "kitchen" },
    { tag: "bathroom" },
    { tag: "classroom" },
    { tag: "library" },
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
    actionCompositionTree?: ActionCompositionNode | null;
    actionCompositionSeed?: number;
    onActionCompositionSelectionError?: (issue: ActionCompositionSelectionIssue) => void;
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
        abortSignal: input.abortSignal,
        onActionCompositionSelectionError: input.onActionCompositionSelectionError
    };


    plan.fixedTags.push(...await selectActionCompositionTreeTags({
        tree: input.actionCompositionTree,
        runtime,
        seed: input.actionCompositionSeed ?? 0
    }));

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
    }

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

    const nakedVisible = await isVisible(runtime, {
        key: "naked_visible",
        target: "naked or nude body",
        question: "Is the female character naked or nude at the point of the story?",
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


    }

    if (regionVisible(visibleBodyRegions, ["underwear"])) {
        await addTagsFromQuestion(plan, runtime, {
            key: "underwear",
            question: "Which underwear tags are visibly present?",
            allowedTags: UNDERWEAR_TAGS,
            fallback: [],
            example: "The tags that describe the image are: underwear, bra."
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

function regionVisible(regions: string[], candidates: string[]): boolean {
    return hasTagAmong(regions, candidates);
}
