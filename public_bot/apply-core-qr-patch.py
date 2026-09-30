"""Install the public-group QR guard into a separately installed gsuid-core.

The core checkout lives in ignored runtime data. Keep the small reviewed patch
here so a new server or a refreshed core checkout gets the same behavior.
"""

from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
CORE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/qq-runtime/gsuid_core"
PATCH = Path(__file__).with_name("core-patches") / "group-qr-login.patch"
SOURCE = Path(__file__).with_name("core-patches") / "verified_game_uid.py"
DESTINATION = CORE / "gsuid_core/utils/cookie_manager/verified_game_uid.py"


def git_apply(*args: str) -> bool:
    result = subprocess.run(
        ["git", "-c", f"safe.directory={CORE.resolve().as_posix()}", "-C", str(CORE), "apply", *args, str(PATCH)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def main() -> None:
    if not (CORE / "gsuid_core").is_dir():
        raise SystemExit("gsuid-core checkout not found")
    if DESTINATION.exists() and DESTINATION.read_bytes() != SOURCE.read_bytes():
        raise SystemExit("QR guard helper differs from the reviewed copy; inspect the core update before starting")
    if not git_apply("--reverse", "--check"):
        if not git_apply("--check"):
            raise SystemExit("gsuid-core changed; QR guard patch needs a manual review before starting")
        if not git_apply():
            raise SystemExit("Could not apply gsuid-core QR guard patch")
        print("Applied public-group QR guard to gsuid-core")
    if not DESTINATION.exists():
        shutil.copyfile(SOURCE, DESTINATION)
    print("gsuid-core QR guard verified")


if __name__ == "__main__":
    main()
