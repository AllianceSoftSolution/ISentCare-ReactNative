import apiClient, { professionalApiClient } from '@/api/apiClient';
import { formatApiFailure } from '@/api/work';
import { appendUploadAsync, multipartRequestConfig, type SelectedUpload } from '@/utils/upload';

export type CatalogOption = { id: number; name: string };

export type LicenseRecord = {
  id: number;
  number?: string;
  expiry_date?: string;
  status?: string;
  is_renewal?: boolean;
  profession?: CatalogOption | number | null;
  primary_state?: CatalogOption | number | null;
  state?: CatalogOption[] | number[] | null;
};

export type EmploymentRecord = {
  id: number;
  company?: string;
  job_title?: string;
  supervisor?: string;
  telephone?: string;
  address?: string;
  duration?: string | number | null;
  leaving_reason?: string;
  from_date?: string | null;
  to_date?: string | null;
};

export type EducationRecord = {
  id: number;
  institute?: string;
  degree?: string;
  majors?: string;
  city?: string;
  state?: string;
  duration?: string | number | null;
  /** Legacy field; new records use graduated instead. */
  gpa?: number | string | null;
  graduated?: boolean | null;
  country?: CatalogOption | number | null;
  start_date?: string | null;
  end_date?: string | null;
};

export type OtherAttachmentRecord = {
  id: number;
  title?: string;
  file?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type AttachmentRecord = {
  id: number;
  type?: string;
  /** Raw AttachmentType code from the API (e.g. CP for CPR). */
  type_code?: string;
  file?: string | null;
  expiry_date?: string | null;
};

export function isCprAttachment(record: Pick<AttachmentRecord, 'type' | 'type_code'>) {
  if (record.type_code === 'CP') return true;
  return String(record.type || '').toLowerCase().includes('cpr');
}

export type ResumeRecord = {
  resume?: string | null;
  has_resume?: boolean;
};

export type ExtraAttachmentRecord = {
  id: number;
  file?: string | null;
  expiry_date?: string | null;
  category?: CatalogOption | string | number | null;
};

export const CREDENTIAL_UPLOAD_TYPES = [
  { key: 'physical', label: 'Physical Exam' },
  { key: 'x_ray', label: 'TB Test or Chest X-Ray' },
  { key: 'covid', label: 'Covid-19 Vaccination' },
  { key: 'dementia', label: 'Dementia Training Proof' },
  { key: 'flue', label: 'Flu Vaccination' },
  { key: 'cpr', label: 'CPR Card or Certificate' },
] as const;

export type CredentialUploadKey = (typeof CREDENTIAL_UPLOAD_TYPES)[number]['key'];

function responseError(
  response: { status?: number; problem?: string | null; data?: unknown },
  fallback: string,
) {
  return formatApiFailure(response, fallback);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function extractList<T extends { id?: unknown }>(data: unknown): T[] {
  if (Array.isArray(data)) return data.filter((item) => isRecord(item)) as T[];
  if (isRecord(data) && Array.isArray(data.results)) {
    return data.results.filter((item) => isRecord(item)) as T[];
  }
  throw new Error('The server returned an invalid list.');
}

function extractOptions(data: unknown): CatalogOption[] {
  const rows = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.results)
      ? data.results
      : null;
  if (!rows) throw new Error('The server returned an invalid options list.');
  return rows
    .filter((item): item is CatalogOption => (
      isRecord(item)
      && typeof item.id === 'number'
      && typeof item.name === 'string'
    ));
}

export function optionId(value: CatalogOption | number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && typeof value.id === 'number') return value.id;
  return null;
}

export function optionName(value: CatalogOption | number | string | null | undefined): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name;
  return '';
}

export function licenseStatusLabel(status?: string | null) {
  if (status === 'A') return 'Approved';
  if (status === 'P') return 'Pending';
  if (status === 'R') return 'Rejected';
  return status || '—';
}

export function isLicenseExpired(expiryDate?: string | null) {
  if (!expiryDate) return false;
  const parsed = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return parsed < today;
}

export async function fetchCatalogOptions(
  endpoint: 'professions' | 'states' | 'countries',
): Promise<CatalogOption[]> {
  const pageSize = endpoint === 'professions' ? 100 : 500;
  const response = await apiClient.get<unknown>(`/${endpoint}/?page=1&page_size=${pageSize}`);
  if (!response.ok) {
    throw new Error(responseError(response, `Unable to load ${endpoint}.`));
  }
  return extractOptions(response.data);
}

export async function fetchLicenses(): Promise<LicenseRecord[]> {
  const response = await professionalApiClient.get<unknown>('/licenses/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load licenses.'));
  return extractList<LicenseRecord>(response.data);
}

