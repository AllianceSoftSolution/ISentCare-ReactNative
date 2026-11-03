This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md




_________________________________________________________

# AGENTS.md

## Project Folder Structure Guidelines

Build and maintain this project using a modular folder structure similar to the RADC Construction mobile application.

The project uses:
- React Native
- Expo
- Expo Router
- JavaScript / JSX

The application is currently being developed using Expo Go.

## Folder pattern [dont make the exact same folders, just the structure should be similar]

```text
project-root/
│
├── app/
│   ├── (auth)/
│   ├── dashboard/
│   └── screens/
│
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── components/
│   ├── cards/
│   ├── modals/
│   ├── forms/
│   └── ui/
│
├── api/
│
├── hooks/
│
├── store/
│
├── context/
│
├── constants/
│
├── utils/
│
├── docs/
│
└── scripts/
```

## Folder Responsibilities

### 1. `app/`
Contains application screens and navigation.

- Organize screens by feature or user role.
- Use Expo Router for file-based navigation.
- Keep authentication screens grouped separately.
- Organize dashboard sections into their respective folders.
- Use nested folders for related screens and features.

### 2. `assets/`
Contains static application resources.

- Images
- Icons
- Fonts
- Other visual assets

### 3. `components/`
Contains reusable UI components shared across screens.

Organize related components into subfolders based on their purpose, such as cards, modals, forms and general UI elements.

### 4. `api/`
Contains backend communication and API-related modules.

Keep API logic separate from screen and presentation logic.

### 5. `hooks/`
Contains reusable custom React hooks and shared React logic.

### 6. `store/`
Contains global application state management.

### 7. `context/`
Contains React Context providers and shared context-related logic.

### 8. `constants/`
Contains shared constants and application configuration.

### 9. `utils/`
Contains reusable helper functions and utility logic.

### 10. `docs/`
Contains project documentation and development guidelines.

### 11. `scripts/`
Contains development, automation and project maintenance scripts.

## Structural Rules

1. Maintain a clear separation between screens, reusable components, API logic, state management and utility functions.
2. Organize application screens by feature or user role rather than placing every screen in one directory.
3. Create additional nested folders when a feature grows and requires better organization.
4. Avoid unnecessary folders and excessive nesting.
5. Reuse existing folders instead of creating duplicate organizational structures.
6. Do not create every possible folder immediately. Create folders when they are needed.
7. Keep the structure consistent throughout the project.
8. Do not place unrelated helper code or reusable components inside the `app/` directory.

## Expo Go and Native Platforms

The project currently uses Expo Go.

- Do not create `android/` or `ios/` directories.
- Do not generate native Android or iOS projects.
- Do not introduce native configuration unless explicitly requested.
- Keep development within the shared Expo application.
- Maintain compatibility with Expo Go.

Native platform projects can be introduced later if the project requires a development build or native functionality.

## Main Architectural Principle

Follow this organizational separation:

- `app/` — Application screens and navigation.
- `assets/` — Static resources.
- `components/` — Reusable UI.
- `api/` — Backend communication.
- `hooks/` — Reusable React logic.
- `store/` — Global state.
- `context/` — Shared React Context.
- `constants/` — Fixed values and configuration.
- `utils/` — Helper functions.
- `docs/` — Documentation.
- `scripts/` — Development scripts.

Follow this structure for all  development and maintain consistency as the application grows.