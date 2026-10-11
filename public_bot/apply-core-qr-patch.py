"""Install the public-group QR guard into a separately installed gsuid-core.

The core checkout lives in ignored runtime data. Keep the small reviewed patch
here so a new server or a refreshed core checkout gets the same behavior.
"""

from pathlib import Path
import hashlib
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
CORE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data/qq-runtime/gsuid_core"
PATCH = Path(__file__).with_name("core-patches") / "group-qr-login.patch"
UPGRADE_PATCH = Path(__file__).with_name("core-patches") / "genshin-group-login.patch"
CACHE_PATCH = Path(__file__).with_name("core-patches") / "query-error-cache.patch"
CACHE_COVERAGE_PATCH = Path(__file__).with_name("core-patches") / "query-error-cache-coverage.patch"
RENDER_CACHE_PATCH = Path(__file__).with_name("core-patches") / "genshin-render-error-cache.patch"
LOL_PERFORMANCE_PATCH = Path(__file__).with_name("core-patches") / "lol-team-performance.patch"
LOL_PERFORMANCE_UPGRADE = Path(__file__).with_name("core-patches") / "lol-team-performance-upgrade.patch"
LOL_LAYOUT_PATCH = Path(__file__).with_name("core-patches") / "lol-match-layout.patch"
PREFIX_PATCH = Path(__file__).with_name("core-patches") / "genshin-ys-prefix.patch"
SOURCE = Path(__file__).with_name("core-patches") / "verified_game_uid.py"
DESTINATION = CORE / "gsuid_core/utils/cookie_manager/verified_game_uid.py"


def git_apply(*args: str, patch: Path = PATCH, checkout: Path = CORE) -> bool:
    result = subprocess.run(
        ["git", "-c", f"safe.directory={checkout.resolve().as_posix()}", "-C", str(checkout.resolve()), "apply", "--ignore-space-change", *args, str(patch)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return result.returncode == 0


def main() -> None:
    if not (CORE / "gsuid_core").is_dir():
        raise SystemExit("gsuid-core checkout not found")
    if DESTINATION.exists() and DESTINATION.read_bytes().replace(b'\r\n', b'\n') != SOURCE.read_bytes().replace(b'\r\n', b'\n'):
        previous = hashlib.sha256(DESTINATION.read_bytes().replace(b'\r\n', b'\n')).hexdigest()
        if previous not in {'2a599a40c09741ea649e82a625c945158d63b2ec03bf36cb75b2df6fe3106da3',
                            'bfbaf97025e25cfa608c8c714043763fb602654a1af8eb2de2c74f04c9d5671e'}:
            raise SystemExit("QR guard helper differs from the reviewed copy; inspect the core update before starting")
    if not any(git_apply("--reverse", "--check", patch=p) for p in (PATCH, UPGRADE_PATCH, PREFIX_PATCH)):
        if not git_apply("--check"):
            if not git_apply("--check", patch=UPGRADE_PATCH):
                raise SystemExit("gsuid-core changed; QR guard patch needs a manual review before starting")
            applied = git_apply(patch=UPGRADE_PATCH)
        else:
            applied = git_apply()
        if not applied:
            raise SystemExit("Could not apply gsuid-core QR guard patch")
        print("Applied public-group QR guard to gsuid-core")
    if not git_apply("--reverse", "--check", patch=PREFIX_PATCH):
        if not git_apply("--check", patch=PREFIX_PATCH) or not git_apply(patch=PREFIX_PATCH):
            raise SystemExit("gsuid-core QR command prefix changed; inspect before starting")
    shutil.copyfile(SOURCE, DESTINATION)
    if not git_apply("--reverse", "--check", patch=CACHE_COVERAGE_PATCH) and not git_apply("--reverse", "--check", patch=CACHE_PATCH):
        if not git_apply("--check", patch=CACHE_PATCH) or not git_apply(patch=CACHE_PATCH):
            raise SystemExit("gsuid-core changed; query error-cache patch needs review")
    for cache_patch in (CACHE_COVERAGE_PATCH, RENDER_CACHE_PATCH):
        if cache_patch == RENDER_CACHE_PATCH and not (CORE / "gsuid_core/plugins/GenshinUID/GenshinUID").is_dir():
            continue
        cache_checkout = CORE / "gsuid_core/plugins/GenshinUID" if cache_patch == RENDER_CACHE_PATCH else CORE
        if not git_apply("--reverse", "--check", patch=cache_patch, checkout=cache_checkout):
            if not git_apply("--check", patch=cache_patch, checkout=cache_checkout) or not git_apply(patch=cache_patch, checkout=cache_checkout):
                raise SystemExit("Query cache coverage changed; inspect before starting")
    lol_checkout = CORE / "gsuid_core/plugins/LOLegendsUID"
    if (lol_checkout / "LOLegendsUID").is_dir() and (CORE / "gsuid_core/plugins/public_lol_bridge/team_performance.py").is_file():
        if not git_apply("--reverse", "--check", patch=LOL_LAYOUT_PATCH, checkout=lol_checkout) and not git_apply("--reverse", "--check", patch=LOL_PERFORMANCE_PATCH, checkout=lol_checkout):
            selected = next((p for p in (LOL_PERFORMANCE_PATCH, LOL_PERFORMANCE_UPGRADE) if git_apply("--check", patch=p, checkout=lol_checkout)), None)
            if selected is None or not git_apply(patch=selected, checkout=lol_checkout):
                raise SystemExit("LOL team performance renderer changed; inspect before starting")
        if (CORE / "gsuid_core/plugins/public_lol_bridge/match_layout.py").is_file() and not git_apply("--reverse", "--check", patch=LOL_LAYOUT_PATCH, checkout=lol_checkout):
            if not git_apply("--check", patch=LOL_LAYOUT_PATCH, checkout=lol_checkout) or not git_apply(patch=LOL_LAYOUT_PATCH, checkout=lol_checkout):
                raise SystemExit("LOL match layout changed; inspect before starting")
    print("gsuid-core QR guard verified")


if __name__ == "__main__":
    main()
