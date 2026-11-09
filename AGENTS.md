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











_____________________________________________
FOR Agents to read:

On app launch:

1. Show a branded splash screen with a loading indicator.
2. Fetch the current user’s profile/status from the API and determine whether the user is verified.
3. Read the stored `accessToken` from secure storage.
4. Route the user according to the session and verification state:
   - **No access token:** show the Get Started screen.
   - **Access token and verified user:** open the main app.
   - **Access token and unverified user:** open the employment/license details step, where the user is told to contact an administrator if verification is still pending.
5. Handle failure to fetch user status or profile gracefully. Do not silently treat an API error as proof that the user is verified.

The existing app adds a short delay during splash initialization. Replicate the visible loading transition, but don’t rely on a delay for authentication logic.

**Reference:** [Splash/session routing](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/splash_Screen.dart) · [Auth/session handling](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/auth_Viewmodel.dart)

## 2. Get Started screen

Show the app branding and two primary actions:

- **Sign In** → opens the Sign In screen.
- **Sign Up** → begins registration at the Job Type screen.

Navigation should support returning to the previous screen using the normal back action.

**Reference:** [Get Started screen](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/register/get_started.dart)

## 3. Sign In

### Interface

Provide:

- Email field.
- Password field with a show/hide control.
- **Forgot Password?** link.
- **Sign In** button.
- **Register** link for users who don’t have an account.

### Behavior

1. Require both email and password before submitting.
2. On submit, send the trimmed email and password to the login API.
3. Show a loading state while the request is in progress and prevent duplicate submissions.
4. On successful response:
   - Save the returned access token securely under the `accessToken` key.
   - Show a success message.
   - Navigate into the app.
5. On failure, keep the user on the sign-in screen and show an actionable error. Handle known cases such as invalid credentials, network failure, an existing account, or an account awaiting admin verification.
6. **Register** opens Job Type onboarding.
7. **Forgot Password?** opens the Forgot Password screen and integrate it with backend.


**Reference:** [Sign In screen](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/auth/view/signin/sign_in.dart) · [Login and token handling](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/auth_Viewmodel.dart)

## 4. Sign Up: Job Type

Collect and submit the information needed to create the account as it is doing currently in the app.

### Behavior

1. Validate all required fields before submission.
2. Calculate age from the selected date of birth and block submission for users under 18. Show a clear message explaining the age requirement.
3. Selecting an address suggestion should fill the address field and dismiss the suggestions.
4. Keep registration choices from the prior Job Type step and include them in the final registration request.
5. Submit registration as a multipart request when a profile photo is provided, including the photo and the entered registration fields.
 The app displays Google’s address suggestions, and selecting one fills the address field. It does not appear to fetch full place details or verify the address; it uses the suggestion text. Address autocomplete code · Address field and suggestion selection

The app’s latitude and longitude are collected separately from the device’s location during the job-type step—not from the selected address. Note: the Google API key is embedded in the client code, so it should be restricted and managed securely.
6. On success:
   - Securely store the returned access token.
   - Show a confirmation message.
   - Re-enter the app’s session-routing flow so the user is sent to the appropriate next step based on verification status.
7. On failure, remain in the form, preserve entered values when possible, and show a useful error message.

The current implementation uses an address-autocomplete service, gathers location coordinates in Job Type, and associates a selected state with its API value. In a replica, configure third-party credentials securely; do not copy credentials embedded in client source.

**Reference:** [Personal Information form](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/register/personal_information.dart) · [Form, image, address, and age logic](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/auth/controller/personal_information_controller.dart)

## 6. Verification and post-registration access

Treat authentication and professional verification as separate states:

- A stored token indicates an authenticated session.
- The user’s profile/status indicates whether the account is verified.
- An authenticated but unverified user must not be treated as verified just because they have a token.
- Direct access to the main app is intended for verified users. Unverified users should be routed to the employment/license details step and shown a message to contact an administrator if verification is pending.
- After verification is confirmed, route the user to the main app.

The current login handler navigates to the main app immediately after receiving a token, while the splash flow checks verification and can route an unverified user to the employment details screen. For a consistent replica, apply the same verification gate after login as well as on app launch.

