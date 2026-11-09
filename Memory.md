# Memory

## Tasks Completed

- Read AGENTS.md and aligned project with modular folder structure.
- Grouped authentication screens under `src/app/(auth)/`.
- Moved reusable themed components to `src/components/ui/`.
- Extracted login API logic into `src/api/auth.ts`.
- Added `src/api/apiClient.ts` using apisauce with auth request/response transforms.
- Added `src/store/authStore.ts` for token state and logout.
- Refactored auth API calls to use apiClient.
- Updated login/logout flows to sync auth store token.
- Added multi-step registration screen at `src/app/(auth)/register.tsx`.
- Wired Register link on login to navigate to registration.
- Added register API function using apiClient.
- Added onboarding screen `src/app/(auth)/onboarding.tsx` with license, education, and employment sections.
- Added Save and Continue Later button on onboarding.
- Registration now routes to onboarding after successful signup.
- Trimmed apiClient base URL and cleaned .env to fix state fetching.
- Tightened validations (SSN 9 digits, duration one decimal).
- Added DateTimePicker for date fields in registration and onboarding.
- Updated onboarding to a single page with all sections and icons; aligned with web.
- Replaced per-section Save buttons with one Save button that submits all sections sequentially.
- Added `src/app/index.tsx` as the branded splash and session-routing entry point.
- Replaced all direct fetch calls with apiClient across the app.
- Fixed Expo Router typed-route references after restructuring.
- Fixed tab icon color typing in `src/app/(tabs)/_layout.tsx`.
- Added secure session restoration, profile verification routing, and authenticated tab guards.
- Added Get Started, Sign In, and Forgot Password screens with backend password-reset handling.
- Added secure token migration and confirmed sign-out with credential and in-memory state cleanup.
- Added registration age validation, foreground location capture, address suggestions, and session rerouting after signup.
- Applied Flutter-inspired styling to the new authentication screens while keeping onboarding styling unchanged.
- Configured the Expo Location permission message for registration.
- Added paginated per-diem, completed-shift, and permanent-job discovery, with distance filtering, details, and application flows.
- Preserved loaded opportunities when pagination fails and added inline retry actions.
- Forced the app to use a white/light theme regardless of the device appearance setting.
- Added fresh, high-accuracy location checks for shift punch-in and server-side facility geofencing with a configurable 100-meter radius.
- Styled Home with the Flutter-inspired welcome banner and live available/completed shift totals while preserving location-gated shift start.
- Replaced the Calendar placeholder with a selectable month grid, scheduled-shift markers, selected-day shift cards, and month-scoped calendar API loading.
- Added an API-backed Profile header and navigation to existing Shifts, Jobs, and Calendar screens while retaining uploaded-document access and confirmed sign-out.
- Expanded Profile to include all reference menu options and added functional profile details, paginated time sheets/earnings, employment, education, attachment, license, reference, and settings pages; Support and Share launch native actions.
- Added authenticated profile-image rendering and replaced full-screen initial loading indicators on Home, Calendar, and Profile detail screens with skeleton placeholders.
- Kept production punch-in windows on UTC and enabled the newer local-time and missed-shift login messaging only in development; restored the pre-existing account-block behavior for any punch-in outside the scheduled window.
- Verified with `npx tsc --noEmit` and `npx expo lint`.



<!-- 
________________________
issues:
1. add duration instead of start year end year in employment history.
2. type: You have already added a license. no api call should be made unless all the validaiton are performed so that redundant data storing can be avoided.
3. save using local storage.
4. match the fields, the document encoding problem , signature,
5. Cross-match employment eligiblity sections' dropdown with web ones.
6. The dropdwon in employment eligibility section should be kept same as that in web
7. add the statement of accuracy too and signature canvas too
8.  -->