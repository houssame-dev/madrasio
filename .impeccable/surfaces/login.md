# Login

Mode: **Operate**. Product truth: `PRD.md`. Visual source: `C:/Users/Ultrapc/Downloads/Madrasio Authentication UI Showcase.png`. Implementation: `apps/web/app/authentication.css` and `apps/web/components/auth/login-form.tsx`.

The supplied reference pins this surface's visual direction. This document records implementation choices; it does not assert final verification or review approval.

Desktop uses a shell capped at 1052px, minimum height 614px, padding 40px 44px 28px 88px, and two columns (`minmax(0, 1fr) 356px`) separated by 90px. Welcome copy and three benefit rows sit beside the form. At widths 701–1000px, page padding becomes 24px, shell inline padding 32px, gap 40px, form column 340px, and welcome type 42px.

At 700px and below, the page becomes one column capped at 360px, with page padding 36px 32px 24px. The logo is centered (180×54px), welcome type becomes 32px, desktop benefit copy and the duplicate form heading are hidden, and controls grow from 36px to 44px. The card background becomes transparent; fields adopt their page background. Midnight mobile uses reversed field text and lighter borders/icons, while desktop Midnight retains a white card. Dark desktop uses a dark card, transitioning to black fields on mobile.

Intentional reference differences preserve a working product: no remember-me checkbox is shown because it has no behavior contract; password visibility toggles the actual field and accessibility state; recovery opens `/auth/recover`; language/theme preferences are working selectors. English, French, and Arabic copy may wrap differently from the reference. Arabic uses Noto Sans Arabic with relaxed heading tracking/line-height, logical spacing, an unmirrored wordmark, and LTR email entry.

Theme preference remains persisted under `madrasio-theme`. Explicit Light, Mist, Midnight, and Dark preferences resolve through document `data-theme`; legacy System remains available and resolves to Light or Midnight according to the OS. Global application chrome was not redesigned.

Sign-in continues through the existing password-authentication submission, validation, feedback, account transition, cache clearing, and dashboard navigation flow. Review and verification are tracked by the implementation task, not this visual reference.
