# DrComp Frame Batch 2.4 — ChatGPT + Google Flow

A Chrome companion side panel that sends your timestamped TXT prompts to the selected website and saves the resulting images with frame numbers. The extension controls stay beside your website; clicking the extension no longer opens a dashboard tab.

## Upgrade from version 1 or 2

1. Pause any running batch and close the old dashboard tab.
2. Extract this ZIP. Replace the files inside your existing `frame-batch` extension directory with the new files. Keeping the same directory preserves the extension identity and its queue.
3. Open `chrome://extensions` and click Reload on DrComp Frame Batch. Check that its version is **2.4.0**. Accept the added site permissions if Chrome asks.
4. Reload your ChatGPT or Flow page once after upgrading to clear the old page adapter.
5. Click the pinned DrComp Frame Batch icon. The controls open in Chrome's side panel beside the website.

For a fresh installation: enable Developer mode on `chrome://extensions`, click Load unpacked, and select the extracted `frame-batch` directory that contains manifest.json. Requires desktop Chrome 116 or later.

Chrome controls whether its side panel appears on the left or right. If your browser has it on the left, change Chrome's side-panel placement preference to the right. The extension itself does not open a new tab for its controls. The explicit Open website button opens the selected service when needed.

## Version 2.1 tracking fix and download checkbox

The old version depended on finding a tracking token inside one legacy ChatGPT message selector and stopped after about 14 seconds if it could not. This version supports message-role and conversation-turn layouts, places the token at the start of new requests, waits for send acknowledgement, persists user/assistant turn IDs, and can recover an older pending request by uniquely matching the original prompt. It allows two minutes for a temporarily missing turn. It never substitutes an unrelated last image or automatically resends an unconfirmed request.

After upgrading, keep your original conversation open and click Resume; pending version-2 requests can be recovered without resetting the queue. If Chrome shows a stale page-adapter warning, reload the website once. If a prompt remains unsent in the composer, send that existing prompt manually once and Resume. Use Regenerate only when you intend a fresh generation.

Below “Wait between images” is **Allow multiple automatic downloads for this website**. Clicking it requests Chrome's optional content-settings permission, then allows automatic downloads for the selected ChatGPT or Flow origin only. It reads the effective setting back and reports a policy conflict instead of claiming success. Unchecking removes this extension's override for that site and leaves your underlying Chrome setting intact; other sites enabled through the extension remain enabled. Chrome-managed rules may prevent changes.

This setting is separate from image-request tracking. The reported “pending request is not visible” error was a tracking failure, not proof that Chrome blocked a download. Extension downloads still use chrome.downloads, and “Ask where to save each file” remains a separate Chrome setting. The adjacent button opens Chrome's automatic-download settings.

Use `three-frame-test.txt` for a short multi-frame check after upgrading. It contains the first three prompts from your supplied output. Keep the panel open until all three frames are marked done. The normal single-frame sample is also included.

## Version 2.4 — ChatGPT Work result detection and failed-frame retries

The screenshot showed ChatGPT Work generating an image while the old adapter could not find standard ChatGPT message-role attributes. A new Work fallback locates the rendered request text and inspects large images following that request, ending before the next batch request. It excludes earlier images, sidebar/navigation content, small display thumbnails and images snapshotted before the request. It never blindly takes the last image on the page. Standard ChatGPT tracking remains available.

After updating and reloading the website, Resume the saved queue in the original conversation. The adapter attempts to recognize and save the already-generated first image before submitting frame 2. Do not reimport your TXT or use Regenerate just to recover that existing result.

Failed-frame controls:

- A failed frame displays **failed**, its error, and **Retry frame** at the end of its row.
- **Generate failed items** processes only failed rows, sequentially. Completed and ordinary pending rows are excluded.
- Retrying first looks for a recoverable existing output. If it exists, the extension saves it; otherwise it makes a fresh generation. Fresh generations can consume your account allowance.
- A normal batch records item failures and continues to the next pending item when the website is ready. It pauses if a generation remains active, a draft is unsent, the page disconnects, or a quota/authentication problem is detected.
- **Start / Resume** processes pending frames. Use the dedicated retry controls for failed frames. Pausing by the user does not mark the current frame failed.
- Frame status, error and failure time persist with the queue and are included in Export progress.

