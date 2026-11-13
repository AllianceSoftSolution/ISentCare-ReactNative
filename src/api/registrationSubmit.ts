import { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure, getErrorMessage } from '@/api/work';
import { appendUploadAsync, multipartRequestConfig, type SelectedUpload } from '@/utils/upload';

export type RegistrationSectionType =
  | 'licenses'
  | 'employements'
  | 'educations'
  | 'attachments'
  | 'resume'
  | 'extra_attachments'
  | 'employee_emergency_contacts'
  | 'references';

export type RegistrationSubmitSection = {
  type: RegistrationSectionType;
  /** Client key echoed by the API on validation errors. */
  key: string;
  appendFields: (formData: FormData, sectionIndex: number) => void | Promise<void>;
};

export type RegistrationSubmitFailure = {
  message: string;
  sectionKey?: string;
  sectionIndex?: number;
  sectionType?: string;
};

function sectionPrefix(index: number) {
  return `section_${index}_`;
}

export function appendSectionValue(
  formData: FormData,
  sectionIndex: number,
  name: string,
  value: string | number | boolean,
) {
  formData.append(`${sectionPrefix(sectionIndex)}${name}`, String(value));
}

export async function appendSectionUpload(
  formData: FormData,
  sectionIndex: number,
  name: string,
  upload: SelectedUpload,
) {
  await appendUploadAsync(formData, `${sectionPrefix(sectionIndex)}${name}`, upload);
}

function parseFailure(data: unknown, fallback: string): RegistrationSubmitFailure {
  const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const sectionIndexRaw = body?.section_index;
  const sectionIndex = typeof sectionIndexRaw === 'number'
    ? sectionIndexRaw
    : typeof sectionIndexRaw === 'string' && sectionIndexRaw.trim() !== '' && Number.isFinite(Number(sectionIndexRaw))
      ? Number(sectionIndexRaw)
      : undefined;
  return {
    message: getErrorMessage(data, fallback),
    sectionKey: typeof body?.section_key === 'string' ? body.section_key : undefined,
    sectionIndex,
    sectionType: typeof body?.section_type === 'string' ? body.section_type : undefined,
  };
}

/**
 * Atomic Step 3 submit. Posts every changed section in one multipart request so
 * the server can roll them back together on failure (retry-safe updates).
 */
export async function submitRegistrationSections(
  sections: RegistrationSubmitSection[],
): Promise<void> {
  if (!sections.length) return;

  const formData = new FormData();
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    // section_{i}_type / section_{i}_key are metadata; unpacker skips field names "type" and "key".
    formData.append(`section_${index}_type`, section.type);
    formData.append(`section_${index}_key`, section.key);
    await section.appendFields(formData, index);
  }
  formData.append('section_count', String(sections.length));

  const response = await professionalApiClient.post(
    '/registration_submit/',
    formData,
    multipartRequestConfig,
  );

  if (!response.ok) {
    const failure = parseFailure(
      response.data,
      formatApiFailure(
        response,
        'One or more sections could not be saved. Earlier changes from this Submit were undone.',
      ),
    );
    const error = new Error(failure.message) as Error & RegistrationSubmitFailure;
    error.sectionKey = failure.sectionKey;
    error.sectionIndex = failure.sectionIndex;
    error.sectionType = failure.sectionType;
    throw error;
  }
}
