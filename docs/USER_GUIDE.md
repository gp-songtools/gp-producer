# Music Video Director: user guide

Music Video Director helps you plan and produce an AI-generated music video for a song. It writes the creative plan, the image prompts and the video prompts, and keeps every scene's timing correct. **It does not make the video.** You make the clips yourself in Google Flow, using the prompts and images this app prepares, and then assemble them in a video editor.

Everything runs in your browser. Your projects are stored on your own computer. The only things that leave it are the requests you start: to Anthropic (Claude, for the plan) and to Google (Gemini, for images and the optional audio brief).

## The big picture

The app has four tabs. You work through them in order.

1. **Setup** — give it the song: timed lyrics, the song's length and your idea for the look and feel.
2. **Blueprint** — Claude writes a *treatment*, a set of *reference anchors* (the recurring character, places and props) and a *scene ledger*: the song cut into scenes of 10 to 15 seconds, each with prompts. Gemini can draw the anchors and a storyboard frame for every scene.
3. **Production** — one scene at a time, copy each prompt into Google Flow, attach the reference images, download the clip and tick it off.
4. **Post** — prepare the files for a lip-sync step (optional) and export everything.

**What you do outside the app:** generate the clips in Google Flow, assemble them over your song in a video editor (Clipchamp, CapCut or similar) and, if you want singing faces to match the words, run a lip-sync tool.

**What you need:**

- The song's lyrics with timestamps, as an `.lrc` file.
- The song's total length.
- An **Anthropic API key** (required; this is how Claude writes the plan).
- A **Gemini API key** (optional; for images and for the audio brief).
- Access to Google Flow, and the song's audio file.

## Quick start

