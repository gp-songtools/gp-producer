# AI Music Video Director & Storyboard Studio: Build Plan

Status: **DRAFT, awaiting approval. No application code or Vite scaffold exists yet.**

A client-side, BYOK web app on GitHub Pages that turns the `/music-video-director` skill (`SKILL.md` and `references/gemini-audio-brief.md` in this repo) into a visual workspace. Claude acts as Co-Director. Gemini (Nano Banana) renders the 16:9 anchors and storyboard frames.

---

## 0. Decisions and risks to confirm before scaffolding

| # | Item | Proposal |
|---|------|----------|
| 1 | **Gemini model IDs** | `gemini-nano-banana-2.1` and `gemini-3-pro-image` are not IDs I can verify. IDs shipped so far look like `gemini-2.5-flash-image` and `gemini-3-pro-image-preview`. Plan: ship your two names as defaults, but make the selector a **combo box** (presets plus free-text custom ID). Settings gets a **"Test & list models"** button that calls `GET /v1beta/models`, filters to `generateContent` models with "image" in the name, and fills the dropdown. If the default 404s, you pick the real ID once. |
| 2 | **Claude model** | Default `claude-sonnet-5-5` (the current Sonnet), free-text overridable, with a Settings dropdown (Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5). |
| 3 | **Shared-origin key exposure** | Project Pages sites live at `<user>.github.io/<repo>/`. `localStorage` and IndexedDB are scoped to the **origin**, so every other Pages site under `<user>.github.io` can read your keys. Mitigations: a custom domain for this repo (best), or only host trusted code on that user origin. The Settings modal shows a one-time warning, and a "Forget keys" button clears them. |
| 4 | **File tag format** | Your example is `01_Intro_00-15.mp4`. Proposed generation: `{NN}_{SectionSlug}_{startSec}-{endSec}.mp4` with whole seconds zero-padded to 2+ digits. So `03_Verse1A_26-39.mp4`. It is built **client-side** from locked fields, so Claude can never change it. Say so if you want `mm-ss` instead. |
| 5 | **Images stored as Blobs, not base64** | IndexedDB stores `Blob`s (about 33% smaller, no huge strings in memory). Base64 exists only at the API boundary and in exports. |
| 6 | **Routing** | HashRouter. GitHub Pages has no SPA fallback, so deep links on BrowserRouter would 404. |
| 7 | **Impossible runtimes** | With 10–14 s scenes, some runtimes cannot be tiled (for example 15–19 s). The validator checks feasibility before calling Claude. Everything from 50 s up is always feasible. |
| 8 | **Reference-image limits** | Gemini image models degrade with many references (roughly 3 for the Flash image model, more for Pro). Default cap: **3 anchors per scene** (configurable). Anchors are downscaled to a 1536 px long edge before sending to stay under inline request-size limits. |

---

## 1. Folder structure and components

