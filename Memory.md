# Memory

## Tasks Completed

- Read AGENTS.md and aligned project with modular folder structure.
- Grouped authentication screen under `src/app/(auth)/index.tsx`.
- Moved reusable themed components to `src/components/ui/`.
- Extracted login API logic into `src/api/auth.ts`.
- Added `src/api/apiClient.ts` using apisauce with auth request/response transforms.
- Added `src/store/authStore.ts` for token state and logout.
- Refactored auth API calls to use apiClient.
- Updated login/logout flows to sync auth store token.
- Fixed Expo Router typed-route references after restructuring.
- Fixed tab icon color typing in `src/app/(tabs)/_layout.tsx`.
- Verified with `npx tsc --noEmit` and `npx expo lint`.
EOF