1. Open **Settings** (top right) and paste your Anthropic key. Add your Gemini key too if you have one. Read [Keys, privacy and safety](#keys-privacy-and-safety) first.
2. On the project list, click **New project**.
3. **Setup:** paste or upload your `.lrc` lyrics, enter the song's runtime (for example `3:34`), and fill in at least the *Narrative arc* or *Visual tone*.
4. Optional but recommended: add your song under **Local audio**, then use **Generate with Gemini** in the audio brief card. See [Gemini audio brief](#gemini-audio-brief).
5. When **Ready for Blueprint?** shows the required items ticked, click **Continue to Blueprint**.
6. **Blueprint:** click **Generate blueprint** and wait. Stay on the tab until it finishes.
7. Read the treatment and the scene cards. Fix any red errors (see [Validation](#validation-red-and-amber-messages)).
8. Optional: generate the anchor images, then the storyboard frames. Look at them, and regenerate any you dislike.
9. **Production:** for each scene, work through the steps in [Producing a scene in Google Flow](#producing-a-scene-in-google-flow).
10. **Post:** export what you need. See [Post: lip-sync files and exports](#post-lip-sync-files-and-exports).

## Setup tab

### Lyrics (.lrc)

The app needs lyrics with timestamps in `.lrc` format, one line per sung line:

```
[00:14.20] I don't belong here
[00:18.90] It's not safe
```

Paste the text or click **Upload .lrc**. It understands lines with several timestamps, centisecond or millisecond variants and an `[offset:]` tag. It shows how many lines it read and how many it skipped.

- **Your lyric timestamps are the authority.** Everything else (including the Gemini brief) is checked against them.
- Lines wholly in parentheses, like `(ooh)`, are treated as **backing vocals**.
- The app reads `.lrc` only. If your transcription tool gives you SRT, VTT or JSON, convert it to `.lrc` first.

**Timed lyrics from a Song Spec.** The GP Song Tools share a *Song Spec*, a `.songspec.md` file with a section per tool. If you aligned your lyrics in Framecut, its **Timed lyrics** section is already `.lrc`. Under the lyrics box, use **Load timed lyrics from Song Spec**:

- **Open .songspec.md…** reads a Song Spec file from your computer.
- **Use shared Song Spec** reads the copy the GP Song Tools keep in this browser. It is available only when that copy has Timed lyrics.

If the project already has lyrics, the app asks before replacing them. It tells you which tool wrote the lyrics. If the spec has no Timed lyrics, it says so; add them in Framecut first. The Song Spec is only read here; nothing is written back from the Setup tab.

### Runtime

Enter the song's total length as `3:34` or `214`. The app shows how many scenes that allows. It must be at least 10 seconds and longer than your last lyric's timestamp.

### Local audio

Optional. Drop your song here to scrub through it, jump to a time, and click any lyric line to hear it. This is for checking timestamps by ear.

The audio stays in this browser tab's memory. It is **not saved** (add it again after a reload) and it is **never sent anywhere**, with one exception you control: the **Generate with Gemini** button in the audio brief sends it to Google.

### Thematic vision

Five boxes describe the look and feel: *Narrative arc*, *Visual tone*, *Mood*, *Color palette* and *Film aesthetic*. Fill in at least the arc or the tone; the more you give Claude, the more the video will feel like yours. Short, concrete phrases work better than long ones.

### Gemini audio brief

Claude can't hear the song. A *brief* from Gemini describes it: sections, energy, instruments, who is singing when, and where the singing stops. Claude uses it to pace scenes and to avoid putting a close-up singing shot over a stretch with no singing. It is optional, but worth doing for songs with spoken parts, echoes or long instrumental sections.

There are two ways to get it:

- **Automatic:** add your song under **Local audio** and click **Generate with Gemini**. The first time, you are asked to confirm that your audio goes to Google. It takes a minute or two, and the result fills the box below. You need a Gemini key.
- **By hand:** click **Copy prompt (with my lyrics)**, open the Gemini app, attach your song, paste the prompt, and paste Gemini's whole answer into **Paste Gemini's answer**.

Gemini can be a few seconds off on timestamps, so read the brief over. The **singing stop tags** in it are drafts until you check them by ear on the Post tab.

### Ready for Blueprint?

The checklist on the right shows what is still needed: lyrics, runtime, a vision, and your Anthropic key are required; the brief and the audio are optional. You can go to Blueprint early, but Claude can't write the plan until the required items are done.

## Blueprint tab

### Generating the blueprint

Click **Generate blueprint**. Claude writes the whole plan in one go, which can take a few minutes for a long song. A progress line counts scenes as they arrive.

- **Stay on this tab until it finishes.** Leaving cancels the request. **Cancel** stops it yourself.
- The **effort** setting trades cost and speed against care. Lower is cheaper and faster but may slip on timestamp arithmetic. See [Settings reference](#settings-reference).
- If the first draft has errors, the app asks Claude to correct it once, automatically.
- Generating again **replaces** the blueprint: prompt edits are lost; anchor images are kept where the anchor id matches; storyboard frames are kept but marked *prompt changed* where the prompt differs, and frames beyond the new scene count are deleted. The app asks you to confirm first. Checklists and revisions on scenes are reset.

### What you get

- **Treatment:** a short director's statement with the story, symbols, pacing, camera language and colour progression.
- **Visual reference anchors:** standalone image prompts for the things that recur, such as the *character*, an *environment* and a *prop*. Their job is to keep the video consistent: the same face, the same place.
- **Scene ledger:** the song cut into scenes. Each card shows the section name, start and end time, length, attached anchors, the lyrics in that scene, the Google Flow **base prompt**, an **extension prompt** if the scene has one, a **keyframe prompt** (a single still for the storyboard), the **file tag** and, for singing scenes, a **LIP-SYNC** badge.
- **Timeline bar:** the whole song as proportional blocks, one per scene. Amber marks an extension; red outlines a scene with errors. Click a block to jump to it.

### Scene lengths

This is the most important rule, because Google Flow only allows certain lengths.

- A scene is **one base clip of 10 to 15 seconds**. This is the default.
- Only for a special requirement (a move that must finish, a held beat) a scene may add an **extension of 3 or 4 seconds**, for up to 19 seconds in total. Claude must give a reason, shown on the card as *Why extended*.
- A 10-second clip with a 2-second extension is **not possible** in Flow, so the app rejects it. So are scenes longer than 19 seconds.

### Validation: red and amber messages

The banner at the top and the notes on each card check the ledger against your lyrics and runtime:

- **Red errors** must be fixed: gaps or overlaps between scenes, a scene length that isn't allowed, the last scene not ending exactly at the song's runtime, an unknown anchor, an empty prompt.
- **Amber warnings** are worth a look but don't block you: for example a lyric that begins just before a cut, a LIP-SYNC scene with no lyrics in its vocal window, a treatment of the wrong length, or two anchors with the same name.

To fix errors, click **Ask Claude to fix**; it sends the list of problems back and replaces the blueprint with a corrected one. If the problem is only that scene boundaries don't add up, **Snap boundaries** repairs them deterministically without Claude. Scenes whose length it changes are flagged **Needs review**, because their prompts were written for the old length; **Ask Claude to fix** can rewrite those.

### Anchor images

Anchors can have images. On each anchor card:

- **Generate** / **Regenerate** draws it with Gemini. A menu picks the model role (Workhorse, Hero or Draft).
- **Upload** lets you use your own picture instead.
- **Upgrade to Hero** re-renders with the best model; the earlier version is kept.
- **Earlier versions** shows previous images; click one to make it current. The last three versions are kept.
- **Download** saves the image, for example to attach in Flow.
- **Generate missing** renders every anchor that has no image yet, after asking you to confirm (each image is a real charge on your Gemini account).

Generate the anchors **before** the storyboard frames, so the frames can use them as references.

### Storyboard frames

Each scene card has a frame drawn from its keyframe prompt. The anchors attached to the scene are sent along as labelled references, so the frame tracks the look you chose. Controls:

- **Generate frame** / **Regenerate frame** on a card; the model menu works as for anchors.
- **Generate missing frames**, **Retry failed** and **Regenerate outdated** work on many scenes at once (two at a time) and ask for confirmation first.
- A frame shows **prompt changed** if the keyframe prompt was edited after it was made, and **references changed** if an anchor image was replaced. Neither is an error.
- A frame that isn't 16:9 is flagged **not 16:9**.
- Click a frame to enlarge it; the arrow keys move between frames.

**Draft mode** (checkbox above the anchors) makes ordinary renders use the cheap Draft model, which is handy while you are still deciding. Hero renders stay Hero. A counter shows how many images you have made this session.

If Gemini refuses an image ("wouldn't make this image"), try again, reword the prompt, or try the Hero model.

### Printing the storyboard

**Print storyboard** (or your browser's print command) prints an overview page with the treatment, anchors and timeline, then one scene per page. Choose "Save as PDF" to make a file.

## Production tab

The Production tab shows **one scene at a time**, so you can work through Google Flow without losing your place. Use **← Previous**, **Next →**, the dropdown, or the **← →** arrow keys. The dropdown marks finished scenes with ✓ and shows how many are complete overall.

### Save the video sequence to the Song Spec

The **Save video sequence to Song Spec** panel at the top of the Production tab lists one line per scene, its start time and its clip name, for example `[00:26.00] 03_Verse1A_26-39.mp4`. It writes them to the **Video sequence** section of the Song Spec and changes nothing else in the file.

- **Update shared Song Spec** saves into the copy the GP Song Tools share in this browser. It is available only when that copy exists. If the section was edited by hand, the app asks before replacing it.
- **Download .songspec.md** gives you a file instead. It starts from the spec you opened on the Setup tab this session, otherwise the shared copy, otherwise a new spec.

The buttons are off until the project has scenes.

### Producing a scene in Google Flow

For each scene, in this order:

1. **Download the reference anchors** shown under *Reference anchors*, and attach them to your prompt in Flow as reference images.
2. Click **Copy prompt** on the *Google Flow base prompt* and paste it into Flow. Generate the clip.
3. If the scene has an extension, click **Copy prompt** on the *Extension prompt*, paste it, and extend the clip. **Copy timeline mark** copies a note such as `Extend +4s: 00:24 to 00:28`, the point on the song's timeline the extension must reach.
4. Download the finished clip.
5. Rename it to the **file tag** shown at the bottom (click **Copy file tag**), for example `02_Verse1A_12-28.mp4`. The tag is the scene number, the section, and the start and end seconds, and it is how every later step finds the clip.
6. Tick the boxes in the **Checklist** as you go: *Anchors attached*, *Base clip generated*, *Extension generated* (only for extended scenes), *Downloaded*, *File tag applied*. Ticks are saved with the project.

Google Flow's own screens change, so this guide doesn't describe them; the app only prepares what you paste in.

### When a clip disappoints: revise the scene

Click **Revise scene with Claude**. A panel opens.

- The **Locked** box shows what can never change: the section, the song time, the length and the file tag. This is deliberate, so the ledger stays valid and your clip names stay correct.
- Under **What went wrong?**, describe the problem in plain words ("the singer turned away from camera", "the dolly move is too fast for 12 seconds") and click **Ask Claude to revise**.
- Claude proposes new prompts. You see a **diff**: green is added, red struck through is removed. Nothing is applied yet.
- **Accept revision** applies it; **Discard** throws it away. The scene then shows **Revised ×N**.
- **Undo last revision** puts the previous prompts back, one step at a time.
- Tick **Re-render the storyboard frame after accepting** if you want a new frame from the new keyframe prompt (it needs a Gemini key and costs an image).

Revisions change prompt text only. If Claude hands back the same prompts, the panel says so; try describing the problem more specifically.

## Post: lip-sync files and exports

### Which scenes are lip-sync scenes

Claude marks scenes with a close-up of someone singing as **LIP-SYNC**, with the exact start and end of the sung line. A lip-sync tool redraws the mouth so it matches the words. The Post tab lists those scenes only, each with its file tag, lyrics and framing reminders (keep the singer's face large and unobstructed, no dissolves or whip pans in the shot).

It also warns you when a lip-sync scene overlaps a stretch the Gemini brief marks as *no vocals*, *echo or delay tail* or *backing only*, because the lead may not be singing there.

### Singing stop tags

A lip-sync tool needs to know when singing has **stopped** while the music carries on. A *stop tag* is a bracketed label at a time, written like `[02:41.00] [INSTRUMENTAL]`. The app understands these:

- **INSTRUMENTAL** — the singing has stopped.
- **ECHO** — there's an echo or tail, so the face shouldn't emote.
- **NARRATOR** — an offscreen narrator is speaking, so the on-screen face must not be lip-synced to them.

Where the tags come from:

- **From the Gemini brief** (its *singing stop tags* section). They are drafts. They stay out of every exported file until you listen and tick **I've checked these by ear**. If you change the brief, the tick resets.
- **Your own.** Type a time and a tag and click **Add tag**. Your own tags count as checked.

For a **NARRATOR** tag, a second box, **Until**, appears. A narrator's words are usually lines in your `.lrc`, so the app needs to know where the narration ends; those lines are removed from the lip-sync lyrics file. If the Gemini vocal map marks stretches as *spoken*, the app offers each one as a one-click **Add … as NARRATOR** button. Check these: spoken lines can also be on-screen characters talking.

### The two text files

- **lipsync-handoff.txt** — for you. Each lip-sync scene with its file tag, times, vocal window, lyric block and framing reminders.
- **lyrics-for-lipsync.txt** — for the lip-sync tool. The whole song in `.lrc` style: a timed line counts as singing, a bracketed tag counts as no singing.

Two settings above the lyrics file control how it is written:

- **Backing vocals.** A lip-sync tool redraws one face per shot, so it can't give a second singer their own mouth; leaving backing lines in would make the lead mouth them. The default replaces a run of backing lines with one no-singing tag. You can instead leave them out, or keep them as sung lines.
- **Narrator and backing tag spelling.** The tags the app makes itself are written as `[INSTRUMENTAL]` by default, because that is the tag a typical lip-sync tool already understands. You can write them as `[INSTRUMENTAL NARRATOR]` or as `[NARRATOR]` / `[BACKING]` if your tool knows those names. Tags you type yourself (such as ECHO) are always written as typed.

Whatever your lip-sync tool is, check one run: confirm it really stops lip-syncing at the tags and skips the narrator's stretch.

### Exports and backups

- **Download export bundle (.zip)** — for handing files over: `anchors/`, `keyframes/` (named by file tag), `ledger.json`, `ledger.md` (a readable ledger) and both text files.
- **Export whole project (.zip)** — for backup or moving to another browser: everything, including every image version, checklists and revisions. On the project list, **Import project…** restores one as a **new** project (it never overwrites anything). It does not include your audio or your API keys.

## Assembling your video

Outside the app: save your finished, correctly named clips to Google Drive or a folder, and put them in a video editor in order, over your song's audio. The file tags sort alphabetically into scene order. If you use a lip-sync tool, run it on the assembled video with `lyrics-for-lipsync.txt`.

## Your projects

The project list (click the app's name, top left) lets you **New project**, **Rename**, **Duplicate**, **Export** and **Delete**, and **Import project…**. Open a project by clicking its name; the dropdown at the top of a project switches between projects and keeps you on the same tab.

**Where your data lives.** Projects (text, scenes, images) are stored in this browser's IndexedDB, on this computer. There is no account and no server, so:

- **Clearing site data, using a private window or switching browsers loses your projects.** Use **Export whole project** regularly.
- Settings shows how much storage you are using and offers **Request persistent storage**, which asks the browser not to delete your projects when disk space runs low.
- Two browsers or two computers don't share projects. Move one with export and import.

## Settings reference

Open **Settings** from the top right.

- **API keys:** your Anthropic and Gemini keys, with **Forget keys** to remove both. See the safety section below.
- **Claude model and reasoning effort:** the model that writes the plan, and how much it thinks. Higher effort costs more and takes longer; "Model default" sends nothing and uses the model's own default.
- **Gemini image models:** three roles. *Workhorse* is the everyday model for anchors and frames, *Hero* is for the best quality and strict continuity, *Draft* is quick and cheap. The names are just suggestions: use **Test key & list models** to see which models your key can use, assign one to each role, and click **Test** next to a role to render a real test image on your account.
- **Audio brief model:** the Gemini model that listens to your song. It must accept audio and reply with text.
- **Max reference anchors per scene keyframe:** how many anchor images are sent with each storyboard frame (1 to 6, default 3).
- **Storage:** usage, and a request for persistent storage.

## Keys, privacy and safety

### What is sent where

| What | Goes to | When |
| --- | --- | --- |
| Your lyrics, vision text, the audio brief, scene prompts | Anthropic (Claude) | Generating or fixing a blueprint, revising a scene |
| Image prompts and the anchor images used as references | Google (Gemini) | Generating anchors and frames |
| Your song's audio file | Google (Gemini) | Only if you click **Generate with Gemini** |
| Nothing | Anywhere else | The app has no server, no analytics and no account |

The app's security policy blocks connections to any other address.

### Your API keys

- Keys are stored in this browser's `localStorage` **in plain text**, and sent only to Anthropic and Google, directly from your browser.
- On GitHub Pages, `localStorage` is shared by every page on the same `github.io` address. Another page on that address could read it. If that worries you, host the app on its own domain, or run it locally.
- **Never** paste a key into a project field, an issue, a chat or a screenshot, and never commit one to a repository. Exports and backups never contain keys.
- On a shared or public computer, don't enter keys, or use **Forget keys** when you finish.

### Limit the damage if a key leaks

- Give the app **its own** keys, not the ones you use for anything else.
- Set a **spending limit** with each provider, and check usage now and then.
- For Google, restrict the key in the Google Cloud console to the Generative Language API and, if you can, to your site's address.
- If you suspect a key has leaked, **delete it at the provider and make a new one**, then use **Forget keys** here.

### Cost

Claude and Gemini charge for what you use: generating a blueprint, every image, and the audio brief. The app asks you to confirm before batches of images, and shows a count of images made this session. Use **Draft mode** and lower effort while you experiment. The app can't tell you prices; check your providers' pages.

## Troubleshooting

### Blueprint and Claude

- **"Anthropic rejected the API key" (401):** the key is wrong, expired or not pasted completely. Re-enter it in Settings.
- **Rate limited (429) or overloaded (529):** the app retries a few times by itself. If it still fails, wait a minute and try again.
- **"ran out of output space":** the plan didn't fit. Try again, or lower the effort.
- **Claude replied with text instead of a blueprint:** the app retries once automatically. If it still happens, click **Generate blueprint** again.
- **Red errors after generating:** see [Validation](#validation-red-and-amber-messages).
- **The page reloaded during a generation:** start it again; the request can't be resumed.

### Images (Gemini)

- **"Gemini doesn't know the model …":** the model name isn't one your key can use. Open Settings, click **Test key & list models** and pick a listed one.
- **"wouldn't make this image":** a safety filter. Try again, reword the prompt, or try the Hero model.
- **"not 16:9":** the model returned another shape. Regenerate, or crop it yourself and upload it.
- **Rate limit or quota:** wait, or check your Google AI quota.

### Audio brief

- **Button disabled:** it needs a Gemini key and a song loaded under **Local audio** (re-add it after a reload).
- **"too large":** the limit for sending directly is about 14 MB. Export a smaller file, such as a 128 kbps MP3, or use the manual route.
- **Model not found:** change the **Audio brief model** in Settings.

### Projects and storage

- **My projects are gone:** the browser's site data was cleared, or you are in a different browser or a private window. Restore from an export.
- **My keys disappeared:** browser storage is blocked or you used a private window. Settings shows a warning when storage is blocked.
- **Import says "damaged or from a newer version":** the file isn't a project export from this app, or it was edited. Re-export from the original.
- **Import says "export bundle can't be imported":** that file is the handover bundle. Use **Export whole project** for backups.

### The site itself

- **A blank page, or the browser console shows a 404 for `main.tsx`:** GitHub Pages is serving the source instead of the built site. In the repository's *Settings → Pages*, set **Source** to **GitHub Actions**.
- **Deep links or reloads show "not found":** open the app from its main address; it uses `#` addresses so reloads work.

## Glossary

- **Anchor:** a reference image that keeps something consistent across the video (the character, a place, a prop).
- **Base clip:** the main Google Flow clip of a scene, 10 to 15 seconds.
- **Extension:** an optional extra 3 or 4 seconds added to a base clip, only for a special requirement.
- **Ledger:** the list of scenes with their times, lengths and prompts. "Valid" means no gaps or overlaps and legal lengths.
- **Keyframe / storyboard frame:** one still picture that represents a scene, made from the keyframe prompt.
- **File tag:** the name every clip must have, like `02_Verse1A_12-28.mp4` (scene, section, start and end seconds). It never changes.
- **LIP-SYNC scene:** a scene with a close-up of someone singing, which gets a lip-sync pass afterwards.
- **Stop tag:** a bracketed label at a time that marks where singing stops (INSTRUMENTAL), an echo (ECHO) or an offscreen narrator (NARRATOR).
- **Backing vocal:** a lyric line wholly in parentheses; the lead singer shouldn't mouth it.
- **Workhorse / Hero / Draft:** the three image-model roles: everyday, best quality, and quick and cheap.
- **Effort:** how much thinking Claude does. Higher is slower and costs more.
- **Needs review:** a scene whose length changed after its prompts were written.

## Frequently asked questions

**Do I need the Gemini key?** No. Without it you can still write the whole plan and make the clips; you just won't get the in-app images or the automatic audio brief. You can use the copy-paste route for the brief, and generate images elsewhere and upload them.

**Can I edit the prompts myself?** Revise with Claude changes prompts for you. The prompts are plain text you copy into Flow, so you can also change them there; the app doesn't need to know.

**Why can't I change a scene's length or timing?** Timing is locked so the ledger stays valid and your clip names stay correct. To change the cut, regenerate the blueprint, or use **Snap boundaries** to repair small mismatches.

**Does the app upload my song?** Only if you click **Generate with Gemini**. Otherwise the audio stays in your browser tab.

**Can two people work on one project?** No. Each browser has its own copy. Move a project with export and import.

**What if I close the tab mid-way?** Everything you have done is saved except a request that was still running and the loaded audio file.
