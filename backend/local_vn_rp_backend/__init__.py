"""Backend package for the local VN/RP app."""

from .storage_paths import StoragePaths, configure_storage_paths, require_storage_paths, storage_paths

__all__ = ["StoragePaths", "configure_storage_paths", "require_storage_paths", "storage_paths"]
