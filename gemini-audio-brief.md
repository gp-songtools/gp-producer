# Gemini audio brief prompt

Give the user everything inside the code block below, unchanged. They attach the song in the Gemini app, paste the prompt with their lyrics filled in, and paste Gemini's answer back here.

```text
Listen to the attached song from start to finish and write an audio brief for a music video director. Base everything only on what you hear. Describe the sound, and don't suggest visuals. Use MM:SS timestamps. If you're unsure about something, put "?" after it rather than guessing confidently. Don't estimate any detail you can't hear.

These are my timed lyrics, if provided. Use them to locate the words, and don't change them:
[PASTE LYRICS HERE, OR WRITE "NONE"]

Return your whole answer as one Markdown code block, using exactly these headings.

# SONG OVERVIEW
- Total length:
- Approximate tempo (BPM):
- Genre and overall sound:
- Overall emotional arc, in 2-3 sentences:

# SECTION MAP
Cover the whole song from 00:00 to the final sound, with no gaps.
| Start | End | Section | Energy 1-10 | Instruments present | Vocal delivery | Mood |

# KEY MOMENTS
List every moment an editor should cut or change the picture on: drops, stops, builds, big drum hits, instruments entering or leaving, sudden changes in sound or texture such as a telephone filter.
| Time | What happens | Strength: small, medium or big |

# VOCAL MAP
Cover the whole song with no gaps. Use one of these for Type: LEAD SINGING, LEAD + BACKING, BACKING ONLY, ECHO OR DELAY TAIL, SPOKEN, NO VOCALS.
| Start | End | Type | Words or description |

# SINGING STOP TAGS
Using the vocal map, list each moment the lead singer's own singing stops while the song continues, including echoes and instrumental breaks. Use exactly this format, one per line, with a short tag in square brackets:
[MM:SS.00] [ECHO]
[MM:SS.00] [INSTRUMENTAL]

# TIMING NOTES
List any places where my lyric timestamps don't seem to match what you hear, and anything you were unsure about.
```

## Using the answer

- The user's `.lrc` or section guide remains the authority for lyric timing. Gemini's timestamps can be a few seconds off, so if the two disagree, point out the difference and ask the user which to trust.
- Use the section map, energy, instruments and vocal delivery to shape pacing, camera language and color progression.
- Prefer key moments for scene boundaries and action only where they fit the 10–14 second scene rule and the timestamps agree with the user's guide.
- Use the vocal map to decide which scenes need on-screen singing. Don't put close-up singing over `ECHO OR DELAY TAIL` or `NO VOCALS` stretches. Flag `BACKING ONLY` stretches, since the lead shouldn't be mouthing those.
- Treat singing stop tags as drafts. Ask the user to check them by ear before they go into the lip-sync handoff sheet.
