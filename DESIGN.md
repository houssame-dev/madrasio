---
name: Madrasio Authentication
description: Reference-led authentication surfaces for a multilingual school management platform.
colors:
  auth-orange: "#ff9d0b"
  auth-orange-end: "#ffa810"
  auth-orange-hover: "#ffb332"
  auth-orange-text: "#a84e00"
  auth-orange-text-reverse: "#ffad32"
  auth-white: "#fff"
  auth-mist: "#e5e5e5"
  auth-midnight: "#14213d"
  auth-black: "#000"
  auth-dark-card: "#121212"
  auth-ink: "#080d19"
  auth-muted: "#526786"
  auth-muted-reverse: "#c4c9d2"
  auth-line: "#8895a7"
  auth-line-dark: "#777"
typography:
  display:
    fontFamily: "'Madrasio Inter', 'Madrasio Arabic', sans-serif"
    fontSize: "50px"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  title:
    fontFamily: "'Madrasio Inter', 'Madrasio Arabic', sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "'Madrasio Inter', 'Madrasio Arabic', sans-serif"
    fontSize: "13px"
    lineHeight: 1.45
  label:
    fontFamily: "'Madrasio Inter', 'Madrasio Arabic', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  field: "5px"
  action: "8px"
  card: "12px"
  shell: "16px"
spacing:
  field-gap: "12px"
  mobile-field-gap: "14px"
  benefit-gap: "24px"
components:
  auth-submit:
    backgroundColor: "linear-gradient(105deg, #ff9d0b, #ffa810)"
    textColor: "{colors.auth-ink}"
    rounded: "{rounded.action}"
    height: "43px"
    width: "100%"
  auth-submit-hover:
    backgroundColor: "{colors.auth-orange-hover}"
  auth-field:
    backgroundColor: "{colors.auth-white}"
    textColor: "{colors.auth-ink}"
    rounded: "{rounded.field}"
    height: "36px"
    width: "100%"
  auth-card:
    backgroundColor: "{colors.auth-white}"
    textColor: "{colors.auth-ink}"
    rounded: "{rounded.card}"
    padding: "28px 30px 30px"
---

# Design System: Madrasio Authentication

## Overview

This captures the implemented authentication visual language derived from the supplied **Madrasio Authentication UI Showcase**. It is a scoped reference for authentication work, not a redesign contract for dashboard navigation or application chrome. Product requirements remain in `PRD.md`.

The reference establishes a welcoming school identity, orange action emphasis, restrained decoration, and four distinct backgrounds. The official logo assets remain binding. Surface composition and intentional differences from the showcase are recorded in `.impeccable/surfaces/login.md`.

Key characteristics: clear form hierarchy, gently rounded controls, the official wordmark selected by authentication theme, and equal support for English, French, and Arabic.

## Colors

### Primary

Authentication orange anchors the primary action, benefit illustrations, and subtle background decoration. The action uses the orange-to-orange-end gradient and a solid orange-hover state. Text links use orange-text on light surfaces and orange-text-reverse on dark surfaces for legibility.

### Neutral

White, Mist, Midnight, and Black are separate authentication page backgrounds. White and Mist use ink text; Midnight and Dark reverse the welcome text. Desktop Midnight retains a white form card; desktop Dark uses dark-card. Muted and line tokens follow the card context, independently of application chrome.

**The Surface Scope Rule.** Authentication tokens must remain scoped to authentication. Theme compatibility does not authorize restyling the rest of the product.

Authentication contrast uses a separate Mist muted-text value (`#4d617e`) from its boundary token (`#788394`). Desktop Midnight secondary text, placeholders and functional icons use its existing `#8190a7` muted token on the navy card; return links use the established reversed link blue (`#a6c8f7`), and focus rings use the existing orange ring token. These corrections leave all four page backgrounds, type, dimensions, action fills and brand assets unchanged.

Desktop Midnight recovery/password validation reuses the existing reversed danger-text token, and recovery confirmation uses card foreground. Auth selectors/actions must retain the shared keyboard ring shadows even when their normal-state shadow is removed.

## Typography

Inter is self-hosted as `Madrasio Inter`; Noto Sans Arabic is self-hosted as `Madrasio Arabic`. Both load with `font-display: swap` and explicit static faces at weights 400, 500, 600, 700, and 800. Arabic puts its own family first, removes tightened heading tracking, and increases heading line-height for script clearance.

The display role introduces the product, the title role introduces the form, and compact body and label roles support operation. Welcome supporting copy uses a larger size (16px). Mobile controls use readable input text (16px); Arabic labels use a larger size (13px).

