import type {
  AttachmentRecord,
  EducationRecord,
  EmploymentRecord,
  ExtraAttachmentRecord,
  LicenseRecord,
  OtherAttachmentRecord,
  ResumeRecord,
} from '@/api/profileRecords';

export type EditableSection = 'employment-history' | 'education' | 'licenses' | 'attachments';

/** Soft TTL: show cache immediately, revalidate in background after this age. */
export const PROFILE_RECORDS_TTL_MS = 60_000;

export type CatalogOption = { id: number; name: string };

export type AttachmentsBundle = {
  attachments: AttachmentRecord[];
  otherAttachments: OtherAttachmentRecord[];
  resume: ResumeRecord;
  extraAttachments: ExtraAttachmentRecord[];
};

type SectionPayloadMap = {
  'employment-history': EmploymentRecord[];
  education: {
    educations: EducationRecord[];
    countries: CatalogOption[];
  };
  licenses: {
    licenses: LicenseRecord[];
    professions: CatalogOption[];
    states: CatalogOption[];
  };
  attachments: AttachmentsBundle;
};

type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

const cache: {
  [K in EditableSection]?: CacheEntry<SectionPayloadMap[K]>;
} = {};

export function getCachedSection<K extends EditableSection>(
  section: K,
): CacheEntry<SectionPayloadMap[K]> | null {
  return (cache[section] as CacheEntry<SectionPayloadMap[K]> | undefined) ?? null;
}

export function setCachedSection<K extends EditableSection>(
  section: K,
  data: SectionPayloadMap[K],
) {
  cache[section] = {
    data,
    updatedAt: Date.now(),
  } as (typeof cache)[K];
}

export function isCacheFresh(updatedAt: number, ttlMs = PROFILE_RECORDS_TTL_MS) {
  return Date.now() - updatedAt < ttlMs;
}

export function invalidateProfileRecordsCache(section?: EditableSection) {
  if (section) {
    delete cache[section];
    return;
  }
  (Object.keys(cache) as EditableSection[]).forEach((key) => {
    delete cache[key];
  });
}
