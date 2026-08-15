# ADR-016: Vercel Hosting Strategy

- Status: Accepted
- Date: 2026-08-15

## Context

The application is built with Next.js.

Vercel provides strong Next.js integration.

The project also has a strict low-budget requirement.

## Decision

Use Vercel during development and personal/non-commercial use.

Use Vercel Pro when the application becomes commercial and the Vercel plan requirements require it.

Supabase Free remains the initial database tier where its limits are sufficient.

## Cost Strategy

Development:
- Vercel Hobby
- Supabase Free
- R2 within applicable free usage

Commercial MVP:
- Vercel Pro
- Supabase Free initially
- Upgrade Supabase only when actual limits or production requirements justify it

## Important Constraint

Do not treat Vercel Hobby as the commercial production plan.

Commercial deployment must comply with Vercel's current terms.