**Reference:** [Verification status and login](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/auth_Viewmodel.dart) · [Employment details verification gate](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/register/employ_details.dart)

## 7. Forgot Password

Provide a Forgot Password screen with:

- Email field.
- **Send Email** button.
- Link back to Sign In.

**Important:** In the repository, the button currently has no action wired up. Do not claim that password reset works unless you implement it. To complete this feature, connect it to a confirmed password-reset endpoint and define its loading, success, and error states. If no endpoint is available, leave the action explicitly marked as unavailable rather than showing a false success.

**Reference:** [Forgot Password screen](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/register/forgot_password.dart)

## 8. Sign Out

From the signed-in app:

1. Ask the user to confirm sign-out.
2. On confirmation, delete the stored session credentials from secure storage.
3. Clear any in-memory authenticated user/session state.
4. Navigate to Sign In and prevent the user from returning to authenticated screens with the back button.

**Reference:** [Sign-out implementation](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/auth_Viewmodel.dart) · [Profile sign-out entry](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/profile/profile_screen.dart)

## 9. Navigation summary

```text
App launch
  └─ Splash / check user status and secure token
       ├─ No token → Get Started
       │    ├─ Sign In → Sign In
       │    │    ├─ Success + verified → Main app
       │    │    ├─ Success + unverified → Employment/license details
       │    │    ├─ Forgot Password → Forgot Password
       │    │    └─ Register → Job Type
       │    └─ Sign Up → Job Type
       │         └─ Valid details + location → Personal Information
       │              └─ Registration success → Re-check session/status
       ├─ Token + verified → Main app
       └─ Token + unverified → Employment/license details
```

## 10. Cross-cutting implementation requirements

- Store tokens only in platform secure storage, not ordinary preferences or logs.
- Do not log passwords, SSNs, tokens, or sensitive form data.
- Handle loading, empty, network-error, and server-error states explicitly.
- Prevent duplicate form submissions while requests are in progress.
- Preserve form state on recoverable errors.
- Use clear permission prompts for location and photo access.
- Keep API credentials out of client code and use a secure configuration mechanism.
- Ensure all navigation paths have a clear back or cancel behavior, except after sign-out, when authenticated routes should be removed from the navigation stack.



____________________________________________________
# SHIFTS BEHAVIOUR HEADING
# Feature specification: Find and apply for work

Use this specification to replicate the job and shift discovery behavior in the Isentcare app. It covers the app navigation, data loading, filtering, cards, details, applications, completed shifts, pagination, and observed implementation limitations.

## 1. Entry point and navigation

The signed-in main app has a bottom navigation bar with these sections:

1. **Home**
2. **Shifts**
3. **Jobs**
4. **Calendar**
5. **Profile**

Selecting **Shifts** opens a screen with two tabs:

- **Per Diem Shifts** — available per-diem opportunities.
- **Completed Shifts** — the user’s completed shifts.

Selecting **Jobs** opens the permanent-jobs list.

When the main navigation switches to these sections, it fetches the relevant data:

- Shifts: available per-diem shifts and completed shifts.
- Jobs: permanent jobs.

**Reference:** [Main navigation](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/navigation_menu.dart) · [Shifts and completed shifts tabs](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/shifts/shifts_screen.dart)

## 2. Per-diem shifts

### Screen content

The Per Diem Shifts tab contains:

- A distance slider displaying the selected distance in miles.
- A list of available shift cards.
- A **Load More** button when additional pages are available.
- Loading, error, and empty states.

The slider ranges from **0 to 100 miles**, in one-mile increments. The screen does not show a separate “Apply” button; each shift card has a **Pick** action.

### Fetching and filtering

Fetch the available shifts from the per-diem jobs API. The list is paginated.

- Initial request: fetch page 1.
- When the distance slider changes: fetch page 1 again, passing the selected range as a `range` query parameter.
- When **Load More** is selected: request the next page and append those results to the existing list.
- Show a loading indicator while a request is in progress.
- Show an error state if the request fails.
- Show an empty-state message when no shifts are available.

The observed requests use the following shape:

```text
GET /professional/api/per_diem_jobs/?page={page}
GET /professional/api/per_diem_jobs/?page={page}&range={miles}
```