Tests cover Work-like markup without message roles, old/sidebar/later-image rejection, individual retry, bulk retry, missing-output regeneration, completed-frame skipping and three sequential frames. These are simulated tests; live account verification is still outstanding. The screenshot supplies visual evidence but not the live page DOM.

## Version 2.3 — rich-text verification and draft recovery

Fixes the false “website did not accept the prompt” error when ChatGPT converts inserted line breaks into paragraphs or replaces the editor element. Verification now compares the full prompt with whitespace normalized against the live editor. Existing matching drafts are reused, never appended to.

Resume can recover a waiting frame left by the previous version: if its exact draft is still in the composer, it sends that draft once; if the request is already in the conversation, it waits for its image. It never fills an empty composer or sends unrelated text as part of that recovery. Do not use Regenerate merely to clear this error.

For the draft already visible in the screenshot, a workaround before updating is to click the blue Send arrow once, then Resume. After updating, reload the website to replace the old adapter and Resume the saved queue in the same conversation. If the browser discarded the unsent draft during reload and no request exists, explicitly reset that frame with Regenerate.

New simulated regression tests cover contenteditable paragraph spacing, editor replacement during input, matching-draft recovery, duplicate prevention, and refusing unrelated drafts. Live authenticated testing remains unverified.

## Version 2.2 — automatic ChatGPT controls

ChatGPT no longer requires Map controls. The mapping button is hidden for ChatGPT, and previously saved ChatGPT mappings are ignored. A new empty chat only needs a prompt box to be considered ready. The extension fills the prompt first, then waits up to 15 seconds for the actual enabled Send control to render. It never uses the voice/chat-mode button or an arbitrary form submit button as a fallback.

Click Start / Resume to connect and run automatically. Connect / Repair remains available for diagnostics but is not a required setup step. Reload the website once after upgrading to remove the previous page adapter. Flow retains its separate manual mapping workflow.

Regression coverage includes an empty chat with no Send button, stale mappings, delayed Send rendering after text entry, and three consecutive frames. Tests are simulated; live authenticated account execution has not been verified.

## ChatGPT

1. Open a dedicated chat at https://chatgpt.com and sign in normally.
2. Open the extension side panel; select **ChatGPT**.
3. Select the page in the tab list. No mapping is needed; Start / Resume connects automatically.
4. Import your OUTPUT TXT (not the master prompt or SRT), enter a folder name, and click **Start / Resume**.

Connect / Repair injects the adapter into already-open tabs when necessary. It checks for the prompt box; Send is detected later, after filling the prompt. If Chrome blocks access, open the extension's Details → Site access, allow ChatGPT, reload the page, then connect again. If the prompt box is unavailable, open a normal chat and let the page finish loading before resuming. Do not map a voice or chat-mode button.

Use an image-capable ChatGPT mode available to your account. Keep the side panel and website open, keep your computer awake, and avoid manually sending other requests in the connected chat during a batch.

## Google Flow — Nano Banana

1. Open https://labs.google/fx/tools/flow, sign in and open a project.
2. In Flow's prompt-box model menu, choose **Image**, your available **Nano Banana** model, your aspect ratio (16:9), and **one output**. Turn off Agent mode if shown. The extension uses your current model settings; it does not automatically change them.
3. Make one sample image manually to establish a visible generated-image grid. Wait for it to finish and clear the prompt box.
4. In the extension choose **Google Flow · Nano Banana**, select its tab, and click **Map controls**.
5. Follow the green overlay on the Flow page:
   - Select the editable prompt box.
   - Select the Generate button. This mapping selection is intercepted; it does not submit a generation.
   - Hover an image in the results area. Press the Up Arrow to expand the highlighted area to the persistent results grid containing the generated cards, then Enter to select it. Avoid selecting one individual image/card; select the grid that receives future results. Escape cancels mapping.
6. Check “Flow is set to Image, Nano Banana, one output.” Import your TXT, name your folder and click Start / Resume.

Mappings are saved locally. Remap if Flow changes its layout or you change to a different project layout. Use the same visible results grid during the batch. Do not switch projects, change sorting, scroll a virtualized gallery, upload images, or generate other images while the queue runs. The adapter snapshots existing result URLs before each generation and accepts one new loaded image after it stabilizes. Multiple new images stop the queue rather than guessing.

