import type { HoveredAttribution } from "./attribution";
import { attributionTargetKey } from "./attribution";

export function AnswerAttributionTooltip({
  hover,
}: {
  hover: HoveredAttribution;
}) {
  if (!hover || hover.targets.length === 0) return null;

  return (
    <div
      className="answer-attribution-tooltip"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
      role="status"
    >
      <strong>Likely generated from</strong>
      <ul>
        {hover.targets.slice(0, 5).map((target) => (
          <li key={attributionTargetKey(target)}>
            <span>{target.label}</span>
            <small>{target.reason}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
