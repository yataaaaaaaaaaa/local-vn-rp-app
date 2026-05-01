from __future__ import annotations

import sys
from pathlib import Path

LAUNCHER_SRC = Path(__file__).resolve().parent / "src"
DEVLAUNCHER_CHECKOUT = Path("D:/Anything/libs/devlauncher_reusable_pattern")

for candidate in (
    LAUNCHER_SRC,
    DEVLAUNCHER_CHECKOUT / "src",
    DEVLAUNCHER_CHECKOUT,
):
    if candidate.is_dir() and str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))


from vn_rp_launcher.cli import main


if __name__ == "__main__":
    raise SystemExit(main())