```
gp-producer/
├── PLAN.md
├── SKILL.md, music-video-director/, gemini-audio-brief.md   # existing skill, kept as source of truth
├── .github/workflows/deploy.yml     # build + deploy to Pages
├── index.html
├── package.json                     # vite, react, react-router, tailwindcss, @tailwindcss/vite, zustand, idb, jszip, zod, vitest
├── vite.config.ts                   # base from VITE_BASE
├── tsconfig.json
├── public/                          # favicon only
└── src/
    ├── main.tsx
    ├── App.tsx                      # HashRouter, global modals
    ├── index.css                    # Tailwind + @media print rules
    ├── types/
    │   ├── project.ts               # Project, Anchor, Scene, ImageRecord
    │   └── blueprint.ts             # Claude output types (generated from zod)
    ├── schemas/
    │   ├── blueprint.zod.ts         # source of truth for the JSON schema (also emitted to JSON Schema)
    │   └── revision.zod.ts
    ├── lib/
    │   ├── lrc.ts                   # parseLrc(), formatTime(), lyricsInRange()
    │   ├── ledger/
    │   │   ├── validate.ts          # validateLedger(), feasibleSceneCounts()
    │   │   ├── normalize.ts         # deterministic gap/overlap re-tiling
    │   │   ├── fileTag.ts           # buildFileTag()
    │   │   └── lipsync.ts           # framing reminders, backing-vocal detection, handoff text
    │   ├── api/
    │   │   ├── anthropic.ts         # callBlueprint(), callRevision(); streaming + tool_use
    │   │   ├── gemini.ts            # generateImage(), listImageModels()
    │   │   ├── retry.ts             # backoff for 429/503/529, concurrency queue
    │   │   └── errors.ts            # typed ApiError, friendly messages
    │   ├── image.ts                 # downscale, blobToBase64, base64ToBlob
    │   ├── db.ts                    # idb wrapper, migrations
    │   ├── keys.ts                  # localStorage get/set/forget (try/catch wrapped)
    │   └── export/
    │       ├── bundle.ts            # jszip assembly
    │       ├── markdown.ts          # ledger.md
    │       └── handoff.ts           # lipsync-handoff.txt
    ├── prompts/
    │   ├── system.ts                # SKILL.md rules ported into the system prompt
    │   ├── blueprintUser.ts         # builds the user message (inputs, constraints)
    │   ├── revision.ts
    │   └── audioBriefPrompt.ts      # verbatim text from gemini-audio-brief.md, with copy button
    ├── store/
    │   ├── projectStore.ts          # zustand: current project, optimistic updates, debounced persist
    │   ├── settingsStore.ts         # keys + model choices
    │   └── jobsStore.ts             # image/LLM job queue, per-card status
    ├── hooks/ (useProject, useAudioPlayer, useGenerateImage, useClipboard)
    └── components/
        ├── layout/  AppShell, TabBar, ProjectSwitcher, SettingsModal, ErrorToast
        ├── setup/   LrcInput, RuntimeInput, AudioDropzone, AudioScrubber,
        │            VisionForm, AudioBriefPanel, ReadyChecklist
        ├── blueprint/
        │   ├── TreatmentPanel
        │   ├── AnchorGallery, AnchorCard, AnchorUpload
        │   ├── LedgerToolbar        # generate blueprint, validation status, "fix gaps"
        │   ├── ValidationBanner     # lists issues, links to scene cards
        │   ├── SceneCard, SceneTimeline (proportional bar), AnchorChip, LipSyncBadge
        │   └── Lightbox
        ├── production/
        │   ├── ProductionDeck, SceneStepper
        │   ├── AnchorDownloads, CopyButton, FileTagCopy
        │   ├── ReviseDrawer         # Claude revision with locked fields shown read-only
        │   └── CompletionChecklist
        └── post/
            ├── HandoffView, LipSyncSceneRow, LyricBlock
            ├── ExportPanel
            └── PrintStoryboard      # @media print layout
```

**Tabs / routes:** `#/p/:projectId/setup`, `/blueprint`, `/production/:sceneNo?`, `/post`. A project list sits at `#/`. Tabs unlock progressively (Blueprint needs a valid setup, Production needs a valid ledger) but are never hard-blocked.

**State flow:** the zustand store holds the open project. Every mutation writes through to IndexedDB (debounced 400 ms). Image blobs are written immediately and referenced by id, never held in the project object.

---

## 2. Claude output: JSON schema and validation

### 2.1 Design rules

- Times are **integer seconds** (`start_sec`, `end_sec`), not `MM:SS` strings. Models make arithmetic slips when carrying minutes. The client formats `MM:SS` for display.
- **Lyrics are not emitted by Claude.** The client derives each scene's lyrics from the `.lrc` by time range, so lyric placement is correct by construction. (The skill's "every timestamped lyric appears in the scene whose range contains it" check becomes deterministic.)
- **File tags and LIP-SYNC framing reminders are client-generated**, so they are not in the schema.
- A separate `keyframe_prompt` (a single still frame) is requested per scene. Feeding a video prompt to an image model produces worse stills.
- Output is forced through **tool use** (`tool_choice: {type:"tool", name:"submit_blueprint"}`) so the result is valid JSON matching `input_schema`. (Forced tool choice rules out extended thinking, which is fine here. Validation plus one auto-repair pass covers quality.)

### 2.2 Phase 1 schema (`submit_blueprint` tool `input_schema`)

