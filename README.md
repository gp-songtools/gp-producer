# Music Video Director

A browser app that helps you plan and produce an AI-generated music video for a song. You give it timed lyrics, the song's length and your idea of the look; Claude writes a director's treatment, a set of reference images to draw and a scene-by-scene ledger with prompts for Google Flow; Gemini can draw the reference images and storyboard frames; and the app walks you through the clips one scene at a time and prepares the files for a lip-sync step.

**It does not generate the video itself.** You make the clips in Google Flow, then assemble them in a video editor.

Everything runs in your browser: there is no server, no account and no analytics. Your projects are stored on your own computer.

## Using it

**Start with the guide:** [docs/USER_GUIDE.md](docs/USER_GUIDE.md). It is also built into the app: click **Help** in the top bar (or **? Help for this tab**), where it has a contents list and search.

The short version:

1. Add your API keys in **Settings** (read [Keys and safety](#keys-and-safety) first).
2. **Setup:** your `.lrc` lyrics, the song's runtime, your vision, and optionally a Gemini audio brief.
3. **Blueprint:** Claude writes the plan. Optionally draw the anchor images and storyboard frames.
4. **Production:** one scene at a time, copy each prompt into Google Flow, download and name each clip, tick the checklist.
5. **Post:** lip-sync files and exports.

You need:

- Timed lyrics as an `.lrc` file, and the song's total length.
- An **Anthropic API key** (required).
- A **Gemini API key** (optional: images and the audio brief).
- Access to Google Flow, and a video editor.

## Keys and safety

The app calls Anthropic and Google **directly from your browser** with your own API keys. That is simple and private (no middleman), but it means you should know the following:

- **Keys are kept in your browser's `localStorage`, in plain text.** They are sent only to `api.anthropic.com` and `generativelanguage.googleapis.com`. The built site's Content-Security-Policy blocks connections to any other address.
- **On GitHub Pages, `localStorage` is shared by every site on the same `github.io` origin.** Another page there could read it. If that matters to you, serve the app from your own domain, or run it locally.
- **Use keys made just for this app,** set a **spending limit** with each provider, and for Google restrict the key to the Generative Language API (and to your site's address, if you can).
- **Never commit a key**, paste one into a project field, an issue or a screenshot. The repo, the build and the workflow contain no secrets; `.env*` files are ignored.
- **Exports and backups never contain keys,** and never contain the audio file.
- **On a shared computer,** don't enter keys, or use **Settings → Forget keys** afterwards.
- **If a key may have leaked,** delete it at the provider and make a new one.

What leaves your computer, and when:

| What | Goes to | When |
| --- | --- | --- |
| Lyrics, vision text, audio brief, scene prompts | Anthropic | Generating or fixing a blueprint, revising a scene |
| Image prompts and reference images | Google (Gemini) | Generating anchors and frames |
| The song's audio file | Google (Gemini) | Only when you click **Generate with Gemini** in the audio brief |

Claude and Gemini charge for use. The app asks before batches of images and counts images made per session, but it cannot show prices; check your provider's pages.

## Your data

Projects (text, scenes, images, checklists, revisions) live in your browser's IndexedDB. Clearing site data, a private window or a different browser means no projects. **Back up with Export** (project list, or the Post tab); **Import project…** restores a backup as a new project.

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.

**One-time setting:** in the repository, *Settings → Pages → Build and deployment → Source*, choose **GitHub Actions**. If this is left on "Deploy from a branch", GitHub serves the raw source and the site shows a blank page with a 404 for `main.tsx`.

The workflow sets `VITE_BASE` to `/<repository-name>/`, so renames and forks work. For a custom domain, build with `VITE_BASE=/` (the default).

## Developing

Requires Node 22.

```bash
npm ci          # install
npm run dev     # local dev server
npm test        # unit tests (vitest)
npm run build   # typecheck and production build into dist/
npm run preview # serve the production build locally
```

The production build adds a Content-Security-Policy `<meta>` tag (the dev server skips it so hot reload works).

### Where things are

```
docs/USER_GUIDE.md      the user guide (also rendered in the app's Help)
PLAN.md                 the design: data model, prompts, milestones
SKILL.md                the director rules the prompts are built from
gemini-audio-brief.md   the audio-brief prompt shown in Setup
src/
  pages/                one page per tab, plus Help and the project list
  components/           setup/, blueprint/, production/, post/, help/, layout/, ui/
  lib/                  ledger rules and validation, API clients (api/), export/, import, db
  prompts/              what is sent to Claude
  schemas/              tool and archive schemas (zod)
  store/                zustand stores (project, images, settings, audio)
```

Two guards keep the guide honest: tests fail if a section the app links to is missing, if an in-guide link is broken, or if a button the guide names no longer exists in the code. When you rename a control, update the guide.

## Known limitations

- Lyrics must be `.lrc`. SRT, VTT and JSON transcripts need converting first.
- Gemini model names in Settings are suggestions. Use **Test key & list models** to see what your key can use.
- The in-app audio brief sends the song inline, so files over about 14 MB need a smaller export or the manual route.
- The layout is built for a desktop browser; a mobile pass and a full accessibility review are still to do.
- One person per project: there is no sync between browsers (use export and import).
