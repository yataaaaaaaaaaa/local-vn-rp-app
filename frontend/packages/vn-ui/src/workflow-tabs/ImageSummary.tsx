import {
  parseImageRef,
  toFileUrl
} from "@local-vn/story-domain";

export interface ImageSummaryProps {
  imageRef: string;
}

export function ImageSummary({ imageRef }: ImageSummaryProps) {
  const parsed = parseImageRef(imageRef);

  if (!parsed) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-400">
        No generated image is attached to this scene yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-100">
            Generated image
          </h3>
          <p className="text-xs text-zinc-500">{parsed.image_id}</p>
        </div>
        <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-400">
          seed {parsed.seed}
        </span>
      </div>

      <img
        src={toFileUrl(parsed.image_path)}
        alt="Generated scene"
        className="max-h-[420px] w-full rounded-xl object-contain"
      />

      <dl className="mt-3 grid gap-2 text-xs text-zinc-400">
        <div>
          <dt className="font-medium text-zinc-300">Image path</dt>
          <dd className="break-all">{parsed.image_path}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-300">Metadata path</dt>
          <dd className="break-all">{parsed.metadata_path}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-300">Created at</dt>
          <dd>{parsed.created_at}</dd>
        </div>
      </dl>
    </div>
  );
}
