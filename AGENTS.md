# AI Agent Repo Conventions & Workflow Notes

Welcome to the Real Card Sandbox project. When interacting with this codebase, please observe the following core conventions:

## 1. Core Architecture & Philosophy
* **Digital Card Sandbox:** This is a physics-based, zero-gravity card table sandbox. The core idea is "no rules" — players manage the state themselves just like physical cards.
* **Tech Stack:** React, TypeScript, Vite, Tailwind CSS, Phaser 3, and Matter.js.
* **P2P Master-Slave Pattern:** Multiplayer is powered by PeerJS. The Host (typically a tablet/desktop) runs Phaser and maintains the single source of truth for game state. Clients (phones) act as "hands", rendering private views and sending user actions.
* **Canvas + React UI Overlay:** The Phaser game engine runs as a full-screen background canvas. React UI overlays use absolute positioning and `pointer-events-none` so interactions seamlessly pass through to Phaser.

## 2. Interaction Design
* **Host Interaction:** Users drag and flick cards using physics-based Matter constraints. The perimeter is divided into 10 interactive zones that adapt to orientation. Dropping cards in these zones deals them to specific players.
* **Client Interaction:** Mobile interfaces use React touch events (`onTouchStart`, `onTouchEnd`) bound to specific upper and lower zones (swipe up to play, swipe down to draw) to avoid interfering with native vertical scrolling in the card hand area.

## 3. Strict Coding Standards
* **NPM Installs:** Always use the `--legacy-peer-deps` flag (e.g., `npm install --legacy-peer-deps` or `npm ci --legacy-peer-deps`). This is required to bypass peer dependency conflicts between `vite` and `vite-plugin-pwa`.
* **TypeScript & ESLint:**
  * Strict rules are enabled. We use `verbatimModuleSyntax`, meaning you MUST use `import type` when importing types.
  * No unused variables are allowed.
  * React components must be strictly pure: no `Math.random()` during render, and no inline classes generated dynamically inside React components.

## 4. Deployment & PWA Configuration
* **Deployment-Agnostic:** The app is built for GitHub Pages via GitHub Actions. The Vite `base` configuration is set to `'./'`. Asset paths in `index.html` and dynamic URLs (like join links) should rely on relative paths and `window.location.pathname`.
* **Service Workers:** The project uses `vite-plugin-pwa`. To prevent stale root-level service workers from intercepting requests, `index.html` includes an inline script to unregister conflicting service workers before app load.

## 5. Typical Commands
* **Start Dev:** `npm run dev`
* **Build:** `npm run build`
* **Preview:** `npm run preview`
* **Lint:** `npm run lint`

## 6. Functional Verification
* Because functional validation happens only after merge and Pages deployment, optimize for a fast feedback loop. Keep changes minimal and focused.
