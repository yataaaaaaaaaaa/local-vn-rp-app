from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class StoragePaths:
    """Storage locations supplied by the launcher at backend startup."""

    project_name: str
    app_root: str
    story_root: str
    output_root: str

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


_configured_storage_paths: StoragePaths | None = None


def configure_storage_paths(project_name: str, app_root: str, story_root: str, output_root: str) -> StoragePaths:
    """Store the launcher-provided storage paths for backend runtime code."""

    global _configured_storage_paths
    _configured_storage_paths = StoragePaths(
        project_name=project_name,
        app_root=app_root,
        story_root=story_root,
        output_root=output_root,
    )
    return _configured_storage_paths


def require_storage_paths() -> StoragePaths:
    """Return configured storage paths or fail if the backend was not launched correctly."""

    if _configured_storage_paths is None:
        raise RuntimeError(
            "Storage paths are not configured. Start the backend through the launcher or pass "
            "--project-name, --app-root, --story-root, and --output-root."
        )
    return _configured_storage_paths


def storage_paths() -> dict[str, str]:
    """Return the launcher-provided storage paths as a JSON-serializable payload."""

    return require_storage_paths().to_dict()