Authentication deliberately has two approved densities: compact Login and expanded Recovery/Password (including unavailable-link states). Desktop hero sizes remain 50px and 56px respectively; form headings remain 21px and 24px. Mobile headings retain their surface-specific sizes and Arabic leading/tracking overrides. The explicit 800 hero weight matches the installed static face previously selected for 750.

Shared operational typography uses 1.5 line-height for input/select text (desktop 12px/18px compact, 14px/21px expanded; mobile 16px/24px), 20px line-height for primary actions, 13px/19.5px for assistance and validation, and 14px/23.1px for status prose. These rules are authentication-scoped; application controls and page geometry are unchanged.

## Layout

Authentication uses a centered full-height canvas. Its desktop shell has two columns, restrained soft decoration, and a form card. At the mobile breakpoint, it becomes a narrow single column with a centered logo and direct form controls; decorative and duplicate explanatory content disappear. Exact composition is surface-specific and lives in the login brief.

Spacing is compact within forms and more generous between benefit statements. Use logical inline spacing for LTR/RTL. Keep the official wordmark unmirrored; email entry remains LTR even in an RTL page.

## Elevation & Depth

Desktop shell and card use soft navy-tinted shadows. A faint orange diagonal, dotted motif, and curved wash add depth without competing with controls. Mobile removes those effects and the card shadow. Shadow values and breakpoints are in the sidecar.

## Shapes

Fields use the smallest radius, primary actions a slightly softer radius, and cards and the desktop shell larger rounding. Benefit icons sit on rounded orange-tinted tiles. Mobile removes the outer shell/card silhouette while retaining field and action rounding.

## Components

Primary actions use dark text on orange, a bold label (14px/700), and a solid hover fill. Submission has a spinner, disabled state, and announced status. Preserve visible keyboard focus from the shared focus treatment; the card supplies context-appropriate ring and offset colors.

Fields and preference selectors share borders, card background, leading icons, and compact labels. The password visibility action has an accessible changing label and pressed state. Invalid fields retain semantic error associations. The recovery link opens the existing recovery route.

Authentication uses the unchanged official wordmark-colored asset in Light and Mist, and wordmark-white in Midnight and Dark. Do not overlay, clip, recolor or combine these assets. Application/sidebar branding remains outside this authentication rule.

## Do's and Don'ts

- Do preserve the four background identities and theme persistence contract (`madrasio-theme`, document `data-theme`, and System compatibility).
- Do carry English, French, and Arabic copy through localization and allow translated content to grow.
- Do preserve authentication, recovery, validation, loading, and password visibility behavior.
- Don't add a remember-me control without a supported behavior contract.
- Don't apply this login composition or authentication-specific token overrides to global application chrome.
- Don't infer a project-wide illustration or motion system from this one surface.

## Application shell and School Admin dashboard

This is an approved extension of the established identity. The authentication frontmatter and all preceding authentication guidance retain their scope and values. The reusable shell serves School Admin, Teacher, and Parent navigation; the new operational overview is School Admin only. Composition authority is `.impeccable/surfaces/application-dashboard.md` and the approved dashboard/profile reference named there. Implemented values come from `apps/web/app/workspace.css` and the app/dashboard components, rather than the reference's sample data.

### Overview

The application favors clear operational scanning: quiet navigation, direct actions, restrained cards, and orange emphasis for the selected destination and primary action. The dashboard leads with actionable follow-up, then counts, today's published lessons, tuition, and communication. Existing workflows and permissions define every destination.

**The Application Scope Rule.** Application overrides live under `.madrasio-workspace`, including the portaled profile popup. Do not promote these overrides into global or authentication tokens.

### Colors

Sidebar, navbar, and canvas share the exact theme background: Light (`#ffffff`), Mist (`#e5e5e5`), Midnight (`#14213d`), and Dark (`#000000`). Application CSS is normative for the scoped HSL tokens and semantic card, text, border, input, and focus roles. Light/Mist use navy foregrounds and light cards; Midnight/Dark use reversed foregrounds and raised tonal cards. Primary quick actions use orange (`#fca311`) with navy text (`#14213d`). Selected navigation uses an orange-tinted surface and context-appropriate orange text. Statistic icon tiles use blue, purple, green, and orange as secondary scanning aids.

Official colored wordmarks appear in Light/Mist, white wordmarks in Midnight/Dark. Collapsed navigation uses the matching official symbol. Preserve asset proportions and unmirrored identity in RTL; never recolor or reconstruct marks.

### Typography

