# Project Rules

1.  **Code Quality Check**: Always run `npm run lint` and `npm run build` after modifying frontend code (`src/**/*`). Fix any errors before notifying the user.

2.  **Code Comments**: All code comments must be written in Chinese (Mandarin).

3.  **Offline Deployment (Hard Requirement)**:
    - The target deployment environment is fully offline (no Internet connectivity).
    - Do not introduce external CDN resources (JS/CSS/fonts/icons/map services).
    - All runtime assets must be localized under project-controlled paths (`public/`, `dist/`, or internal services on intranet).
    - Frontend-backend communication must only use loopback or designated intranet addresses.
