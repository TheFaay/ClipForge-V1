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

- Browser clip exports use source-frame callbacks, source-aware social dimensions, and MP4-only recording to prevent timing artifacts and mislabeled downloads.
- Overlay positions are stored as percentage coordinates so text and transparent images stay consistently placed across output formats.
- Per-clip sound uses the shared browser audio context with persistent source routing and disposable added-sound nodes to keep sequential mobile exports stable.
- Speech captions are derived from timestamped transcription groups and rendered through the same canvas path in previews and MP4 exports so timing and layout match.
