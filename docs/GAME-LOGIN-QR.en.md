# Game login QR at queue call (v1.13.0)

This feature reads the QR displayed by the ZZZ PC game's login screen through an OBS source. It does not reuse the bot's Cookie authorization QR or generate login credentials.

1. Connect the assistant to the public bot and bind your group. Viewers should verify their Bilibili identity with `/绑定B站` first.
2. Open the game's QR login screen. Make sure an OBS Game Capture or Window Capture source shows the whole QR.
3. Enable OBS WebSocket under Tools, keep authentication enabled, and note the port and password.
4. On the streaming PC, open the full assistant dashboard and find Game login QR. Enter the OBS connection details, load sources and select the game source.
5. Fetch a frame, drag around the complete QR, save and run the recognition test. The test previews the cropped QR without calling anyone or posting to QQ.
6. Refresh the QR in the game, then click Complete current · call and send QR. The next viewer becomes current and the bound group receives the call and QR.
7. If delivery fails or the QR expires, refresh it in the game and use Resend current QR. This does not advance the queue again.

Failed recognition or a changed queue prevents advancement. If the call succeeds but image delivery fails, resend rather than completing the current task again. Crop settings must be set on the streaming PC; paired phones can use the send buttons afterward.

The OBS password stays in local `data/game-qr.json`; do not share that file. Capture occurs only on a button click. Only the cropped QR reaches the server, and QR images are not saved to disk. All group members can see it: only the named viewer should scan and approve the game login. The 30-second send token does not guarantee that the game's QR is still valid.

Synthetic-image tests cover recognition, routing and safe retries after delivery failures. Manual acceptance in group 168426621 confirmed real OBS capture, visible QQ delivery and successful ZZZ PC login after scanning with MiYouShe. Resending preserved the queue and did not replay voice. Test your own OBS source and group permissions during first-time setup. This feature needs both streamer and public-bot updates, but no gsuid_core or ZZZeroUID update. Existing queue/call endpoints remain available to older clients.
