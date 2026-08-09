## Rules

- All `process.env.*` must be centralized in `config.ts` file.
- Don't use system icons, use SVG.
- **All interactive elements must use `cursor-pointer`.** This applies to every `<button>`, `<a>`, and any element wired to `onClick`/role="button". Add `cursor-pointer` to its className (or to the base styles of a shared UI component) — never rely on browser defaults.
- Disabled buttons should keep their pointer style aligned with their disabled visual (e.g. `disabled:cursor-not-allowed`) rather than dropping `cursor-pointer` conditionally.
