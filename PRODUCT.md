# Madrasio

Madrasio is a multi-tenant school management SaaS for private schools in Morocco, initially serving primary, middle, and secondary education. [PRD.md](PRD.md) remains the detailed product and architecture authority; this file is its short design-context companion, not a replacement specification.

The V1 users are Super Admin, School Admin, Teacher, and Parent. There is no Student account in V1. English and French use LTR; Arabic uses RTL. User-facing copy, layout, keyboard operation, and loading, empty, and error states must support these users and languages. The parent experience follows school context and selected child.

School is the tenant boundary. School context, membership, permissions, relationships, ownership, and resource state are verified on the server. Frontend filtering is not tenant isolation. The approved architecture is a single Next.js modular monolith with the stack and module ownership defined in the PRD.

The approved application extension provides a reusable School Admin, Teacher, and Parent shell, preserving role-specific navigation and existing teacher/parent content. It uses Madrasio's official identity, the existing self-hosted Inter and Arabic fonts, and Light, Mist, Midnight, and Dark themes. Authentication remains a separate protected design scope. [DESIGN.md](DESIGN.md) records the implemented visual system; the [application surface brief](.impeccable/surfaces/application-dashboard.md) records its composition direction.

The School Admin dashboard is an operational overview of the selected school: follow-up requiring attention, current enrollment, published lessons, attendance-recording completeness, offline tuition, announcements, and personal notifications. It links to existing workflows. School Admin attendance is read-only; incomplete recording never means student absence. Financial values retain their explicit scope: outstanding balances for the selected academic year and collections for the school month to date across academic years, net of reversals. No unsupported aggregate search, speculative trends, charts, or enrollment actions are implied by this surface.
