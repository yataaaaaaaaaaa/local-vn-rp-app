import type { AgentDebugTrace } from "@local-vn/story-application";

import { isAttributionTargetActive } from "./attribution";

export type CandidateListItem = AgentDebugTrace["candidateBuffer"][number];

export function CandidateList({
  candidates,
  compact = false,
  activeTargetIds,
}: {
  candidates: CandidateListItem[];
  compact?: boolean;
  activeTargetIds: Set<string>;
}) {
  return (
    <ul
      className={
        compact ? "agent-debug-candidates compact" : "agent-debug-candidates"
      }
    >
      {candidates.map((candidate) => {
        const candidateActive = isAttributionTargetActive(
          activeTargetIds,
          "candidate",
          candidate.id,
        );

        return (
          <li key={candidate.id}>
            <details
              className={candidateActive ? "attribution-active" : undefined}
            >
              <summary>
                <span>{candidate.label ?? candidate.id}</span>
                <code>{candidate.source}</code>
              </summary>
              <p>{candidate.text}</p>
              {typeof candidate.weight === "number" ? (
                <small>Weight: {candidate.weight.toFixed(2)}</small>
              ) : null}
            </details>
          </li>
        );
      })}
    </ul>
  );
}
