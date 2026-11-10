import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';

export const MOBILE_ONBOARDING_DRAFT_KEY = 'mobile_onboarding';

export type RegistrationDrafts = Record<string, unknown>;

export async function fetchRegistrationDrafts(): Promise<RegistrationDrafts> {
  const response = await professionalApiClient.get<{ drafts?: RegistrationDrafts }>(
    '/registration_draft/',
  );
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to load your saved onboarding progress.'));
  }
  const drafts = response.data?.drafts;
  return drafts && typeof drafts === 'object' && !Array.isArray(drafts) ? drafts : {};
}

export async function saveRegistrationDrafts(drafts: RegistrationDrafts): Promise<void> {
  const response = await professionalApiClient.post('/registration_draft/', { drafts });
  if (!response.ok) {
    throw new Error(formatApiFailure(response, 'Unable to save your onboarding progress.'));
  }
}

export async function clearRegistrationDrafts(): Promise<void> {
  const response = await professionalApiClient.delete('/registration_draft/');
  if (!response.ok && response.status !== 404) {
    throw new Error(formatApiFailure(response, 'Unable to clear saved onboarding progress.'));
  }
}

export async function saveMobileOnboardingDraft(draft: Record<string, unknown>): Promise<void> {
  let existing: RegistrationDrafts = {};
  try {
    existing = await fetchRegistrationDrafts();
  } catch {
    existing = {};
  }
  await saveRegistrationDrafts({
    ...existing,
    [MOBILE_ONBOARDING_DRAFT_KEY]: draft,
  });
}

export async function fetchMobileOnboardingDraft(): Promise<Record<string, unknown> | null> {
  const drafts = await fetchRegistrationDrafts();
  const mobileDraft = drafts[MOBILE_ONBOARDING_DRAFT_KEY];
  if (!mobileDraft || typeof mobileDraft !== 'object' || Array.isArray(mobileDraft)) {
    return null;
  }
  return mobileDraft as Record<string, unknown>;
}
