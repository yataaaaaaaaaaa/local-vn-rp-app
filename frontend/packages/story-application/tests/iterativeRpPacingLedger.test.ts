import { BackendClient } from "@local-vn/backend-client";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_LLM_MODEL,
  FAST_PACING_TARGET_ITERATION,
  SEX_SCENE_TARGET_ITERATION,
  runIterativePacingSession,
  writeIterativePacingLedger
} from "./support/iterativeRpPacingSession";

const RUN_ENV = "LOCAL_VN_RP_RUN_ITERATIVE_TEST";
const BASE_URL = process.env.LOCAL_VN_RP_BACKEND_URL ?? "http://127.0.0.1:17860";
const LLM_MODEL = process.env.LOCAL_VN_RP_PRODUCT_LLM_MODEL ?? DEFAULT_LLM_MODEL;
const LEDGER_PATH = resolve(
  process.cwd(),
  "packages/story-application/tests/iterative-rp-pacing-ledger.md"
);

describe.skipIf(process.env[RUN_ENV] !== "1")("iterative RP pacing ledger", () => {
  it(
    "runs a guided 10-exchange archive romance session and records pacing, novelty, and coherence",
    async () => {
      const client = new BackendClient({ baseUrl: BASE_URL });

      await client.loadLlm({
        backend: "llama_server",
        model_path: LLM_MODEL,
        context_size: Number(process.env.LOCAL_VN_RP_ITERATIVE_CONTEXT ?? 8192),
        gpu_layers: "auto",
        prompt_format: "mistral_inst",
        timeout_seconds: Number(process.env.LOCAL_VN_RP_ITERATIVE_TIMEOUT ?? 900)
      });

      const result = await runIterativePacingSession({
        backend: client,
        baseUrl: BASE_URL,
        modelPath: LLM_MODEL
      });

      writeIterativePacingLedger(LEDGER_PATH, {
        ...result,
        baseUrl: BASE_URL,
        modelPath: LLM_MODEL
      });

      expect(result.firstIntimacyIteration).not.toBeNull();
      expect(result.firstIntimacyIteration ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        FAST_PACING_TARGET_ITERATION
      );
      expect(result.firstSexSceneIteration).not.toBeNull();
      expect(result.firstSexSceneIteration ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
        SEX_SCENE_TARGET_ITERATION
      );
      expect(result.quality.issues).toEqual([]);
      expect(result.entries.some((entry) => entry.coherence.level === "poor")).toBe(
        false
      );
    },
    1_500_000
  );
});