```jsonc
{
  "type": "object",
  "required": ["schema_version", "treatment", "anchors", "scenes"],
  "additionalProperties": false,
  "properties": {
    "schema_version": { "const": 1 },

    "treatment": {
      "type": "object",
      "required": ["title", "paragraphs", "facets"],
      "properties": {
        "title": { "type": "string" },
        "paragraphs": {
          "type": "array", "minItems": 2, "maxItems": 3,
          "items": { "type": "string" },
          "description": "The 2-3 paragraph director's treatment."
        },
        "facets": {
          "type": "object",
          "required": ["narrative_metaphor", "visual_symbolism", "pacing_arc", "camera_language", "color_progression"],
          "properties": {
            "narrative_metaphor": { "type": "string" },
            "visual_symbolism":   { "type": "string" },
            "pacing_arc":         { "type": "string" },
            "camera_language":    { "type": "string" },
            "color_progression":  { "type": "string" }
          },
          "description": "One-sentence summaries shown as chips beside the prose."
        }
      }
    },

    "anchors": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "name", "category", "prompt"],
        "properties": {
          "id":       { "type": "string", "pattern": "^[a-z0-9_]+$", "description": "Stable slug, e.g. character, environment_b, prop_telephone" },
          "name":     { "type": "string", "description": "Short display name used everywhere: 'Character', 'Environment B', 'Prop: Telephone'" },
          "category": { "enum": ["character", "environment", "prop"] },
          "prompt":   { "type": "string", "description": "Standalone 16:9 widescreen image prompt. Must work pasted alone." }
        }
      }
    },

    "scenes": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object",
        "required": ["scene", "section", "start_sec", "end_sec", "duration_sec",
                     "anchor_ids", "keyframe_prompt", "base_prompt", "extension_prompt", "lip_sync"],
        "properties": {
          "scene":        { "type": "integer", "minimum": 1 },
          "section":      { "type": "string", "description": "e.g. 'Verse 1A'; used in the display title and file tag" },
          "start_sec":    { "type": "integer", "minimum": 0 },
          "end_sec":      { "type": "integer", "minimum": 1 },
          "duration_sec": { "type": "integer", "minimum": 10, "maximum": 14 },
          "anchor_ids":   { "type": "array", "minItems": 1, "items": { "type": "string" },
                            "description": "Must reference anchors[].id" },
          "keyframe_prompt": { "type": "string", "description": "Single representative still frame for Nano Banana" },
          "base_prompt":     { "type": "string", "description": "Google Flow text-to-video prompt, 10s" },
          "extension_prompt":{ "type": ["string", "null"], "description": "Required when duration_sec > 10, otherwise null" },
          "lip_sync": {
            "oneOf": [
              { "type": "null" },
              {
                "type": "object",
                "required": ["vocal_start_sec", "vocal_end_sec"],
                "properties": {
                  "vocal_start_sec": { "type": "number" },
                  "vocal_end_sec":   { "type": "number" },
                  "camera_note": { "type": "string" }
                }
              }
            ]
          }
        }
      }
    }
  }
}
```

The same shape lives in `schemas/blueprint.zod.ts`. It is validated again client-side, and zod emits the `input_schema`, so there is one definition.

**Revision schema (`submit_revision`):** `{ "base_prompt": string, "extension_prompt": string|null, "keyframe_prompt"?: string, "change_notes": string }`. It has no time or tag fields, so locking is structural rather than a request to the model.

### 2.3 Client-side validation (`lib/ledger/validate.ts`)

