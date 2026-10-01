# Frontend Architecture & Visual Style Mandates — /apps/web

This file defines the strict structural and visual engineering rules for the Next.js frontend application. AI assistants must adhere to these rules without exception.

## 1. Visual & UI Design Constraints (The ATS-First Standard)
* **Design Philosophy:** Clean, high-contrast typography and precise whitespace over graphical decorations.
* **Prohibited UI Elements:** Never implement graphical skill meters, percentage bars, circular charts, background color blocks for text sections, custom icons inside standard bullet lists, or colored timeline graphics.
* **Fonts & Hierarchy:** Rely entirely on clean, system-safe sans-serif typography (Helvetica, Arial, Inter) using alternating font weights (`font-medium`, `font-bold`) and tracking/letter-spacing to define visual sections.
* **Layout Grid:** Use a split-screen dashboard layout for desktop screens: Left side contains interactive multi-step data input forms; Right side displays a live, real-time print preview bounding box mimicking a standard physical paper sheet (A4 or Letter).

## 2. Component Engineering & State Boundaries
* **Form State Isolation:** Individual form sub-sections (e.g., `ContactForm`, `ExperienceForm`) must utilize localized control loops, propagating validation changes upward to the parent Workspace layout state *only* on input blurring (`onBlur`) or form submission. This prevents unnecessary component re-renders on every keystroke.
* **Data Flow Conformity:** All form component prop hooks and mutation events must map directly to the unified `CVData` schema layout imported from `@packages/shared-types`. No local UI states may deviate from this schema structure.
* **Optimistic UI Updates:** When an interactive "Polish with AI" button is executed, immediately apply a subtle inline skeleton pulse or loading spinner to that specific text field. Once the text response returns from the API endpoint, smoothly swap the text string in place.

## 3. Print Compilation Pipeline
* **Zero-Token PDF Exports:** PDF generation must occur 100% locally on the client-side using `react-pdf` or specialized CSS `@media print` directives. The backend must never be utilized to compute binary file layouts, generate HTML-to-PDF screenshots, or manage heavy container rendering servers.