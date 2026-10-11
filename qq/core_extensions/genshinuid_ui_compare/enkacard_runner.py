"""Isolated EnkaCard renderer: stdin is a public snapshot, stdout is PNG."""
import asyncio
from contextlib import redirect_stdout
from io import BytesIO
import json
import logging
import sys


async def main() -> None:
    payload = json.loads(sys.stdin.buffer.read())
    with redirect_stdout(sys.stderr):
        from enkacard import encbanner
        from enkacard.src.generator.teample_one import Creat
        from enkanetwork.model.base import EnkaNetworkResponse

        logging.disable(logging.CRITICAL)
        raw = payload['raw']
        raw['avatarInfoList'] = [item for item in raw['avatarInfoList'] if str(item['avatarId']) == payload['avatarId']]
        _, _, translation = await encbanner.set_lang('chs')
        parsed = EnkaNetworkResponse.parse_obj(raw)
        if len(parsed.characters) != 1:
            raise ValueError('Exactly one snapshot character required')
        card = await Creat(parsed.characters[0], translation, None, False, str(raw['uid']), parsed.player.nickname).start()
        output = BytesIO()
        card['card'].save(output, format='PNG')
    sys.stdout.buffer.write(output.getvalue())


if __name__ == '__main__':
    asyncio.run(main())
