# Components and states

| Component | Anatomy | States | Code |
|---|---|---|---|
| Top bar | Logo, name, tagline or crumb, plan badge, avatar, name | member / owner | `web/src/ui/Header.tsx` |
| Your workout | Drop zone; video + skeleton overlay; chart; table preview; rejection card | waiting, watching, learning, done, can't use | `ui/coach/Workout.tsx`, `VideoStage.tsx`, `Chart.tsx` |
| Coach conversation | Word tag + one plain sentence per step | green good, amber learning, red sorry | `ui/coach/Conversation.tsx` |
| Ask to learn | One sentence, Yes / Not now (no price) | waiting, you said yes, declined | `Conversation.tsx` |
| Coach answer | Up to four metrics, advice in a speech bubble | problems in red | `Conversation.tsx` |
| Sports we know | One card per sport, name + status | Ready, Learning now, New today (glows) | `ui/coach/SportsFooter.tsx` |
| History sidebar | New chat, chats grouped by day, About you | empty, populated | `ui/coach/CoachScreen.tsx` |
| Auth | Sign in / create account tabs | sign in, step 1 of 3 | `ui/pages/AuthPage.tsx` |
| About you | Body fields + "How I use this" | form | `ui/pages/BodyPage.tsx` |
| Account | Body rows with usage, profile, plan, recent chats | - | `ui/pages/AccountPage.tsx` |
| Owner dashboard | KPIs, members table, sports learned | search, add member, view history | `ui/pages/OwnerPage.tsx` |

Lab-note tags: Hi, You, Watching, Got it, Question, Learning, Learned, Coach, Sorry, Welcome.
