<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Spark Studio uses the Control Center session and owner-scoped project/audio storage; Yoto publishing uses authenticated server functions so each project saves to its owner's linked account.
- Keep Yoto credentials encrypted and server-only; account migration uses Cloud's supported database export, never custom password or token dumps.
- Spark Studio's wait-for-button mode uses the persisted auto-advance and loop flags, shared through studio-flow helpers; do not introduce a competing playback-mode field.
- Apply database schema through the managed Drizzle migration journal; older SQL files under supabase/migrations are historical references, not a second migration queue, to avoid duplicate policies.
- Transcription uses the shared segment duration and pricing helpers on both sides; persist exact clip boundaries so grouping remains accurate for new and legacy audio.
- Use the typed AI Gateway SDK for transcription; preserve the selected model and completion validation to avoid changing quality when adjusting app credits.
