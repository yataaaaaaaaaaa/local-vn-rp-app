export function stripProtocolNoise(text: string): string {
  return text
    .replace(/<\/?s>/gi, "")
    .replace(/<\/?(?:assistant|user|system)>/gi, "")
    .replace(/^\s*(?:#+\s*)?(?:output|answer|assistant|ai|bot|narrator|scene|dialogue|response|npc|npc_reply|user_reply|visual_cue|character|speaker)\s*:\s*/i, "")
    .trim();
}