export async function createLicense(payload: {
  number: string;
  expiry_date: string;
  profession: number;
  primary_state: number;
  state: number[];
}): Promise<LicenseRecord> {
  const response = await professionalApiClient.post<LicenseRecord>('/licenses/', payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to add license.'));
  return response.data as LicenseRecord;
}

export async function renewLicense(
  id: number,
  payload: {
    number: string;
    expiry_date: string;
    profession: number;
    primary_state: number;
    state: number[];
  },
): Promise<LicenseRecord> {
  const response = await professionalApiClient.patch<LicenseRecord>(`/licenses/${id}/`, payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to renew license.'));
  return response.data as LicenseRecord;
}

export async function fetchEmployments(): Promise<EmploymentRecord[]> {
  const response = await professionalApiClient.get<unknown>('/employements/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load employment history.'));
  return extractList<EmploymentRecord>(response.data);
}

export async function createEmployment(payload: {
  company: string;
  job_title: string;
  supervisor: string;
  telephone: string;
  address: string;
  duration: string;
  leaving_reason: string;
}): Promise<EmploymentRecord> {
  const response = await professionalApiClient.post<EmploymentRecord>('/employements/', payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to add employment history.'));
  return response.data as EmploymentRecord;
}

export async function updateEmployment(
  id: number,
  payload: {
    company: string;
    job_title: string;
    supervisor: string;
    telephone: string;
    address: string;
    duration: string;
    leaving_reason: string;
  },
): Promise<EmploymentRecord> {
  const response = await professionalApiClient.patch<EmploymentRecord>(`/employements/${id}/`, payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to update employment history.'));
  return response.data as EmploymentRecord;
}

export async function deleteEmployment(id: number): Promise<void> {
  const response = await professionalApiClient.delete(`/employements/${id}/`);
  if (!response.ok) throw new Error(responseError(response, 'Unable to delete employment history.'));
}

export async function fetchEducations(): Promise<EducationRecord[]> {
  const response = await professionalApiClient.get<unknown>('/educations/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load education.'));
  return extractList<EducationRecord>(response.data);
}

export async function createEducation(payload: {
  country: number;
  state: string;
  institute: string;
  degree: string;
  majors: string;
  city: string;
  duration: string;
  graduated: boolean;
}): Promise<EducationRecord> {
  const response = await professionalApiClient.post<EducationRecord>('/educations/', payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to add education.'));
  return response.data as EducationRecord;
}

export async function updateEducation(
  id: number,
  payload: {
    country: number;
    state: string;
    institute: string;
    degree: string;
    majors: string;
    city: string;
    duration: string;
    graduated: boolean;
  },
): Promise<EducationRecord> {
  const response = await professionalApiClient.patch<EducationRecord>(`/educations/${id}/`, payload);
  if (!response.ok) throw new Error(responseError(response, 'Unable to update education.'));
  return response.data as EducationRecord;
}

export async function deleteEducation(id: number): Promise<void> {
  const response = await professionalApiClient.delete(`/educations/${id}/`);
  if (!response.ok) throw new Error(responseError(response, 'Unable to delete education.'));
}

export async function fetchAttachments(): Promise<AttachmentRecord[]> {
  const response = await professionalApiClient.get<unknown>('/attachments/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load attachments.'));
  return extractList<AttachmentRecord>(response.data);
}

export async function fetchResume(): Promise<ResumeRecord> {
  const response = await professionalApiClient.get<ResumeRecord>('/resume/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load resume.'));
  return response.data ?? { resume: null, has_resume: false };
}

export type ExtraAttachmentGroup = 'IA' | 'ID' | 'AU';

export type ExtraAttachmentCategoryOption = CatalogOption & {
  category: ExtraAttachmentGroup;
};

export async function fetchExtraAttachments(): Promise<ExtraAttachmentRecord[]> {
  const response = await professionalApiClient.get<unknown>('/extra_attachments/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load eligibility documents.'));
  return extractList<ExtraAttachmentRecord>(response.data);
}

export async function fetchExtraAttachmentCategories(): Promise<ExtraAttachmentCategoryOption[]> {
  const groups: ExtraAttachmentGroup[] = ['IA', 'ID', 'AU'];
  const responses = await Promise.all(
    groups.map((group) =>
      professionalApiClient.get<CatalogOption[]>(`/attachments/attachment_category/?category=${group}`),
    ),
  );
  const categories: ExtraAttachmentCategoryOption[] = [];
  responses.forEach((response, index) => {
    if (!response.ok) {
      throw new Error(responseError(response, `Unable to load ${groups[index]} document types.`));
    }
    if (!Array.isArray(response.data)) {
      throw new Error('The server returned invalid employment document types.');
    }
    categories.push(
      ...response.data.map((option) => ({
        id: Number(option.id),
        name: String(option.name ?? ''),
        category: groups[index],
      })),
    );
  });
  return categories;
}