Flow integration is based on the visible interface and configurable controls, not an official generation API. It is implemented and covered by simulated tests but **not verified against a signed-in live Flow account**. Start with the supplied one-frame sample and verify that the correct new image was saved. If your Flow layout renders results without `<img>` elements, the adapter will time out and will need an update.

## Files and naming

With the default Chrome download directory and folder name ArtCraft:

    Downloads/ArtCraft/FRAME_001__00-00-00-000__00-00-05-000.png
    Downloads/ArtCraft/FRAME_002__00-00-05-000__00-00-10-000.png

Frame numbers are the IMAGE numbers from the TXT, not video-frame indices at a particular FPS. Timestamps identify each image's place in your edit. Persian folder names work. Unsafe path characters are replaced, and existing files are never overwritten; Chrome may add a suffix to resolve a duplicate filename.

Chrome downloads are relative to your browser's download directory. To save elsewhere, change Chrome Settings → Downloads → Location. Disable “Ask where to save each file before downloading” for unattended saving; managed-browser policies may still require a prompt.

The extension saves the displayed generated image as PNG at its available resolution. It does not guarantee an original full-resolution download, exact 1920 × 1080 output, or perfect prompt adherence. Prompts from your TXT are preserved; ChatGPT additionally receives a one-image instruction and tracking token, while Flow receives the original prompt only.

## Recovery

- Pause stops at the next safe point. A submitted generation or started download can still finish.
- Keep the panel open while running. Closing it ends the queue controller; reopen and click Resume. Stored markers and Flow baseline records let it retrieve the existing pending result without automatically generating again.
- After restarting Chrome, reopen the original conversation/project, select it in the panel and resume. A Flow recovery record must match that same project URL.
- Completed frames are skipped. A download must finish before its frame is marked complete.
- An interrupted download can be retried without another image-generation request.
- Use **Regenerate current** only when you intend to submit a new request or the prior request never reached the service. It clears the pending record and may consume another generation.
- You may change providers between frames. A pending frame must be completed on its original provider, or explicitly reset with Regenerate before switching.
- If a limit, refusal, sign-in wall, ambiguous result or unsupported layout blocks the queue, review the website. No limits or authentication controls are bypassed. A missing image times out after 15 minutes.
- Export progress writes an audit JSON with prompts and state. This version does not import that audit file. Removing the extension deletes its local queue and mappings.

## Permissions and privacy

- Optional `contentSettings`: requested only when you enable the automatic-download checkbox; modifies only this extension’s rules for the selected provider site.
- `sidePanel`: companion UI beside the page.
- `scripting`: repair connections to tabs already open before installation.
- `tabs`: identify the selected provider tab and check its URL.
- `storage`: local queue, progress and control mappings.
- `downloads`: save PNGs and verify completion.
- Site access to ChatGPT and Flow: fill the selected prompt box and read generated results.
- Access to OpenAI image hosts, Google image hosts, Azure Blob hosts and Google Cloud Storage: fetch the displayed generated image if canvas access fails.

No analytics, remote backend, API key, password collection or cookie-reading permission. Prompts are sent through the service's normal visible Generate/Send control only when you start a queue. Your account's generation limits apply.

## Validation and limitations

34 automated tests passed: the supplied 160-frame TXT; parser and filename validation; already-open-tab connection repair; wrong-provider rejection; ChatGPT request/image matching; Flow result snapshots, signed-URL normalization and project checks; three consecutive acknowledged ChatGPT requests including collapsed user bubbles; and a simulated three-frame queue covering both providers, failed-download recovery, and completed-frame skipping. JavaScript syntax and extension manifest checks passed.

These are unit and mocked integration tests. Live authenticated ChatGPT and Flow generation/downloads remain unverified. A Playwright browser-fixture test is included, but could not be executed in the build environment because its Chromium executable is unavailable. Do not treat it as a passed test.

Run automated tests with Node.js:

    node --test tests/*.test.mjs

Optional browser-fixture test, after installing Playwright and Chromium:

    node tests/browser-fixtures.cjs

Official references:
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome Downloads API: https://developer.chrome.com/docs/extensions/reference/api/downloads
- Google Flow image workflow: https://support.google.com/flow/answer/16729550?hl=en