```ts
export type Issue = {
  severity: 'error' | 'warn';
  code: string;
  scene?: number;       // 1-based, for jump-to-card
  message: string;
};

/** Scene counts n for which 10n <= T <= 14n. Empty array => runtime can't be tiled. */
export function feasibleSceneCounts(T: number): number[] {
  const out: number[] = [];
  for (let n = Math.ceil(T / 14); n <= Math.floor(T / 10); n++) out.push(n);
  return out;
}

export function validateLedger(
  scenes: Scene[], runtimeSec: number, lrc: LrcLine[], anchorIds: Set<string>
): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, scene?: number) =>
    issues.push({ severity: 'error', code, message, scene });
  const warn = (code: string, message: string, scene?: number) =>
    issues.push({ severity: 'warn', code, message, scene });

  if (feasibleSceneCounts(runtimeSec).length === 0)
    err('RUNTIME_UNTILEABLE', `${runtimeSec}s cannot be split into 10–14s scenes.`);
  if (scenes.length === 0) { err('NO_SCENES', 'Ledger is empty.'); return issues; }

  const sorted = [...scenes].sort((a, b) => a.scene - b.scene);

  sorted.forEach((s, i) => {
    const n = s.scene;
    if (s.scene !== i + 1) err('SCENE_NUMBER', `Expected scene ${i + 1}, found ${s.scene}.`, n);
    if (![s.start_sec, s.end_sec, s.duration_sec].every(Number.isInteger))
      err('NON_INTEGER', 'Timestamps must be whole seconds.', n);

    const actual = s.end_sec - s.start_sec;
    if (actual !== s.duration_sec)
      err('DURATION_MISMATCH', `Stated ${s.duration_sec}s but ${fmt(s.start_sec)}–${fmt(s.end_sec)} is ${actual}s.`, n);
    if (actual < 10 || actual > 14)
      err('DURATION_RANGE', `Scene is ${actual}s; must be 10–14s.`, n);

    if (i === 0 && s.start_sec !== 0)
      err('START_NOT_ZERO', `First scene starts at ${fmt(s.start_sec)}, not 00:00.`, n);
    if (i > 0) {
      const prevEnd = sorted[i - 1].end_sec;
      if (s.start_sec > prevEnd) err('GAP', `Gap of ${s.start_sec - prevEnd}s before this scene (${fmt(prevEnd)}→${fmt(s.start_sec)}).`, n);
      if (s.start_sec < prevEnd) err('OVERLAP', `Overlaps previous scene by ${prevEnd - s.start_sec}s.`, n);
    }

    if (s.duration_sec > 10 && !s.extension_prompt) err('MISSING_EXTENSION', 'Over 10s requires an extension prompt.', n);
    if (s.duration_sec <= 10 && s.extension_prompt) warn('EXTRA_EXTENSION', 'Extension prompt present on a ≤10s scene.', n);

    if (s.anchor_ids.length === 0) err('NO_ANCHORS', 'No reference anchors attached.', n);
    s.anchor_ids.filter(id => !anchorIds.has(id))
      .forEach(id => err('UNKNOWN_ANCHOR', `Unknown anchor "${id}".`, n));

    // Lyric lines that start in the last ~1s are likely cut off by the scene boundary.
    lyricsInRange(lrc, s.start_sec, s.end_sec).forEach(l => {
      if (s.end_sec - l.t < 1) warn('LYRIC_AT_EDGE', `"${l.text}" begins ${(s.end_sec - l.t).toFixed(1)}s before the cut.`, n);
    });

    if (s.lip_sync) {
      const { vocal_start_sec: a, vocal_end_sec: b } = s.lip_sync;
      if (a < s.start_sec || b > s.end_sec || a >= b)
        err('LIPSYNC_RANGE', `Vocal window ${fmt(a)}–${fmt(b)} falls outside the scene or is inverted.`, n);
      if (lyricsInRange(lrc, a, b).length === 0)
        warn('LIPSYNC_NO_LYRICS', 'LIP-SYNC scene has no lyric lines in its vocal window.', n);
    }
  });

  const last = sorted[sorted.length - 1];
  if (last.end_sec !== runtimeSec)
    err('END_MISMATCH', `Last scene ends ${fmt(last.end_sec)} but runtime is ${fmt(runtimeSec)}.`, last.scene);

  lrc.filter(l => l.t >= runtimeSec)
     .forEach(l => err('LYRIC_PAST_END', `Lyric at ${fmt(l.t)} is at or after the stated runtime.`));

  const tags = sorted.map(buildFileTag);
  tags.forEach((t, i) => { if (tags.indexOf(t) !== i) err('DUP_TAG', `Duplicate file tag ${t}.`, sorted[i].scene); });

  return issues;
}
```

**Deterministic repair (`normalize.ts`):** if the only errors are `GAP`, `OVERLAP`, `START_NOT_ZERO` or `END_MISMATCH`, offer a "Snap boundaries" button. It sets each `start = previous end`, forces the first start to 0 and the last end to the runtime, and recomputes durations. It applies the result only if every duration then lands in 10–14 s. Otherwise it shows the one-click **"Ask Claude to fix"** option below.

**Auto-repair loop:** after the Claude call, if `validateLedger` returns errors, make **one** follow-up call that includes the failing issue list and the prior tool result, asking for a corrected `submit_blueprint`. If errors remain, show them in the banner and let you edit or re-ask. Nothing is silently accepted.

**Other client rules:** the `.lrc` parser handles `[mm:ss.xx]` and `[mm:ss.xxx]`, multiple timestamps per line, and ignores metadata tags (`[ar:]`, `[ti:]`, `[offset:]`, with offset applied). Lyric lines are kept as `{t: number (sec, fractional), text}`.

---

## 3. API request and response shapes

### 3.1 Claude Messages API (browser)