/** Replace the professional's EEV document package (identity+employment, or identity + authorization). */
export async function uploadExtraAttachments(payload: {
  category1Id: number;
  file1: SelectedUpload;
  expiryDate1?: string | null;
  category2Id?: number | null;
  file2?: SelectedUpload | null;
  expiryDate2?: string | null;
}): Promise<void> {
  const formData = new FormData();
  formData.append('category_1', String(payload.category1Id));
  await appendUploadAsync(formData, 'file_1', payload.file1);
  if (payload.expiryDate1) formData.append('expiry_date_1', payload.expiryDate1);
  if (payload.category2Id != null && payload.file2) {
    formData.append('category_2', String(payload.category2Id));
    await appendUploadAsync(formData, 'file_2', payload.file2);
    if (payload.expiryDate2) formData.append('expiry_date_2', payload.expiryDate2);
  }
  const response = await professionalApiClient.post('/extra_attachments/', formData, multipartRequestConfig);
  if (!response.ok) throw new Error(responseError(response, 'Unable to update eligibility documents.'));
}

export async function uploadCredential(payload: {
  key: CredentialUploadKey;
  file: SelectedUpload;
  expiryDate?: string | null;
}): Promise<void> {
  const formData = new FormData();
  await appendUploadAsync(formData, payload.key, payload.file);
  if (payload.key === 'cpr') {
    if (!payload.expiryDate) throw new Error('CPR expiry date is required.');
    formData.append('cpr_exp', payload.expiryDate);
  }
  const response = await professionalApiClient.post('/attachments/', formData, multipartRequestConfig);
  if (!response.ok) throw new Error(responseError(response, 'Unable to upload credential.'));
}

export async function replaceAttachment(
  id: number,
  payload: { file?: SelectedUpload | null; expiryDate?: string | null },
): Promise<void> {
  const formData = new FormData();
  if (payload.file) await appendUploadAsync(formData, 'file', payload.file);
  if (payload.expiryDate) formData.append('expiry_date', payload.expiryDate);
  const response = await professionalApiClient.patch(
    `/attachments/${id}/`,
    formData,
    multipartRequestConfig,
  );
  if (!response.ok) throw new Error(responseError(response, 'Unable to update attachment.'));
}

export async function deleteAttachment(id: number): Promise<void> {
  const response = await professionalApiClient.delete(`/attachments/${id}/`);
  if (!response.ok) throw new Error(responseError(response, 'Unable to delete attachment.'));
}

export async function uploadResume(file: SelectedUpload): Promise<ResumeRecord> {
  const formData = new FormData();
  await appendUploadAsync(formData, 'resume', file);
  const response = await professionalApiClient.post<ResumeRecord>(
    '/resume/',
    formData,
    multipartRequestConfig,
  );
  if (!response.ok) throw new Error(responseError(response, 'Unable to upload resume.'));
  return response.data ?? { resume: null, has_resume: true };
}

export async function deleteResume(): Promise<void> {
  // ResumeViewSet.destroy is routed as a detail URL (DELETE /resume/{pk}/),
  // not the list URL. The view ignores pk and clears the signed-in professional's resume.
  const response = await professionalApiClient.delete('/resume/me/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to delete resume.'));
}

export async function fetchOtherAttachments(): Promise<OtherAttachmentRecord[]> {
  const response = await professionalApiClient.get<unknown>('/other_attachments/');
  if (!response.ok) throw new Error(responseError(response, 'Unable to load other documents.'));
  return extractList<OtherAttachmentRecord>(response.data);
}

export async function createOtherAttachment(payload: {
  title: string;
  file: SelectedUpload;
}): Promise<OtherAttachmentRecord> {
  const formData = new FormData();
  formData.append('title', payload.title.trim());
  await appendUploadAsync(formData, 'file', payload.file);
  const response = await professionalApiClient.post<OtherAttachmentRecord>(
    '/other_attachments/',
    formData,
    multipartRequestConfig,
  );
  if (!response.ok) throw new Error(responseError(response, 'Unable to add other document.'));
  return response.data as OtherAttachmentRecord;
}

export async function updateOtherAttachment(
  id: number,
  payload: { title: string; file?: SelectedUpload | null },
): Promise<OtherAttachmentRecord> {
  const formData = new FormData();
  formData.append('title', payload.title.trim());
  if (payload.file) await appendUploadAsync(formData, 'file', payload.file);
  const response = await professionalApiClient.patch<OtherAttachmentRecord>(
    `/other_attachments/${id}/`,
    formData,
    multipartRequestConfig,
  );
  if (!response.ok) throw new Error(responseError(response, 'Unable to update other document.'));
  return response.data as OtherAttachmentRecord;
}

export async function deleteOtherAttachment(id: number): Promise<void> {
  const response = await professionalApiClient.delete(`/other_attachments/${id}/`);
  if (!response.ok) throw new Error(responseError(response, 'Unable to delete other document.'));
}
