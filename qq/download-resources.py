"""Download optional ZZZeroUID art after the streamer explicitly requests it."""

import asyncio

from gsuid_core.plugins.ZZZeroUID.utils.resource.download_all_resource import (
    download_all_resource,
)


if __name__ == "__main__":
    print("Downloading missing Zenless Zone Zero art. This may take a while...", flush=True)
    asyncio.run(download_all_resource())
    print("Download check finished. Review any errors above before closing.", flush=True)