The API response contains pagination metadata (`count`, `next`, `previous`, `page`) and shift results. Each shift includes an ID, start date, timing, profession, state, bill rate, facility, and facility ID.

**Implementation note:** In the current code, moving the slider triggers a fetch with the selected range. The “Load More” request does not pass the range again. Preserve the selected filter during pagination in a replica if the intention is to keep loading within the filtered result set.

**Reference:** [Per-diem shifts screen and slider](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/shifts/shifts_screen.dart) · [Per-diem fetch, range, and pagination](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/perdiem_vieewController.dart) · [Per-diem API endpoint](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/resources/constants/api_endpoints.dart)

### Available shift card

Each available shift card displays:

- Facility name.
- Shift date, formatted for display.
- Shift timing, mapped to a time range:
  - Morning → `7AM-3PM`
  - Evening → `3PM-11PM`
  - Other timing values → `11PM-7AM`
- Bill rate, prefixed with `$`.
- **Pick** button.

Tapping the card itself opens a shift-details screen. Tapping **Pick** opens a confirmation dialog asking whether the user wants to pick the job.

### Shift details

The details screen displays:

- Facility.
- Status, shown as `available`.
- Formatted date.
- Timing.
- Price, prefixed with `$`.
- A map image.

The current details screen uses a bundled image asset for the map; it does not display a live map or map-based facility location.

**Reference:** [Available shift cards and navigation](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/widget/container/shift_list_container.dart) · [Shift card UI](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/widget/container/shift_card_container.dart) · [Shift details screen](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/shifts/shift_detail_screen.dart)

### Picking a per-diem shift

When the user selects **Pick**:

1. Show a confirmation dialog.
2. If confirmed, submit an application using the selected shift’s ID:

```json
{
  "job": "<shift ID>"
}
```

3. Show a loading indicator while the request is submitted.
4. On success:
   - Dismiss the loading indicator.
   - Show an “Apply Successfully” success message.
   - Navigate to the main navigation screen, clearing the existing navigation stack.
5. On failure:
   - Dismiss the loading indicator.
   - Show an error message, including a no-internet message where appropriate.
   - Do not show a success message or navigate as if the application succeeded.

The observed application endpoint is:

```text
POST /professional/api/per_diem_job_applications/
```

**Reference:** [Per-diem application action](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/perdiem_vieewController.dart) · [Per-diem repository and endpoint call](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/repo/perdiem_repo.dart)

## 3. Completed shifts

The **Completed Shifts** tab is separate from the available per-diem list. It loads the user’s completed shifts from a paginated endpoint.

Each completed-shift card displays:

- Facility name.
- Shift date.
- Timing.
- Pay, prefixed with `$`.

Completed shift cards do not show a **Pick** button. If more results are available, show **Load More**; selecting it fetches the next page and appends the results. Show loading, error, and empty states as appropriate.

The observed request shape is:

```text
GET /professional/api/shifts/completed_shifts/?page={page}
```

Completed shift data may also contain position, punch-in and punch-out times, break information, total hours, and facility ID, but the inspected completed-shift card displays only facility, date, timing, and pay.

**Reference:** [Completed shifts tab](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/shifts/shifts_screen.dart) · [Completed-shift cards and pagination](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/widget/container/completed_shift.dart) · [Completed-shift API](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/repo/perdiem_repo.dart)

## 4. Permanent jobs

The **Jobs** section shows permanent opportunities in a paginated list.

### Permanent job card

Each card displays:

- Specialty.
- Job type/status, selected from the job flags:
  - `fix_time` → **Fix Term**
  - Otherwise, `tra_assign` → **TRA Assign**
  - Otherwise, `per_place` → **Per Place**
  - Otherwise → **No Status Available**
- Profession name.
- State/location.
- **Apply** button.

The card does not provide a separate job-details screen in the inspected implementation.

### Fetching and pagination

Fetch permanent jobs from the permanent-jobs API:

```text
GET /professional/api/permanent_jobs/?page={page}
```

- Load page 1 when entering the Jobs section.
- When more pages are available, show **Load More**.
- Selecting **Load More** fetches the next page and appends results.
- Show loading, error, and empty states.

Each result includes fields such as ID, profession, specialty, duration, job-type flags, detail, status, state, facility, and facility ID. The current card displays only the fields listed above.

