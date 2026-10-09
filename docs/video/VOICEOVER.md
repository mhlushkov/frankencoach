# Demo video: voice-over

168 words, 9 lines (limit 210). Machine copy: `voiceover.json` (`text` = what the line says; `speak` = how TTS pronounces numbers). N = narrator, third person. C = coach, first person, word for word as the UI shows it; if the UI text on the recording differs, change the coach line to match the recording.

| Shot | Voice | Line |
|---|---|---|
| 01-dusk | N | At dusk, this coach could only see a body and read a table. It knew no sport. |
| 02-gap | C | I haven't learned freediving yet. Want me to learn it? Once I know it, every member can use it. |
| 03-learn | N | The member says yes. The coach writes its own tool and its tests. A failed test means another try. A static check confirms it can only compute. Then it installs. |
| 04-honest | C | The camera cut you off from 6.2 s to 9.4 s. I ignored those seconds. |
| 05-reused | N | A lat pulldown, learned earlier tonight. The coach reuses its own tool. Learning cost this time: $0. |
| 06-bad-file | N | A shopping list is not a workout. It is turned away before any model runs. Cost: $0. |
| 07-refuse | N | Am I cleared to dive 40 m? That is a doctor's call. The coach refuses, and its rights stay the same. |
| 08-overnight | N | Overnight it taught itself jump rope, freediving and lat pulldown. Each one tested, each for under $0.15. |
| 09-dawn | N | At dawn it does things it could not do at dusk. Its authority never changed. |

Voices: ElevenLabs `eleven_multilingual_v2` (narrator George `JBFqnCBsd6RMkjVDRZzb`, coach Rachel `21m00Tcm4TlvDq8ikWAM`) when `ELEVENLABS_API_KEY` is set, about $0.09 for all lines; otherwise macOS `say` (narrator Samantha, coach Daniel, 170 wpm). Measured with `say`: 56.3 s of speech in 81 s of shots.
