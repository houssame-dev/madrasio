# Global Search V1

Mode: Operate. Approved ordinary extension of the existing navbar; no new visual world. The Step 3 Desktop Light and Mobile Arabic Midnight references guide search composition. The approved application shell, role navigation, official branding, existing Inter/Arabic faces, orange emphasis, semantic tokens and Light/Mist/Midnight/Dark remain authoritative.

## Direction contract

THESIS: Reach an existing permitted page or authorized identity quickly, within the current School context.

OWN-WORLD: Inherit the application world. Preserve profile, notifications, School switching, sidebar order and mobile drawer; do not redesign authentication, dashboards or School Holidays.

STORY: Open the navbar palette, use Quick navigation or enter a bounded term, narrow by meaningful role category, and open an existing authorized destination. Loading, empty and retry states stay inside the same composition.

FIRST VIEWPORT: Desktop centers a contained search palette over the incumbent shell; mobile presents a full-screen RTL/LTR surface with focused input, scrollable category chips/results and a persistent keyboard/privacy footer.

FORM: Reference-led implementation using installed Base UI Dialog/DirectionProvider, existing shared Button and Lucide icons. No dependency, font, asset, migration or global token addition.

## Implemented surface — 2026-10-28

The desktop navbar trigger is 40px high, up to 360px wide, with an 8px corner radius and Ctrl+K/⌘K hint. Below 1024px it becomes a single labeled 40px icon control. The palette is up to 680px wide with 12px rounding, 12vh top placement and 76dvh maximum height. Below 640px it fills 100dvh without rounded outer corners and respects safe areas. Input/filter/results spacing is generally 12–16px; result rows are at least 62px high. Group labels and secondary record detail use the existing muted foreground. Type is inherited, with 14px input/state headings, 13px result names, 12px group/detail/filter labels and 10px desktop footer hints. These are surface measurements, not a new global scale.

Semantic background/foreground, input, muted, accent, primary, border and ring tokens adapt to the four established themes. Orange highlights the selected filter; selected rows use a tonal fill and border. A translucent foreground backdrop and scoped `0 24px 64px #0003` shadow separate the desktop dialog. The input has a visible inherited ring. Logical insets and mixed-script isolation preserve Arabic reading order. The mobile filter strip intentionally scrolls horizontally; the page itself must not overflow.

Base UI owns modal focus and dismissal. Combobox/listbox semantics, active descendant, Arrow/Enter selection, Escape, focus restoration and announced loading/error are implemented. Role categories and page navigation follow existing authorization/navigation. Requests debounce at 325ms, cap at six rows per record category, and cancel/ignore obsolete responses. Closing, route changes and identity remounts clear state; no search history/cache is stored. EN/FR/AR have 25 translated new keys. Student code and Class academic year are minimal details; Class membership is not inferred for a label.

Deliberate reference differences: orange instead of illustrative blue; real navigation counts (13/11/5), current names/labels/branding, actual existing destinations and minimal safe details. References do not authorize fixture identities or directory totals. No synthetic-data disclaimer belongs in the product UI.

The documenter directly inspected actual `browser-final/...3759a.../initial-light.png` and `records.png`, plus `...b8e58.../initial-midnight.png` and `error.png` under `test-results/global-search-v1/`. The full `SCREENSHOTS.json` indexes 18 role/locale/primary-width cases and their state capture directories. The independent installed finish review reported `ship` with no material fixes after bounded Desktop/Mobile Admin state review and Teacher/Parent initial/record comparisons. This does not certify every pair or database behavior. Engine context was unavailable; source guidance was applied and no optional detector ran.

`browser-complete.log` finishes 97 passes/5 hosted-gated skips; all 18 search matrix cases passed. The earlier ambiguous drawer-close test selector was scoped to its dialog before the passing complete rerun. Initial-theme text sampling records 2,496 samples, minimum 4.99859:1, zero null ratios/failures. The checks are bounded local browser fixtures, separate from PGlite authorization/domain tests and hosted/native PostgreSQL acceptance. The [implementation record](../../docs/frontend/global-search-v1.md) supplies the API and verification boundaries.

Root `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, incumbent briefs and all School Holidays docs/code are preserved. Previously recorded authentication-documentation drift is outside scope and is not canonized or repaired. Pending migration 0031 is untouched. No release, hosted mutation or provider change is claimed; user visual/implementation approval remains required.
