import { parseImageRef, toFileUrl } from "@local-vn/story-domain";

export interface ImageSummaryProps {
  imageRef: string;
}

export function ImageSummary({ imageRef }: ImageSummaryProps) {
  const parsed = parseImageRef(imageRef);

  if (!parsed) {
    return (
      <div className="image-summary image-summary-empty">
        No generated image is attached to this scene yet.
      </div>
    );
  }

  return (
    <div className="image-summary">
      <div className="image-summary-header">
        <div>
          <h3>Generated image</h3>
          <p>{parsed.image_id}</p>
        </div>
        <span>seed {parsed.seed}</span>
      </div>

      <img src={toFileUrl(parsed.image_path)} alt="Generated scene" />

      <dl className="image-summary-meta">
        <div>
          <dt>Image path</dt>
          <dd>{parsed.image_path}</dd>
        </div>
        <div>
          <dt>Metadata path</dt>
          <dd>{parsed.metadata_path}</dd>
        </div>
        <div>
          <dt>Created at</dt>
          <dd>{parsed.created_at}</dd>
        </div>
      </dl>
    </div>
  );
}
