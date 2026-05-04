import type { BackendRuntimeConfig } from "@local-vn/shared-types";
import type { StoryNodeFields } from "@local-vn/story-domain";

import type { StoryGenerationBackend } from "../ports";
import {
    addRawDanbotDescription,
    addTagsFromQuestion,
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

const EMOTION_TAGS: AllowedTag[] = [
    { tag: "neutral expression" },
    { tag: "soft smile" },
    { tag: "smile" },
    { tag: "laughing" },
    { tag: "serious" },
    { tag: "shy" },
    { tag: "embarrassed" },
    { tag: "blush" },
    { tag: "surprised" },
    { tag: "sad" },
    { tag: "angry" },
    { tag: "confident" },
    { tag: "smirk" },
    { tag: "sleepy" },
    { tag: "peaceful" }
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

    await addTagsFromQuestion(plan, runtime, {
        key: "camera_angle",
        question: "Which camera angle tag best describes the current scene image?",
        allowedTags: CAMERA_ANGLE_TAGS,
        fallback: ["straight-on"],
        example: "The tag that describes the image is: from side."
    });

    await addTagsFromQuestion(plan, runtime, {
        key: "framing",
        question: "Which framing or crop tag best describes how much of the body is visible?",
        allowedTags: FRAMING_TAGS,
        fallback: ["upper body"],
        example: "The tag that describes the image is: upper body."
    });

    await addTagsFromQuestion(plan, runtime, {
        key: "focus",
        question: "Which focus tags best describe what the image emphasizes?",
        allowedTags: FOCUS_TAGS,
        fallback: ["solo focus"],
        example: "The tags that describe the image are: eye focus, clothes focus."
    });

    await addRawDanbotDescription(plan, runtime, {
        key: "pose_action",
        question: "Describe the visible pose and action as one short visual sentence.",
        example: "She stands in side profile, leaning slightly forward with one hand near her scarf."
    });

    await addRawDanbotDescription(plan, runtime, {
        key: "general_appearance",
        question: "Describe the visible physical appearance of the character as one short visual sentence.",
        example: "She has long silver hair, pale skin, and a slim build."
    });

    await addRawDanbotDescription(plan, runtime, {
        key: "visible_outfit_details",
        question:
            "Describe only the outfit details and uncovered body parts visible from the selected camera angle and framing.",
        example: "Her off-shoulder sweater reveals one bare shoulder and her collarbone."
    });

    const faceVisible = await isVisible(runtime, {
        key: "face_visible",
        target: "face",
        question: "Is the face visible enough to describe an emotion?",
        fallback: true,
        example: "Yes, the face is partially visible in side profile."
    });

    if (faceVisible) {
        await addTagsFromQuestion(plan, runtime, {
            key: "emotion",
            question: "Which emotion tag best describes the visible facial expression?",
            allowedTags: EMOTION_TAGS,
            fallback: ["neutral expression"],
            example: "The tag that describes the image is: soft smile."
        });

        await addRawDanbotDescription(plan, runtime, {
            key: "face_description",
            question: "Describe the visible face, expression, gaze, and eye color as one short visual sentence.",
            example: "Her face is visible in side profile with a soft smile and blue eyes."
        });

        const eyesVisible = await isVisible(runtime, {
            key: "eyes_visible",
            target: "eyes",
            question: "Are the eyes visible enough to describe their color?",
            fallback: true,
            example: "Yes, the eyes are visible."
        });

        if (eyesVisible) {
            await addRawDanbotDescription(plan, runtime, {
                key: "eye_color",
                question: "Describe only the visible eye color as one short visual sentence.",
                example: "Her visible eyes are bright blue."
            });
        }
    }

    if (hasTagAmong(plan.fixedTags, ["from side"])) {
        await addRawDanbotDescription(plan, runtime, {
            key: "side_visible_details",
            question:
                "Because the image is from the side, describe only the side-visible body, hair, and clothing details.",
            example: "Her side profile, visible shoulder, hair over one shoulder, and side neckline are visible."
        });
    }

    if (hasTagAmong(plan.fixedTags, ["from behind"])) {
        await addRawDanbotDescription(plan, runtime, {
            key: "back_visible_details",
            question:
                "Because the image is from behind, describe only the back-visible body, hair, and clothing details.",
            example: "Her long hair falls down her back, with her nape and back-facing outfit details visible."
        });
    }

    const shoulderVisible = await isVisible(runtime, {
        key: "shoulder_visible",
        target: "shoulder",
        question: "Is a shoulder visibly uncovered or emphasized in the image?",
        fallback: false,
        example: "Yes, one bare shoulder is visible."
    });

    if (shoulderVisible) {
        await addRawDanbotDescription(plan, runtime, {
            key: "visible_shoulder",
            question: "Describe the visible shoulder and nearby clothing details as one short visual sentence.",
            example: "One bare shoulder and the collarbone are visible above the loose neckline."
        });
    }

    await addRawDanbotDescription(plan, runtime, {
        key: "background",
        question: "Describe the visible background as one short visual sentence.",
        example: "The background is a rainy neon city street with wet pavement and blurred storefronts."
    });

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