```http
POST https://api.anthropic.com/v1/messages
x-api-key: <from localStorage>
anthropic-version: 2023-06-01
anthropic-dangerous-direct-browser-access: true
content-type: application/json
```

```jsonc
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 16000,
  "stream": true,
  "system": "<SKILL.md rules: co-director role; no claim of having heard the audio; 10–14s scenes; zero gaps/overlaps; standalone 16:9 anchor prompts; LIP-SYNC framing rules; use Gemini audio brief per 'Using the answer'>",
  "tools": [{
    "name": "submit_blueprint",
    "description": "Submit the Director's Treatment, Reference Anchors and Scene Ledger.",
    "input_schema": { /* §2.2 */ }
  }],
  "tool_choice": { "type": "tool", "name": "submit_blueprint" },
  "messages": [{
    "role": "user",
    "content": "<project_inputs>\n{\n \"runtime_sec\": 214,\n \"allowed_scene_counts\": [16,17,18,19,20,21],\n \"lrc\": [{\"t\": 26.4, \"text\": \"...\"}, ...],\n \"section_guide\": \"...\",\n \"vision\": {\"narrative_arc\": \"...\", \"visual_tone\": \"...\", \"mood\": \"...\", \"palette\": \"...\", \"aesthetic\": \"35mm anamorphic, ...\"},\n \"gemini_audio_brief\": \"...or null\"\n}\n</project_inputs>"
  }]
}
```

- **Streaming:** the ledger for a 4-minute song is large, so non-streaming risks a browser or proxy timeout. The client reads SSE events and accumulates `content_block_delta` → `input_json_delta.partial_json`. On `message_stop` it `JSON.parse`s the buffer and runs zod. The UI shows scene count progress.
- **Non-stream response shape** (for reference): `{ "content": [{ "type": "tool_use", "name": "submit_blueprint", "input": { …blueprint… } }], "stop_reason": "tool_use", "usage": {...} }`. If `stop_reason === "max_tokens"` the JSON is truncated: show an error and offer to retry with higher `max_tokens`.
- **Audio never leaves the browser.** Only the `.lrc`, text inputs and the pasted brief are sent.
- **Revision call:** same endpoint, `tool_choice` forced to `submit_revision`. The message contains the treatment, the attached anchors' names and prompts, the current scene prompts, the scene's lyrics, and your description of what went wrong. Timestamps and the file tag appear as read-only context labelled "LOCKED". The tool schema has no fields for them. The client merges only the returned prompt fields and stores the old values in `scene.revisions[]` for undo.
- **Errors:** `401` bad key, `429` rate limit (honor `retry-after`), `529` overloaded (backoff 2 s, 5 s, 12 s), `400` surfaced verbatim.

### 3.2 Gemini image generation (browser)

```http
POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent
x-goog-api-key: <from localStorage>
content-type: application/json
```

**Reference anchor (text only):**

```jsonc
{
  "contents": [{ "role": "user", "parts": [
    { "text": "<anchor.prompt>\n\nRender as a single cinematic 16:9 widescreen image. No text, captions or watermarks." }
  ]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "16:9" }
  }
}
```

**Scene keyframe (text + multiple reference anchors).** Each image is preceded by a label so the model knows which anchor is which, and instructions come last:

```jsonc
{
  "contents": [{ "role": "user", "parts": [
    { "text": "Reference images follow. Keep character identity, wardrobe, environment design and props consistent with them." },
    { "text": "Reference 1 — Character:" },
    { "inlineData": { "mimeType": "image/png", "data": "<base64 anchor 1>" } },
    { "text": "Reference 2 — Environment B:" },
    { "inlineData": { "mimeType": "image/jpeg", "data": "<base64 anchor 2>" } },
    { "text": "Reference 3 — Prop: Telephone:" },
    { "inlineData": { "mimeType": "image/png", "data": "<base64 anchor 3>" } },
    { "text": "Generate one 16:9 widescreen cinematic storyboard frame for this scene, using the references above for continuity:\n<scene.keyframe_prompt>\nNo text or watermarks." }
  ]}],
  "generationConfig": { "responseModalities": ["IMAGE"], "imageConfig": { "aspectRatio": "16:9" } }
}
```

For the Pro model, `imageConfig.imageSize` (`"1K"` / `"2K"`) is exposed as an optional setting.

**Response:**

```jsonc
{
  "candidates": [{
    "content": { "parts": [
      { "text": "optional commentary" },
      { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }
    ]},
    "finishReason": "STOP"
  }],
  "usageMetadata": { ... }
}
```

