"""Persist the public bot's Genshin prefix and panel style in core data."""
import json
import sys
from pathlib import Path


def main() -> None:
    data = Path(sys.argv[1])
    plugin_path = data / 'plugins_configs/GenshinUID.json'
    panel_path = data / 'GenshinUID/config.json'
    plugin = json.loads(plugin_path.read_text(encoding='utf-8'))
    panel = json.loads(panel_path.read_text(encoding='utf-8'))
    plugin.update(prefix=['ys'], disable_force_prefix=True, allow_empty_prefix=False)
    panel['OldPanle']['data'] = False
    for path, value in ((plugin_path, plugin), (panel_path, panel)):
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
        temporary.replace(path)
    print('GenshinUID configured: /ys, new panel UI')


if __name__ == '__main__':
    main()
