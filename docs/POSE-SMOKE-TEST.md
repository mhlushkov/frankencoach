# Pose gate smoke test (A14 step 5 / A17)

`bun server/gate/smoke.ts data/landmarks/*.json data/synthetic/fixtures/*.landmarks.json`

Thresholds (`contracts/gate-thresholds.json`): `maxJitter 0.15`, `maxBoneNoiseCv 0.08`, `minMeanVisibility 0.5`, `minPersonFrameRatio 0.6`, `minMotionEnergy 0.02`.

| file | verdict | reason | frames | fps | person | vis | motion | jitter raw | jitter sm | bone CV | noise raw | noise sm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| squat-gym.json | ok |  | 133 | 10 | 1.000 | 0.832 | 0.613 | 0.013 | 0.014 | 0.163 | 0.032 | 0.017 |
| freedive.landmarks.json | ok |  | 60 | 10 | 1.000 | 0.902 | 0.163 | 0.073 | 0.081 | 0.000 | 0.000 | 0.000 |
| garbage.landmarks.json | reject | low_confidence | 40 | 10 | 1.000 | 0.497 | 0.995 | 0.178 | 0.538 | 0.548 | 0.000 | 0.000 |
| jitter.landmarks.json | ok (smoothed) |  | 40 | 10 | 1.000 | 0.902 | 0.055 | 0.005 | 0.003 | 0.092 | 0.117 | 0.045 |
| lowVisibility.landmarks.json | reject | low_confidence | 40 | 10 | 1.000 | 0.302 | 0.239 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| noHuman.landmarks.json | reject | no_human | 40 | 10 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| running.landmarks.json | ok |  | 40 | 10 | 1.000 | 0.902 | 0.186 | 0.088 | 0.084 | 0.000 | 0.000 | 0.072 |
| squat.landmarks.json | ok |  | 40 | 10 | 1.000 | 0.902 | 0.239 | 0.008 | 0.010 | 0.000 | 0.000 | 0.000 |
| static.landmarks.json | reject | no_motion | 40 | 10 | 1.000 | 0.902 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |

## Columns
- **jitter**: mean |Δ per-step displacement| of points with visibility ≥ 0.5, in units of the person's bounding-box height in that frame (scale-free: a far-away person is not "shakier"). `sm` = after a centered 3-frame median.
- **bone CV**: whole-clip coefficient of variation of 2D limb lengths (median over 10 bones). Reported only: it counts real foreshortening (a thigh shortens at the bottom of a front-view squat) as spread. That is why squat-gym was rejected at 0.163.
- **noise**: per bone, RMS(length − centered 3-frame median of length) / mean length, median over bones. Only frame-to-frame noise. A bone is skipped in a frame when either end has visibility < 0.5.

## Reading
- The real gym squat passes on raw data (noise 0.032). Smoothing is not needed.
- When only stability fails, the gate retries once on the median-smoothed clip. If that passes, it returns `ok` with the smoothed landmarks and `stats.smoothed: true`.
- `jitter.landmarks.json` (iid ±0.03 noise on a standing pose) drops from 0.117 to 0.045 after smoothing, so at 0.08 it **heals and passes**. Before A17 it was rejected as `unstable`. Keeping it a reject would need `maxBoneNoiseCv` between 0.032 (real squat) and 0.045 (smoothed jitter), for example 0.04. That margin is thin with one real clip, so 0.08 stays for now. Recalibrate when more real clips land in `data/landmarks/`.
- garbage (`low_confidence`), noHuman (`no_human`), static (`no_motion`) and lowVisibility (`low_confidence`) keep their pre-A17 reasons. Garbage with visibility forced to 1 is still `unstable` after smoothing (noise 0.29).
- Raw `noise` is 0 for garbage at visibility 0.5 because almost no bone has three consecutive confident frames. Visibility catches that clip first.