**Handling:** take the first part with `inlineData`; convert it to a `Blob`; store it in `images` with the model ID and prompt. No image part but text present means the model refused, so show its text. `promptFeedback.blockReason` or `finishReason` of `IMAGE_SAFETY` / `PROHIBITED_CONTENT` gives a clear "blocked" card state with a retry button. `429` / `503` use exponential backoff. Generation runs through a queue with concurrency 2. "Generate all missing" is a button, not automatic.

**Reference prep (`lib/image.ts`):** blob → canvas downscale to a 1536 px long edge → JPEG/PNG → base64, with a total request-size guard (about 15 MB) and a warning if exceeded. Uploaded custom anchors go through the same path and are used identically.

**Fallback:** if `responseModalities: ["IMAGE"]` returns 400 on a given model, retry once with `["TEXT","IMAGE"]` and remember per model.

---

## 4. IndexedDB schema

Database `gp-producer` (namespaced to avoid collisions on the shared `github.io` origin), version 1, accessed through `idb`. A `meta` store holds the schema version for migrations.

| Store | Key | Indexes | Contents |
|-------|-----|---------|----------|
| `projects` | `id` (uuid) | `updatedAt` | `{ id, name, createdAt, updatedAt, runtimeSec, lrcRaw, lrcLines[], audioFileName?, vision{narrativeArc, visualTone, mood, palette, aesthetic}, audioBrief, treatment?, imageModel, keyframeModel, blueprintRunId?, progress{ setup, blueprint, productionIndex } }` |
| `anchors` | `[projectId, anchorId]` | `projectId` | `{ projectId, anchorId, name, category, prompt, activeImageId?, source: 'generated'|'uploaded'|null, order }` |
| `scenes` | `[projectId, scene]` | `projectId` | `{ projectId, scene, section, startSec, endSec, durationSec, anchorIds[], keyframePrompt, basePrompt, extensionPrompt, lipSync?, activeKeyframeId?, checklist{ anchorsAttached, baseGenerated, extensionGenerated, downloaded, tagged }, status, revisions[{at, request, old{basePrompt, extensionPrompt, keyframePrompt}, notes}] }` |
| `images` | `id` (uuid) | `projectId`, `ownerKey` (`anchor:<id>` or `scene:<n>`) | `{ id, projectId, ownerKey, kind: 'anchor'|'keyframe', blob, mime, width, height, model, prompt, source, createdAt }`. Keeps the last 3 generations per owner so regenerate is undoable. |
| `runs` | `id` | `projectId` | Raw Claude blueprint and revision payloads plus `usage`, for undo, debugging and re-validation. |
| `meta` | `key` | | `{ key: 'schemaVersion', value: 1 }` |

**Not stored in IndexedDB:** the audio file (held as an object URL in memory only), and API keys.

**`localStorage` (keys):** `gpp.anthropicKey`, `gpp.geminiKey`, `gpp.settings` (model choices, per-scene anchor cap, Claude model). Every access is wrapped in try/catch, and the app is usable but read-only for generation if storage is blocked. The Settings modal also warns that keys sit in plaintext in browser storage.

**Persistence behavior:** writes are debounced and transactional. A "Storage" indicator calls `navigator.storage.persist()` and `estimate()`. Projects can be exported and imported as a full `.zip` (a superset of the export bundle).

---

## 5. Phase 3 outputs

