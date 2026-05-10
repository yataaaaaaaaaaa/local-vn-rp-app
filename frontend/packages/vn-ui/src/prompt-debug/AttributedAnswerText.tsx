import type { AnswerAttribution, HoveredAttribution } from "./attribution";

export function AttributedAnswerText({
  attributions,
  onHover,
}: {
  attributions: AnswerAttribution[];
  onHover: (hover: HoveredAttribution) => void;
}) {
  return (
    <>
      {attributions.map((attribution) => {
        const interactive = attribution.targets.length > 0;

        return (
          <span
            key={attribution.segmentId}
            className={interactive ? "answer-attribution-segment" : undefined}
            onMouseMove={(event) => {
              if (!interactive) return;
              onHover({
                segmentId: attribution.segmentId,
                targets: attribution.targets,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onMouseLeave={() => onHover(null)}
          >
            {attribution.text}
          </span>
        );
      })}
    </>
  );
}