The application reuses self-hosted `Madrasio Inter` and `Madrasio Arabic`. Body copy is compact and readable (14px, line-height 1.5); Arabic puts its own family first. Dashboard headings use weight 700, responsive size (25–34px), line-height 1.2, and tracking (-0.025em); Arabic restores normal tracking and line-height 1.5. Mobile dashboard headings use 27px. Section headings use 16px/700, operational labels and table copy generally 11–13px, and metrics 20–27px with tabular figures. Currency values and school identity use bidirectional isolation where needed. This extension does not revise authentication typography.

### Layout

Desktop navigation is fixed at the logical start, expanded (248px) or collapsed (76px), with a sticky navbar (68px). The page has 28px padding and a centered dashboard maximum width (1600px). Navigation uses direct role-specific links without group headings. The navbar ends with notifications and the profile control.

Below the desktop navigation threshold (1024px), navigation becomes a trapped modal drawer with background content inert, scroll lock, Escape dismissal, and focus restoration. At 700px and below, navbar height is 64px, page padding 18px, profile identity text hides, and content stacks. Metrics use two columns, with the final two cards spanning full width so translated attendance details and currency remain legible. At 1250px and below, the timetable/finance grid becomes one column; communication becomes one column on mobile. Wide lesson tables retain a scroll region instead of crushing columns. Use logical inline spacing and mirror directional affordances for RTL.

### Elevation & Depth

Tonal cards and subtle borders establish structure. Dashboard cards have a restrained shadow (`0 5px 22px rgb(20 33 61 / 3%)`); the profile popup uses stronger separation (`0 12px 36px rgb(20 33 61 / 15%)`). A faint orange gradient belongs to the attention container, not a global decorative background. Reduced-motion preferences remove application animations and transitions.

### Shapes

Cards and the profile popup use gentle rounding (12px); navigation and profile triggers use 10px; quick actions use 7px; icon buttons use 8px. Avatar circles distinguish user role and school identity. Retain the thin contextual borders and modest spacing rather than inheriting authentication shell geometry.

### Components

The profile uses Base UI Popover with a direction provider, logical-end alignment, and viewport-bounded width. It shows school identity and current academic year, the existing school switcher when multiple memberships exist, language/theme preferences, and logout. A School Admin who also has platform authority gets the existing Platform Schools destination in the profile, preserving the approved thirteen sidebar destinations; other roles retain their platform navigation. Context has loading, failure, and unavailable-year states. Use existing preference persistence and authentication behavior.

The dashboard provides real loading, retry, unavailable-year, empty, and populated states. Follow-up cards appear only for applicable pending recording, missing timetable, or overdue tuition; a calm confirmation replaces them when none apply. The timetable labels School Admin attendance as read-only. Announcement and notification sections retain their independent query states and authorized destinations.

**The Recording Completeness Rule.** Pending attendance means incomplete records for the effective eligible roster of a started published lesson. It never represents absence. Future lessons, unavailable status, and no-roster cases remain distinct.

**The Verified Context Rule.** Overview reads require School Admin and existing permissions, and use server-verified school context. The context-only academic-year read is available to authorized school roles. Both return private, no-store responses. Reuse existing publication applicability and finance reports; keep month-to-date school collections distinct from selected-year outstanding balances.

### Do's and Don'ts

- Do preserve the four exact shared chrome/canvas backgrounds, official theme-specific marks, existing fonts, and role-aware navigation.
- Do let French currency, Arabic text, and long school names grow without clipping controls or losing their meaning.
- Do preserve keyboard focus, accessible dialog/popover behavior, localized labels, and reduced-motion support.
- Don't infer dashboard permissions from visible links or client-supplied school identifiers.
- Don't add speculative trend charts, unsupported aggregate search, invented enrollment flows, or attendance-edit actions for School Admin.
- Don't treat synthetic screenshot fixtures as product totals or as evidence of live school data.

Verification evidence: source inspection and manual review of final captures in `test-results/app-dashboard/screenshots/`: `final-en-desktop-light-profile.png`, `final-ar-mobile-midnight-profile.png`, `final-fr-mobile-light.png`, and `final-dual-authority-profile.png`. These confirm the coherent synthetic fixture (71 enrolled, four classes, three teachers, three lessons with one recorded, one pending, and one upcoming), readable full-width mobile currency metrics, and the dual-authority profile destination. Counts are verification fixtures, not product rules or live school data. `test-results/app-dashboard/final-results.json` records 24 locale/device/theme cases and 24 responsive checks with no reported failures or errors, plus teacher/parent, data-state, language, thirteen-destination, mocked school-switch, and logout scenarios. Initial captures predate the corrections. This is bounded screenshot/source and fixture-run evidence: no numeric comp score, detector result, or unavailable engine/build-gate closure is claimed. Pre-existing authentication documentation drift is outside this extension and has not been repaired or promoted into application rules.
