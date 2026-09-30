"""Vendor pinned, pure-JS image/QR libraries without an npm runtime install."""
from io import BytesIO
from pathlib import Path
import tarfile
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1] / "server" / "third-party"
for package, version in [("jsqr", "1.4.0"), ("pngjs", "7.0.0")]:
    with urlopen(f"https://registry.npmjs.org/{package}/-/{package}-{version}.tgz", timeout=30) as response:
        archive = tarfile.open(fileobj=BytesIO(response.read()), mode="r:gz")
    for item in archive.getmembers():
        if not item.isfile():
            continue
        if package == "jsqr" and item.name == "package/dist/jsQR.js":
            target = root / "jsqr.cjs"
        elif package == "jsqr" and item.name == "package/LICENSE":
            target = root / "jsqr.LICENSE"
        elif package == "pngjs" and (item.name.startswith("package/lib/") or item.name in {"package/LICENSE", "package/package.json"}):
            target = root / "pngjs" / item.name.removeprefix("package/")
        else:
            continue
        if not target.resolve().is_relative_to(root.resolve()):
            raise RuntimeError("Invalid archive path")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(item).read())
    print(f"Vendored {package} {version}")