### Applying for a permanent job

When the user selects **Apply**:

1. Show a confirmation dialog.
2. If confirmed, submit the selected job’s ID:

```json
{
  "job": "<permanent job ID>"
}
```

3. Show a loading indicator during submission.
4. On success, show “Apply Successfully” and return to the main navigation screen, clearing the prior navigation stack.
5. On failure, stop loading and show an error; do not navigate as if the application succeeded.

The observed application endpoint is:

```text
POST /professional/api/permanent_job_applications/
```

**Reference:** [Permanent jobs screen and pagination](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/feature/isent_care/view/job/job_screen.dart) · [Permanent-job card and Apply confirmation](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/widgets/jobs_card.dart) · [Permanent-job controller](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/models/permanentjobs_viewController.dart) · [Permanent-job API calls](https://github.com/AllianceSoftSolution/Isentcare-1/blob/master/lib/repo/permanentjobs_repo.dart)

## 5. Data and interaction requirements

For a faithful implementation:

- Use the authenticated user’s API session when fetching and applying for jobs.
- Keep available per-diem shifts, completed shifts, and permanent jobs as separate data sets.
- Append paginated results rather than replacing the existing list.
- Avoid duplicate requests while a fetch or application is already in progress.
- Use API pagination metadata to determine whether more results exist.
- Format dates consistently and display prices as currency.
- Ensure confirmation dialogs submit the ID of the specific card the user selected.
- Keep the user on the current screen if an application fails.
- Match the current UI’s displayed fields; don’t infer that unshown response fields are part of the current card design.

## 6. Navigation summary

```text
Main app
  ├─ Shifts
  │    ├─ Per Diem Shifts
  │    │    ├─ Change distance → reload available shifts with range
  │    │    ├─ Tap shift card → shift details
  │    │    ├─ Pick → confirmation → submit per-diem application
  │    │    └─ Load More → append next page
  │    └─ Completed Shifts
  │         └─ Load More → append next page
  └─ Jobs
       ├─ Load permanent jobs
       ├─ Apply → confirmation → submit permanent-job application
       └─ Load More → append next page
```

**Behavioral distinction:** Per-diem cards use **Pick** and open a shift-details screen when the card is tapped. Permanent-job cards use **Apply** and, in the inspected code, do not open a separate details screen.


____________________________________________________________
# Geolocation Behaviour
Below is a copy-ready brief for the React Native agent. It treats the Flutter repository as a behavior reference only—do not make changes to it. The requested facility check belongs in the backend.

React Native geolocation and shift-start requirements
Scope
Build the Isentcare professional app in React Native. Use the existing Flutter app only to understand current user flows and screen behavior. Do not edit or depend on Flutter code.

Implement the React Native geolocation behavior and make punch-in subject to a server-enforced facility geofence. If backend changes are part of your task, make them in AllianceSoftSolution/IsentCare, not in the Flutter repository.

Geolocation is used in three distinct flows
1. Registration: capture the professional’s location
During Job Type onboarding, the current app requests the device’s location. The registration request includes the resulting latitude and longitude alongside the professional’s registration details.

In React Native:

Request location permission as part of this onboarding step, explaining why location is needed.
Obtain the device’s current position and carry its coordinates forward into the registration request.
Do not use the registration coordinates as the professional’s location for a future shift punch-in; that must use a fresh reading.
If permission is denied or location cannot be obtained, show a clear error and do not submit fabricated or default coordinates. Decide whether onboarding can continue without location only if the product/backend supports that behavior.
Flutter behavior references: Job Type onboarding · Location capture · Registration payload

2. Starting a shift: verify location at punch-in
This is the key behavior change: a professional must be within the configured geofence around the facility to start a shift.

React Native client behavior:

The professional taps Start Shift for one of today’s shifts.
Show a confirmation prompt.
After confirmation, request a fresh, high-accuracy device location. Do not reuse registration coordinates or an old cached reading.
If location services are off, permission is denied, or a usable position cannot be obtained, do not call the punch-in API. Explain how to enable location or try again.
Send the shift application ID and the professional’s current latitude and longitude to the backend.
Show loading state and prevent duplicate submissions while the request is in progress.
Only show the shift as started after the backend confirms success.
If the backend rejects the location, keep the shift unstarted and show its error message, for example: “You must be at the facility to start this shift.”
The existing Flutter app obtains the device location in its Start Shift flow and sends it with the application ID. In the React Native replica, obtain it after confirmation so the submitted location is as current as possible.

Behavior reference: Flutter Start Shift flow · Shift-start API endpoint

3. Per-diem distance slider: send a range, not a punch-in location
The Per Diem Shifts screen has a distance slider from 0 to 100 miles. Changing it sends the selected range to the per-diem jobs API and reloads the list.

Keep this separate from punch-in geofencing:

Do not treat the slider value as the professional’s current location.
Do not use the slider to decide whether punch-in is allowed.
Do not assume the client calculates distances; the current app sends the range to the backend.
Behavior reference: Per-diem distance slider

Address autocomplete is not device geolocation
The registration address field uses Google Places Autocomplete to suggest address text. It is separate from GPS and is not proof of where the professional is when starting a shift. Do not use the typed address or selected autocomplete suggestion for punch-in validation.

Behavior reference: Address autocomplete request

Backend requirement: enforce the facility geofence
The backend repository is AllianceSoftSolution/IsentCare. Its current ShiftSerializer.validate() reads facility coordinates, but the distance check is commented out. The backend’s address model stores facility address latitude and longitude. Punch-in serializer · Address and facility models

Implement the check in the backend; client-side checks alone are not sufficient:

Authenticate the professional and preserve the existing checks for application ownership, approval, duplicate punch-in, shift date, and allowed punch-in time.
Validate that the submitted professional latitude and longitude are present, finite, and in valid ranges (-90..90 and -180..180).
Load the facility latitude and longitude from the job’s facility address on the server. Never trust facility coordinates sent by the client.
Reject punch-in if facility coordinates are missing or invalid; fail closed rather than skipping the check.
Calculate the distance in meters between the submitted professional coordinates and the facility coordinates using a correct Haversine calculation or a suitable geospatial library.
Compare the distance with a configurable geofence radius. The repository does not establish a product-approved radius; use 100 meters as an explicitly configurable initial setting, and document where to adjust it.
Accept punch-in only when the distance is within the configured radius. Otherwise return a clear validation error such as: You must be at the facility to start this shift.
Save the professional’s submitted coordinates on the shift only after all validation succeeds.
Do not simply uncomment the existing comparison unchanged. Its old 5,000,000-meter threshold is not a suitable facility geofence.

The existing client request contract sends an application ID and coordinates to the punch-in endpoint. Keep that contract unless backend inspection shows the endpoint has changed. The backend must make the final allow/deny decision.

React Native implementation notes
Use the location library appropriate to the project’s setup (for example, Expo Location in an Expo app or a compatible native geolocation library in a bare React Native app). First inspect the existing React Native project and follow its conventions.
Configure platform permission declarations and user-facing permission descriptions for the platforms the app supports.
Do not log access tokens or sensitive user data. Avoid logging precise location unless needed for development diagnostics, and remove such logs in production.
Handle denied and permanently denied permissions, disabled location services, timeouts, and poor GPS accuracy with explicit UI states.
If the location reading is too inaccurate to make a reliable geofence decision, ask the professional to retry rather than pretending the user is at the facility. The backend still performs the definitive distance check.
Do not add continuous or background tracking. The requested location check happens when the professional attempts to start a shift.
Tests
Add backend tests for:

Punch-in within the configured radius succeeds.
Punch-in outside the radius is rejected.
Missing, malformed, non-finite, or out-of-range professional coordinates are rejected.
Missing or invalid facility coordinates are rejected.
Facility coordinates come from the server’s facility record, not from client input.
Existing ownership, approval, duplicate punch-in, date, and shift-window rules remain enforced.
A rejected punch-in does not create a shift record.
Add React Native tests where practical for:

Permission/service failures prevent the API call.
A fresh location and the correct application ID are sent on punch-in.
Backend geofence rejection is shown, and the UI does not show the shift as started.
Successful backend response updates the shift UI and displays success.
Expected outcome: the React Native app requests and submits the professional’s current location when starting a shift; the backend compares it to the facility’s stored location and rejects punch-in when the professional is outside the configured radius.
