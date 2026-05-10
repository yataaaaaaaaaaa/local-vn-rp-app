import type { AgentDebugTrace } from "@local-vn/story-application";

import { isAttributionTargetActive } from "./attribution";
import { CandidateList } from "./CandidateList";
import { classNames } from "./uiUtils";

export function AgentDebugTracePanel({
  trace,
  activeTargetIds,
}: {
  trace: AgentDebugTrace;
  activeTargetIds: Set<string>;
}) {
  const acceptedLabel = trace.selectedRedirect.fallback
    ? "fallback"
    : "accepted";
  const selectedActive = isAttributionTargetActive(
    activeTargetIds,
    "selected",
    trace.selectedRedirect.candidateId ?? "redirect",
  );
  const fallbackActive =
    trace.selectedRedirect.fallback &&
    isAttributionTargetActive(activeTargetIds, "fallback", "stabilization");

  return (
    <details className="agent-debug-trace" open>
      <summary>
        <span>
          <strong>Agent debug trace</strong>
          <em>{trace.sceneId}</em>
        </span>
        <code>{acceptedLabel}</code>
      </summary>

      <div className="agent-debug-summary-grid small">
        <span>
          Agents <strong>{trace.agents.length}</strong>
        </span>
        <span>
          Candidates <strong>{trace.candidateBuffer.length}</strong>
        </span>
        <span>
          Checks <strong>{trace.coherenceChecks.length}</strong>
        </span>
        <span>
          Selected{" "}
          <strong>
            {trace.selectedRedirect.source ?? trace.selectedRedirect.reason}
          </strong>
        </span>
      </div>

      <section
        className={classNames(
          "agent-debug-selected",
          selectedActive || fallbackActive ? "attribution-active" : undefined,
        )}
      >
        <h4>Selected redirect</h4>
        <p>{trace.selectedRedirect.text}</p>
        <div className="small">
          <code>{trace.selectedRedirect.reason}</code>
          {trace.selectedRedirect.candidateId ? (
            <code>{trace.selectedRedirect.candidateId}</code>
          ) : null}
        </div>
      </section>

      <div className="agent-debug-columns">
        <section>
          <h4>Agent outputs</h4>
          {trace.agents.map((agent) => {
            const agentActive = isAttributionTargetActive(
              activeTargetIds,
              "agent",
              agent.id,
            );

            return (
              <details
                key={agent.id}
                className={classNames(
                  "agent-debug-card",
                  agentActive ? "attribution-active" : undefined,
                )}
              >
                <summary>
                  <strong>{agent.label}</strong>
                  <code>{agent.candidates.length} candidate(s)</code>
                </summary>
                <div className="agent-debug-card-body">
                  <h5>Notes</h5>
                  {agent.notes.length ? (
                    <ul>
                      {agent.notes.map((note, index) => (
                        <li key={`${agent.id}-note-${index}`}>{note}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="small">No notes.</p>
                  )}
                  <h5>Candidates</h5>
                  {agent.candidates.length ? (
                    <CandidateList
                      candidates={agent.candidates}
                      activeTargetIds={activeTargetIds}
                    />
                  ) : (
                    <p className="small">No candidates.</p>
                  )}
                </div>
              </details>
            );
          })}
        </section>

        <section>
          <h4>Candidate buffer</h4>
          <CandidateList
            candidates={trace.candidateBuffer}
            compact
            activeTargetIds={activeTargetIds}
          />

          <h4>Coherence checks</h4>
          {trace.coherenceChecks.length ? (
            <ol className="agent-debug-checks">
              {trace.coherenceChecks.map((check) => {
                const checkActive = isAttributionTargetActive(
                  activeTargetIds,
                  "coherence",
                  check.candidateId,
                );

                return (
                  <li key={`${check.attempt}-${check.candidateId}`}>
                    <details
                      className={checkActive ? "attribution-active" : undefined}
                    >
                      <summary>
                        <span>
                          Attempt {check.attempt}: <strong>{check.verdict}</strong>
                        </span>
                        <code>{check.candidateId}</code>
                      </summary>
                      <p>{check.candidateText}</p>
                      {check.rawOutput ? <pre>{check.rawOutput}</pre> : null}
                    </details>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="small">No hidden coherence checks were run.</p>
          )}
        </section>
      </div>
    </details>
  );
}