**Handoff view:** filters scenes with `lip_sync`. Each row shows the file tag, vocal start/end, and a formatted lyric block (`[MM:SS.xx] line`, timed tags such as `[03:21.30] [ECHO]` drawn from the Gemini brief's singing-stop tags, shown as **unverified until you tick "checked by ear"**). Lines wholly in parentheses are flagged: "Backing vocal. On-screen singer shouldn't mouth this." Automatic framing reminders per the skill: face largest in frame, mouth unobstructed (mic beside or below, hands and hair clear), no dissolves, whip pans or strobing, and no sub-second cutting on sung lines.

**Export bundle (`jszip`):**

```
{project}/
├── anchors/       character.png, environment_b.png, prop_telephone.png …   (uploaded or generated)
├── keyframes/     01_Intro_00-15.png …                                      (named by file tag)
├── ledger.json    (treatment, anchors, scenes, all prompts)
├── ledger.md      (readable ledger)
└── lipsync-handoff.txt
```

**Print:** `@media print` hides chrome and the tab bar. Each scene prints as a card (keyframe, timestamps, anchors, prompts) with page breaks between scenes, and the timeline bar is shown at the top.

---

## 6. Deployment

- `vite.config.ts`: `base: process.env.VITE_BASE ?? '/'`. The Actions workflow sets `VITE_BASE=/${{ github.event.repository.name }}/`, so renames and forks work. With a custom domain it stays `/`.
- `.github/workflows/deploy.yml`: on push to `main` → `actions/checkout`, `actions/setup-node`, `npm ci`, `npm run build`, `actions/configure-pages`, `actions/upload-pages-artifact` (`dist`), `actions/deploy-pages`. Permissions: `contents: read`, `pages: write`, `id-token: write`. One-time manual step: **Settings → Pages → Source: GitHub Actions**.
- No secrets in the repo, workflow or build. A Content-Security-Policy `<meta>` limits `connect-src` to `api.anthropic.com` and `generativelanguage.googleapis.com`.
- A `.gitignore` covers `node_modules`, `dist`, `.env*`.

---

## 7. Phased build plan

Each milestone ends in something deployable and testable. Work happens on branch `claude/wizardly-dirac-vazkwu`. No PR is created unless you ask.

**M0: Scaffold and deploy (about half a day)**
Vite + React + TS + Tailwind, HashRouter shell with the four tabs, the Pages workflow with the `base` fix, and `vitest`. *Done when:* the empty shell loads at the Pages URL with working deep links.

**M1: MVP, Setup + Claude blueprint + ledger (core value)**
- `.lrc` parser, with unit tests (multi-stamp lines, offsets, centisecond variants).
- Setup tab: paste/upload `.lrc`, runtime input, vision form, audio-brief panel with the copyable Gemini prompt, local audio player with scrub and "jump to timestamp".
- Settings modal with keys and model selector, storage warning.
- IndexedDB layer and project switcher (create, rename, delete, duplicate).
- `submit_blueprint` streaming call, zod validation, one auto-repair pass.
- Blueprint tab: treatment panel, anchor cards (prompt + copy only), scene cards (text only), validation banner, timeline bar, "Snap boundaries".
- Validator tests: gaps, overlaps, bad end, duration range, mismatched duration, unknown anchor, untileable runtime, lyric at edge.
*Done when:* a real `.lrc` produces a validated ledger that survives reload.

**M2: Visual engine (Nano Banana)**
- Gemini client, model selector with "Test & list models", job queue, retry and error states.
- Anchor Generate/Regenerate, custom upload, image history.
- Scene keyframes using attached anchors as labelled references, with the 3-anchor cap and downscale, plus lightbox, anchor chips, "Generate all missing".
*Done when:* every anchor and scene card shows its image and keyframes visibly track the anchors.

**M3: Production Deck (Execution Mode)**
- Focused one-scene view, Prev/Next, keyboard shortcuts, completion checklist saved per scene.
- Anchor thumbnails with download, copy buttons (base prompt, extension prompt with target timeline mark, file tag).
- Revise drawer with Claude (locked fields displayed, diff view, accept/undo through `revisions[]`, optional keyframe re-render).
*Done when:* a scene can be revised without its timestamps or tag changing, verified by test.

**M4: Post-production, export, print**
- Handoff view with the lip-sync filter, lyric blocks, backing-vocal flags, "checked by ear" gate for stop tags.
- `jszip` export bundle and project-level import/export.
- Print stylesheet.
*Done when:* the bundle opens cleanly and `lipsync-handoff.txt` matches the skill's format.

**M5: Hardening**
Accessibility pass, mobile layout, empty/error states, storage-quota handling, an onboarding checklist, a README with setup and the key-safety notes, and an e2e smoke test with mocked APIs (Playwright).

---

## 8. Out of scope (for now)

Audio upload to any API, automatic beat detection, Google Flow automation (the app only prepares prompts and assets), multi-user sync, and any server component.

---

## 9. Needs your approval

1. Treat `gemini-nano-banana-2.1` and `gemini-3-pro-image` as editable defaults with the model-listing button (§0.1)?
2. File tag format `NN_Section_start-end.mp4` in whole seconds (§0.4)?
3. Integer-second schema with client-derived lyrics and tags (§2.1)?
4. Custom domain, or accept the shared-origin key exposure on `github.io` (§0.3)?
5. Anything to add or cut before M0?
