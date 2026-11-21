import apiClient, { professionalApiClient } from '@/api/apiClient';
import {
  clearRegistrationDrafts,
  fetchMobileOnboardingDraft,
  saveMobileOnboardingDraft,
} from '@/api/registrationDraft';
import {
  appendSectionUpload,
  appendSectionValue,
  submitRegistrationSections,
  type RegistrationSectionType,
  type RegistrationSubmitSection,
} from '@/api/registrationSubmit';
import { clearSession, restoreSession } from '@/api/session';
import { formatApiFailure } from '@/api/work';
import {
  FORM_PRIMARY,
  IconDateField,
  IconTextInput,
  normalizeApiDate,
} from '@/components/ui/RegistrationFields';
import { SignaturePad, type SignatureStrokes } from '@/components/ui/SignaturePad';
import { Colors, Spacing } from '@/constants/theme';
import useAuthStore from '@/store/authStore';
import {
  formatPhoneNumber,
  isValidUsPhone,
  normalizePhoneInput,
  US_PHONE_ERROR,
  US_PHONE_INPUT_MAX_LENGTH,
} from '@/utils/phone';
import {
  deleteLocalStorageItem,
  getLocalStorageItem,
  setLocalStorageItem,
} from '@/utils/storage';
import type { SelectedUpload } from '@/utils/upload';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Option = { id: number; name: string };
type AttachmentGroup = 'IA' | 'AU' | 'ID';
type AttachmentCategory = Option & { category: AttachmentGroup };
type AttachmentName = 'physical' | 'x_ray' | 'covid' | 'dementia' | 'flue' | 'cpr';
type AttachmentFiles = Record<AttachmentName, SelectedUpload | null>;
type OtherDocDraft = { title: string; file: SelectedUpload | null };
type LicenseDraft = {
  selectedProfession: Option | null;
  licenseNumber: string;
  isMultiState: boolean;
  licenseStates: Option[];
  primaryState: Option | null;
  expiryDate: string;
};
type ExperienceDraft = {
  company: string;
  jobTitle: string;
  supervisor: string;
  telephone: string;
  address: string;
  duration: string;
  leaving: string;
};
type EducationDraft = {
  country: Option | null;
  state: string;
  institute: string;
  degree: string;
  majors: string;
  city: string;
  duration: string;
  graduated: 'true' | 'false' | '';
};
type ReferenceDraft = {
  employer: string;
  jobTitle: string;
  email: string;
  phone: string;
  position: string;
  contact: string;
};
type OnboardingSection = 'license' | 'experience' | 'education' | 'documents' | 'resume' | 'eligibility' | 'emergency' | 'references';

const MAX_REFERENCES = 2;

const emptyLicense = (): LicenseDraft => ({
  selectedProfession: null,
  licenseNumber: '',
  isMultiState: false,
  licenseStates: [],
  primaryState: null,
  expiryDate: '',
});

const emptyExperience = (): ExperienceDraft => ({
  company: '',
  jobTitle: '',
  supervisor: '',
  telephone: '',
  address: '',
  duration: '',
  leaving: '',
});

const emptyEducation = (): EducationDraft => ({
  country: null,
  state: '',
  institute: '',
  degree: '',
  majors: '',
  city: '',
  duration: '',
  graduated: '',
});

const emptyReference = (): ReferenceDraft => ({
  employer: '',
  jobTitle: '',
  email: '',
  phone: '',
  position: '',
  contact: '',
});

function licenseHasAnyValue(entry: LicenseDraft) {
  return Boolean(
    entry.selectedProfession
    || entry.licenseNumber.trim()
    || entry.licenseStates.length
    || entry.primaryState
    || entry.expiryDate.trim(),
  );
}

function licenseIsComplete(entry: LicenseDraft) {
  return Boolean(
    entry.selectedProfession
    && entry.licenseNumber.trim()
    && entry.licenseStates.length
    && entry.primaryState
    && normalizeApiDate(entry.expiryDate),
  );
}

function experienceHasAnyValue(entry: ExperienceDraft) {
  return Boolean(
    entry.company.trim()
    || entry.jobTitle.trim()
    || entry.supervisor.trim()
    || entry.telephone.trim()
    || entry.address.trim()
    || entry.duration.trim()
    || entry.leaving.trim(),
  );
}

function experienceIsComplete(entry: ExperienceDraft) {
  return Boolean(
    entry.company.trim()
    && entry.jobTitle.trim()
    && entry.supervisor.trim()
    && entry.telephone.trim()
    && entry.address.trim()
    && entry.duration.trim()
    && entry.leaving.trim()
    && /^\d{1,3}(\.\d)?$/.test(entry.duration.trim())
    && Number(entry.duration) <= 999.9
    && isValidUsPhone(entry.telephone),
  );
}

function educationHasAnyValue(entry: EducationDraft) {
  return Boolean(
    entry.country
    || entry.state.trim()
    || entry.institute.trim()
    || entry.degree.trim()
    || entry.majors.trim()
    || entry.city.trim()
    || entry.duration.trim()
    || entry.graduated,
  );
}

function educationIsComplete(entry: EducationDraft) {
  return Boolean(
    entry.country
    && entry.state.trim()
    && entry.institute.trim()
    && entry.degree.trim()
    && entry.majors.trim()
    && entry.city.trim()
    && entry.duration.trim()
    && /^\d{1,3}(\.\d)?$/.test(entry.duration.trim())
    && Number(entry.duration) <= 999.9
    && (entry.graduated === 'true' || entry.graduated === 'false'),
  );
}

function referenceHasAnyValue(entry: ReferenceDraft) {
  return Boolean(
    entry.employer.trim()
    || entry.jobTitle.trim()
    || entry.email.trim()
    || entry.phone.trim()
    || entry.position.trim()
    || entry.contact.trim(),
  );
}

function referenceIsComplete(entry: ReferenceDraft) {
  if (!(
    entry.employer.trim()
    && entry.jobTitle.trim()
    && entry.phone.trim()
    && entry.position.trim()
    && entry.contact.trim()
  )) return false;
  if (entry.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email.trim())) return false;
  return isValidUsPhone(entry.phone);
}

const SECTION_API_TYPE: Record<OnboardingSection, RegistrationSectionType> = {
  license: 'licenses',
  experience: 'employements',
  education: 'educations',
  documents: 'attachments',
  resume: 'resume',
  eligibility: 'extra_attachments',
  emergency: 'employee_emergency_contacts',
  references: 'references',
};

const DRAFT_KEY = 'professional_onboarding_draft';
const ONBOARDING_SECTIONS: { id: OnboardingSection; title: string }[] = [
  { id: 'license', title: 'License' },
  { id: 'experience', title: 'Work Experience' },
  { id: 'education', title: 'Education' },
  { id: 'documents', title: 'Attachments' },
  { id: 'resume', title: 'Resume' },
  { id: 'eligibility', title: 'Employment Eligibility' },
  { id: 'emergency', title: 'Emergency Contact' },
  { id: 'references', title: 'Reference & Declaration' },
];
const SECTION_ICONS: Record<OnboardingSection, React.ComponentProps<typeof MaterialIcons>['name']> = {
  license: 'badge',
  experience: 'work',
  education: 'school',
  documents: 'folder',
  resume: 'description',
  eligibility: 'verified-user',
  emergency: 'contact-phone',
  references: 'fact-check',
};
const ATTACHMENT_GROUPS: { id: AttachmentGroup; name: string }[] = [
  { id: 'IA', name: 'Both identity & employment' },
  { id: 'ID', name: 'Identity document' },
  { id: 'AU', name: 'Employment authorization' },
];

/** Matches website EEV path radios: one combined doc (IA) or identity + authorization (ID + AU). */
type EevDocPath = 'IA' | 'BC';

function isOption(value: unknown): value is Option {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as Option).id === 'number' &&
      typeof (value as Option).name === 'string',
  );
}

function restoreUpload(value: unknown): SelectedUpload | null {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as SelectedUpload).uri !== 'string' ||
    typeof (value as SelectedUpload).name !== 'string'
  ) {
    return null;
  }
  const upload = value as SelectedUpload;
  // Draft JSON cannot keep File/Blob objects. After a browser refresh, blob:
  // URLs are revoked, so restoring them only causes "Failed to fetch" on submit.
  if (
    Platform.OS === 'web'
    && (upload.uri.startsWith('blob:') || upload.uri.startsWith('data:'))
    && !upload.file
  ) {
    return null;
  }
  return { uri: upload.uri, name: upload.name, mimeType: upload.mimeType, size: upload.size, file: upload.file ?? null };
}

function isSignatureStrokes(value: unknown): value is SignatureStrokes {
  return (
    Array.isArray(value) &&
    value.every(
      (stroke) =>
        Array.isArray(stroke) &&
        stroke.every(
          (point) =>
            point &&
            typeof point === 'object' &&
            typeof (point as { x?: unknown }).x === 'number' &&
            typeof (point as { y?: unknown }).y === 'number',
        ),
    )
  );
}

function uploadFingerprint(upload: SelectedUpload | null) {
  return upload ? `${upload.uri}:${upload.name}:${upload.mimeType || ''}:${upload.size || ''}` : '';
}

function decimalInput(value: string, maxWholeDigits: number, maxDecimalPlaces = 1) {
  const cleaned = value.replace(/[^\d.]/g, '');
  const decimalIndex = cleaned.indexOf('.');
  const whole = (decimalIndex === -1 ? cleaned : cleaned.slice(0, decimalIndex)).slice(0, maxWholeDigits);
  if (decimalIndex === -1) return whole;
  const fraction = cleaned
    .slice(decimalIndex + 1)
    .replace(/\./g, '')
    .slice(0, maxDecimalPlaces);
  return `${whole || '0'}.${fraction}`;
}

function boundedDecimalInput(
  value: string,
  current: string,
  maxWholeDigits: number,
  maximum: number,
) {
  const next = decimalInput(value, maxWholeDigits);
  if (next.endsWith('.')) return next;
  return next && Number(next) > maximum ? current : next;
}

const emptyAttachments: AttachmentFiles = {
  physical: null,
  x_ray: null,
  covid: null,
  dementia: null,
  flue: null,
  cpr: null,
};

const emptyOtherDoc = (): OtherDocDraft => ({ title: '', file: null });

function apiError(response: { status?: number; problem?: string; data?: unknown }, fallback: string) {
  const body = response.data;
  if (body && typeof body === 'object') {
    const data = body as { detail?: unknown; details?: unknown; [key: string]: unknown };
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.details === 'string') return data.details;
    const field = Object.entries(data).find(([, value]) => typeof value === 'string' || Array.isArray(value));
    if (field) return `${field[0]}: ${Array.isArray(field[1]) ? field[1].join(', ') : field[1]}`;
  }
  return formatApiFailure(response, fallback);
}

function SectionHeading({
  title,
  icon,
}: {
  title: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
}) {
  return (
    <View style={styles.sectionHeading}>
      <MaterialIcons name={icon} size={21} color={FORM_PRIMARY} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SelectField({
  label,
  icon,
  value,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  value: Option | null;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.selectField} onPress={onPress}>
      <MaterialIcons name={icon} size={20} color="#6b7280" />
      <Text style={[styles.selectText, { color: value ? '#263341' : '#7b8490' }]}>
        {value?.name || `Select ${label}`}
      </Text>
      <MaterialIcons name="arrow-drop-down" size={22} color="#6b7280" />
    </Pressable>
  );
}

function OptionModal({
  visible,
  title,
  options,
  onClose,
  onSelect,
  selectedIds,
  multi,
}: {
  visible: boolean;
  title: string;
  options: Option[];
  onClose: () => void;
  onSelect: (option: Option) => void;
  selectedIds?: number[];
  multi?: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={styles.optionList}>
            {options.map((option) => {
              const selected = selectedIds?.includes(option.id) ?? false;
              return (
                <Pressable key={option.id} style={styles.optionRow} onPress={() => onSelect(option)}>
                  <Text style={styles.optionText}>{option.name}</Text>
                  {selected || !multi ? (
                    <MaterialIcons
                      name={selected ? 'check-box' : 'check-box-outline-blank'}
                      size={21}
                      color={FORM_PRIMARY}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>{multi ? 'Done' : 'Close'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const colors = Colors.light;

  const fieldColors = {
    backgroundColor: colors.backgroundElement,
    textColor: colors.text,
  };

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [submittedSections, setSubmittedSections] = useState<Partial<Record<OnboardingSection, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const [professions, setProfessions] = useState<Option[]>([]);
  const [states, setStates] = useState<Option[]>([]);
  const [countries, setCountries] = useState<Option[]>([]);
  const [attachmentCategories, setAttachmentCategories] = useState<AttachmentCategory[]>([]);
  const [licenseEntries, setLicenseEntries] = useState<LicenseDraft[]>([emptyLicense()]);
  const [activeLicenseIndex, setActiveLicenseIndex] = useState(0);
  const [professionModal, setProfessionModal] = useState(false);
  const [licenseStateModal, setLicenseStateModal] = useState(false);
  const [primaryStateModal, setPrimaryStateModal] = useState(false);

  const [experienceEntries, setExperienceEntries] = useState<ExperienceDraft[]>([emptyExperience()]);
  const [educationEntries, setEducationEntries] = useState<EducationDraft[]>([emptyEducation()]);
  const [activeEducationIndex, setActiveEducationIndex] = useState(0);
  const [eduCountryModal, setEduCountryModal] = useState(false);

  const [attachmentFiles, setAttachmentFiles] = useState<AttachmentFiles>(emptyAttachments);
  const [otherDocs, setOtherDocs] = useState<OtherDocDraft[]>([emptyOtherDoc()]);
  const [cprExpiry, setCprExpiry] = useState('');
  const [resume, setResume] = useState<SelectedUpload | null>(null);
  const [citizenship, setCitizenship] = useState<'citizen_of_US' | 'non_citizen_of_US' | 'permanent_resident' | 'noncitizen_authorized'>('citizen_of_US');
  const [uscis, setUscis] = useState('');
  const [workAuthorizationExpiry, setWorkAuthorizationExpiry] = useState('');
  const [eevDocPath, setEevDocPath] = useState<EevDocPath>('IA');
  const [eevCategory, setEevCategory] = useState<AttachmentCategory | null>(null);
  const [eevSecondCategory, setEevSecondCategory] = useState<AttachmentCategory | null>(null);
  const [eevFile, setEevFile] = useState<SelectedUpload | null>(null);
  const [eevSecondFile, setEevSecondFile] = useState<SelectedUpload | null>(null);
  const [eevCategoryModal, setEevCategoryModal] = useState(false);
  const [eevSecondCategoryModal, setEevSecondCategoryModal] = useState(false);

  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyAddress, setEmergencyAddress] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');

  const [referenceEntries, setReferenceEntries] = useState<ReferenceDraft[]>([emptyReference()]);
  const [referenceName, setReferenceName] = useState('');
  const [referenceSignature, setReferenceSignature] = useState('');
  const [referenceSignatureStrokes, setReferenceSignatureStrokes] = useState<SignatureStrokes>([]);
  const [sanctioned, setSanctioned] = useState('');
  const [sanctionedExplain, setSanctionedExplain] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [pendingActionExplain, setPendingActionExplain] = useState('');

  const draftJson = JSON.stringify({
    licenseEntries,
    experienceEntries,
    educationEntries,
    referenceEntries,
    referenceName,
    referenceSignature,
    referenceSignatureStrokes,
    attachmentFiles: Object.fromEntries(
      Object.entries(attachmentFiles).map(([key, file]) => [
        key,
        file ? { uri: file.uri, name: file.name, mimeType: file.mimeType, size: file.size } : null,
      ]),
    ),
    otherDocs: otherDocs.map((doc) => ({
      title: doc.title,
      file: doc.file
        ? { uri: doc.file.uri, name: doc.file.name, mimeType: doc.file.mimeType, size: doc.file.size }
        : null,
    })),
    cprExpiry,
    resume: resume ? { uri: resume.uri, name: resume.name, mimeType: resume.mimeType, size: resume.size } : null,
    citizenship,
    uscis,
    workAuthorizationExpiry,
    eevDocPath,
    eevCategory,
    eevSecondCategory,
    eevFile: eevFile ? { uri: eevFile.uri, name: eevFile.name, mimeType: eevFile.mimeType, size: eevFile.size } : null,
    eevSecondFile: eevSecondFile
      ? { uri: eevSecondFile.uri, name: eevSecondFile.name, mimeType: eevSecondFile.mimeType, size: eevSecondFile.size }
      : null,
    emergencyName,
    emergencyPhone,
    emergencyAddress,
    emergencyRelationship,
    sanctioned,
    sanctionedExplain,
    pendingAction,
    pendingActionExplain,
    submittedSections,
    sectionIndex,
  });

  const applyDraft = useCallback((draft: Record<string, unknown>) => {
    const text = (key: string) => (typeof draft[key] === 'string' ? draft[key] as string : '');
    if (Array.isArray(draft.licenseEntries) && draft.licenseEntries.length) {
      const restored = draft.licenseEntries
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          selectedProfession: isOption(item.selectedProfession) ? item.selectedProfession : null,
          licenseNumber: typeof item.licenseNumber === 'string' ? item.licenseNumber : '',
          isMultiState: item.isMultiState === true,
          licenseStates: Array.isArray(item.licenseStates) ? item.licenseStates.filter(isOption) : [],
          primaryState: isOption(item.primaryState) ? item.primaryState : null,
          expiryDate: typeof item.expiryDate === 'string' ? item.expiryDate : '',
        }));
      setLicenseEntries(restored.length ? restored : [emptyLicense()]);
    } else if (isOption(draft.selectedProfession) || typeof draft.licenseNumber === 'string') {
      // Migrate drafts saved before multi-license support.
      setLicenseEntries([{
        selectedProfession: isOption(draft.selectedProfession) ? draft.selectedProfession : null,
        licenseNumber: text('licenseNumber'),
        isMultiState: draft.isMultiState === true,
        licenseStates: Array.isArray(draft.licenseStates) ? draft.licenseStates.filter(isOption) : [],
        primaryState: isOption(draft.primaryState) ? draft.primaryState : null,
        expiryDate: text('expiryDate'),
      }]);
    }
    if (Array.isArray(draft.experienceEntries) && draft.experienceEntries.length) {
      const restored = draft.experienceEntries
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          company: typeof item.company === 'string' ? item.company : '',
          jobTitle: typeof item.jobTitle === 'string' ? item.jobTitle : '',
          supervisor: typeof item.supervisor === 'string' ? item.supervisor : '',
          telephone: normalizePhoneInput(typeof item.telephone === 'string' ? item.telephone : ''),
          address: typeof item.address === 'string' ? item.address : '',
          duration: decimalInput(typeof item.duration === 'string' ? item.duration : '', 3),
          leaving: typeof item.leaving === 'string' ? item.leaving : '',
        }));
      setExperienceEntries(restored.length ? restored : [emptyExperience()]);
    } else if (text('empCompany') || text('empJobTitle')) {
      // Migrate drafts saved before multi-experience support.
      setExperienceEntries([{
        company: text('empCompany'),
        jobTitle: text('empJobTitle'),
        supervisor: text('empSupervisor'),
        telephone: normalizePhoneInput(text('empTelephone')),
        address: text('empAddress'),
        duration: decimalInput(text('empDuration'), 3),
        leaving: text('empLeaving'),
      }]);
    }
    if (Array.isArray(draft.educationEntries) && draft.educationEntries.length) {
      const restored: EducationDraft[] = draft.educationEntries
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          country: isOption(item.country) ? item.country : null,
          state: typeof item.state === 'string' ? item.state : '',
          institute: typeof item.institute === 'string' ? item.institute : '',
          degree: typeof item.degree === 'string' ? item.degree : '',
          majors: typeof item.majors === 'string' ? item.majors : '',
          city: typeof item.city === 'string' ? item.city : '',
          duration: decimalInput(typeof item.duration === 'string' ? item.duration : '', 3),
          graduated: item.graduated === 'true' || item.graduated === 'false' ? item.graduated : '',
        }));
      setEducationEntries(restored.length ? restored : [emptyEducation()]);
    } else if (text('eduInstitute') || text('eduDegree') || isOption(draft.eduCountry)) {
      // Migrate drafts saved before multi-education support.
      const graduated: EducationDraft['graduated'] =
        draft.eduGraduated === 'true' || draft.eduGraduated === 'false' ? draft.eduGraduated : '';
      setEducationEntries([{
        country: isOption(draft.eduCountry) ? draft.eduCountry : null,
        state: text('eduState'),
        institute: text('eduInstitute'),
        degree: text('eduDegree'),
        majors: text('eduMajors'),
        city: text('eduCity'),
        duration: decimalInput(text('eduDuration'), 3),
        graduated,
      }]);
    }
    if (draft.attachmentFiles && typeof draft.attachmentFiles === 'object') {
      const savedFiles = draft.attachmentFiles as Record<string, unknown>;
      setAttachmentFiles({
        physical: restoreUpload(savedFiles.physical),
        x_ray: restoreUpload(savedFiles.x_ray),
        covid: restoreUpload(savedFiles.covid),
        dementia: restoreUpload(savedFiles.dementia),
        flue: restoreUpload(savedFiles.flue),
        cpr: restoreUpload(savedFiles.cpr),
      });
      const legacyOther = restoreUpload(savedFiles.others);
      if (legacyOther && !Array.isArray(draft.otherDocs)) {
        setOtherDocs([{ title: 'Other document', file: legacyOther }]);
      }
    }
    if (Array.isArray(draft.otherDocs)) {
      const restored = draft.otherDocs
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          title: typeof item.title === 'string' ? item.title : '',
          file: restoreUpload(item.file),
        }));
      setOtherDocs(restored.length ? restored : [emptyOtherDoc()]);
    }
    setCprExpiry(text('cprExpiry'));
    setResume(restoreUpload(draft.resume));
    if (['citizen_of_US', 'non_citizen_of_US', 'permanent_resident', 'noncitizen_authorized'].includes(String(draft.citizenship))) {
      setCitizenship(draft.citizenship as typeof citizenship);
    }
    setUscis(text('uscis'));
    setWorkAuthorizationExpiry(text('workAuthorizationExpiry'));
    if (draft.eevDocPath === 'IA' || draft.eevDocPath === 'BC') {
      setEevDocPath(draft.eevDocPath);
    } else if (draft.eevGroup === 'AU' || draft.eevGroup === 'ID') {
      // Legacy drafts used IA / AU / ID group picker — map AU/ID to the combined path.
      setEevDocPath('BC');
    } else if (draft.eevGroup === 'IA') {
      setEevDocPath('IA');
    }
    if (draft.eevCategory && typeof draft.eevCategory === 'object') {
      const category = draft.eevCategory as AttachmentCategory;
      if (typeof category.id === 'number' && typeof category.name === 'string') setEevCategory(category);
    }
    if (draft.eevSecondCategory && typeof draft.eevSecondCategory === 'object') {
      const category = draft.eevSecondCategory as AttachmentCategory;
      if (typeof category.id === 'number' && typeof category.name === 'string') setEevSecondCategory(category);
    }
    setEevFile(restoreUpload(draft.eevFile));
    setEevSecondFile(restoreUpload(draft.eevSecondFile));
    setEmergencyName(text('emergencyName'));
    setEmergencyPhone(normalizePhoneInput(text('emergencyPhone')));
    setEmergencyAddress(text('emergencyAddress'));
    setEmergencyRelationship(text('emergencyRelationship'));
    if (Array.isArray(draft.referenceEntries) && draft.referenceEntries.length) {
      const restored = draft.referenceEntries
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
        .slice(0, MAX_REFERENCES)
        .map((item) => ({
          employer: typeof item.employer === 'string' ? item.employer : '',
          jobTitle: typeof item.jobTitle === 'string' ? item.jobTitle : '',
          email: typeof item.email === 'string' ? item.email : '',
          phone: normalizePhoneInput(typeof item.phone === 'string' ? item.phone : ''),
          position: typeof item.position === 'string' ? item.position : '',
          contact: typeof item.contact === 'string' ? item.contact : '',
        }));
      setReferenceEntries(restored.length ? restored : [emptyReference()]);
      // Prefer shared signature fields; fall back to the first entry if an older
      // multi-reference draft stored name/signature on each row.
      const first = draft.referenceEntries.find(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
      );
      if (typeof draft.referenceName === 'string' && draft.referenceName) {
        setReferenceName(draft.referenceName);
      } else if (first && typeof first.name === 'string') {
        setReferenceName(first.name);
      }
      if (typeof draft.referenceSignature === 'string' && draft.referenceSignature) {
        setReferenceSignature(draft.referenceSignature);
      } else if (first && typeof first.signature === 'string') {
        setReferenceSignature(first.signature);
      }
      if (isSignatureStrokes(draft.referenceSignatureStrokes)) {
        setReferenceSignatureStrokes(draft.referenceSignatureStrokes);
      } else if (first && isSignatureStrokes(first.signatureStrokes)) {
        setReferenceSignatureStrokes(first.signatureStrokes);
      }
    } else if (text('referenceEmployer') || text('referenceName')) {
      // Migrate drafts saved before multi-reference support.
      setReferenceEntries([{
        employer: text('referenceEmployer'),
        jobTitle: text('referenceJobTitle'),
        email: text('referenceEmail'),
        phone: normalizePhoneInput(text('referencePhone')),
        position: text('referencePosition'),
        contact: text('referenceContact'),
      }]);
      setReferenceName(text('referenceName'));
      setReferenceSignature(text('referenceSignature'));
      if (isSignatureStrokes(draft.referenceSignatureStrokes)) {
        setReferenceSignatureStrokes(draft.referenceSignatureStrokes);
      }
    }
    setSanctioned(text('sanctioned'));
    setSanctionedExplain(text('sanctionedExplain'));
    setPendingAction(text('pendingAction'));
    setPendingActionExplain(text('pendingActionExplain'));
    if (draft.submittedSections && typeof draft.submittedSections === 'object') {
      setSubmittedSections(draft.submittedSections as Partial<Record<OnboardingSection, string>>);
    }
    if (typeof draft.sectionIndex === 'number' && draft.sectionIndex >= 0 && draft.sectionIndex < 8) {
      setSectionIndex(draft.sectionIndex);
    }
  }, []);

  // Refreshing / deep-linking into onboarding skips the splash screen, so the
  // in-memory auth store is empty even when accessToken is still in storage.
  // Restore the session before any authenticated professional API calls.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await restoreSession(true);
        if (!active) return;
        if (status === 'signedOut') {
          router.replace('/(auth)/sign-in');
          return;
        }
        setAuthReady(true);
      } catch (restoreError) {
        if (!active) return;
        setCatalogError(
          restoreError instanceof Error
            ? restoreError.message
            : 'Unable to restore your session. Sign in again to continue onboarding.',
        );
        setCatalogLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    void (async () => {
      try {
        const [localStored, serverDraft] = await Promise.all([
          getLocalStorageItem(DRAFT_KEY),
          fetchMobileOnboardingDraft().catch(() => null),
        ]);
        if (!active) return;

        let localDraft: Record<string, unknown> | null = null;
        if (localStored) {
          try {
            const parsed = JSON.parse(localStored) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              localDraft = parsed as Record<string, unknown>;
            }
          } catch {
            localDraft = null;
          }
        }

        // Prefer the server draft (same behavior as the web app) so progress
        // resumes after login on this or another device.
        const draft = serverDraft ?? localDraft;
        if (draft) {
          const hadWebOnlyUploads = (() => {
            if (Platform.OS !== 'web') return false;
            const files: unknown[] = [
              draft.resume,
              draft.eevFile,
              draft.eevSecondFile,
              ...(Array.isArray(draft.otherDocs) ? draft.otherDocs.map((item) => (
                item && typeof item === 'object' ? (item as { file?: unknown }).file : null
              )) : []),
            ];
            if (draft.attachmentFiles && typeof draft.attachmentFiles === 'object') {
              files.push(...Object.values(draft.attachmentFiles as Record<string, unknown>));
            }
            return files.some((file) => {
              if (!file || typeof file !== 'object') return false;
              const uri = (file as { uri?: unknown }).uri;
              return typeof uri === 'string' && (uri.startsWith('blob:') || uri.startsWith('data:'));
            });
          })();
          applyDraft(draft);
          if (serverDraft) {
            await setLocalStorageItem(DRAFT_KEY, JSON.stringify(serverDraft)).catch(() => undefined);
          }
          setNotice(
            hadWebOnlyUploads
              ? 'Your saved progress was restored, but uploaded files must be selected again in the browser before Submit.'
              : 'Your saved onboarding progress was restored. Continue where you left off.',
          );
        }
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error
              ? `Unable to restore saved progress: ${loadError.message}`
              : 'Unable to restore saved progress.',
          );
        }
      } finally {
        if (active) setDraftLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyDraft, authReady]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = setTimeout(() => {
      void setLocalStorageItem(DRAFT_KEY, draftJson).catch((saveError: unknown) => {
        setError(saveError instanceof Error ? `Unable to save your progress locally: ${saveError.message}` : 'Unable to save your progress locally.');
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [draftJson, draftLoaded]);

  const loadCatalogs = useCallback(async () => {
    try {
      const [professionResponse, stateResponse, countryResponse] = await Promise.all([
        apiClient.get<Option[] | { results?: Option[] }>('/professions/?page=1&page_size=100'),
        apiClient.get<Option[] | { results?: Option[] }>('/states/?page=1&page_size=500'),
        apiClient.get<Option[] | { results?: Option[] }>('/countries/?page=1&page_size=500'),
      ]);
      for (const [response, label] of [
        [professionResponse, 'professions'],
        [stateResponse, 'states'],
        [countryResponse, 'countries'],
      ] as const) {
        if (!response.ok) throw new Error(apiError(response, `Unable to load ${label}`));
      }
      const getList = <T,>(data: T[] | { results?: T[] } | null | undefined) =>
        Array.isArray(data) ? data : data?.results;
      const professionList = getList(professionResponse.data);
      const stateList = getList(stateResponse.data);
      const countryList = getList(countryResponse.data);
      if (!professionList || !stateList || !countryList) {
        throw new Error('The server returned invalid onboarding options.');
      }
      setProfessions(professionList);
      setStates(stateList);
      setCountries(countryList);
      const categoryResponses = await Promise.all(
        ATTACHMENT_GROUPS.map(({ id }) =>
          professionalApiClient.get<Option[]>(`/attachments/attachment_category/?category=${id}`),
        ),
      );
      const categories: AttachmentCategory[] = [];
      categoryResponses.forEach((response, index) => {
        if (!response.ok) {
          throw new Error(apiError(response, `Unable to load ${ATTACHMENT_GROUPS[index].name} document types`));
        }
        if (!Array.isArray(response.data)) {
          throw new Error('The server returned invalid employment document types.');
        }
        categories.push(
          ...response.data.map((option) => ({
            id: Number(option.id),
            name: String(option.name ?? ''),
            category: ATTACHMENT_GROUPS[index].id,
          })),
        );
      });
      setAttachmentCategories(categories);
      setCatalogError(null);
    } catch (loadError) {
      setCatalogError(loadError instanceof Error ? loadError.message : 'Unable to load onboarding options.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    setCatalogLoading(true);
    const timer = setTimeout(() => void loadCatalogs(), 0);
    return () => clearTimeout(timer);
  }, [authReady, loadCatalogs]);

  const retryCatalogs = () => {
    setCatalogLoading(true);
    setCatalogError(null);
    void loadCatalogs();
  };

  const pickDocument = async (type: 'image' | 'resume') => {
    const result = await DocumentPicker.getDocumentAsync({
      type: type === 'resume'
        ? ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        : ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
      file: asset.file,
    } satisfies SelectedUpload;
  };

  const setAttachment = async (key: AttachmentName) => {
    try {
      const selected = await pickDocument('image');
      if (selected) setAttachmentFiles((current) => ({ ...current, [key]: selected }));
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : 'Unable to select the document.');
    }
  };

  const updateLicenseEntry = (index: number, patch: Partial<LicenseDraft>) => {
    setLicenseEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const appendLicenseEntry = (formData: FormData, sectionIndex: number, entry: LicenseDraft) => {
    const formattedExpiryDate = normalizeApiDate(entry.expiryDate);
    if (!entry.selectedProfession || !entry.primaryState || !formattedExpiryDate) {
      throw new Error('Complete the professional license fields before saving.');
    }
    appendSectionValue(formData, sectionIndex, 'number', entry.licenseNumber.trim());
    appendSectionValue(formData, sectionIndex, 'expiry_date', formattedExpiryDate);
    appendSectionValue(formData, sectionIndex, 'profession', entry.selectedProfession.id);
    appendSectionValue(formData, sectionIndex, 'primary_state', entry.primaryState.id);
    entry.licenseStates.forEach((state) => {
      appendSectionValue(formData, sectionIndex, 'state', state.id);
    });
  };

  const appendExperienceEntry = (formData: FormData, sectionIndex: number, entry: ExperienceDraft) => {
    appendSectionValue(formData, sectionIndex, 'company', entry.company.trim());
    appendSectionValue(formData, sectionIndex, 'job_title', entry.jobTitle.trim());
    appendSectionValue(formData, sectionIndex, 'supervisor', entry.supervisor.trim());
    appendSectionValue(formData, sectionIndex, 'telephone', entry.telephone.trim());
    appendSectionValue(formData, sectionIndex, 'address', entry.address.trim());
    appendSectionValue(formData, sectionIndex, 'duration', entry.duration.trim());
    appendSectionValue(formData, sectionIndex, 'leaving_reason', entry.leaving.trim());
  };

  const appendEducationEntry = (formData: FormData, sectionIndex: number, entry: EducationDraft) => {
    if (!entry.country) throw new Error('Complete all required education fields before saving.');
    appendSectionValue(formData, sectionIndex, 'country', entry.country.id);
    appendSectionValue(formData, sectionIndex, 'state', entry.state.trim());
    appendSectionValue(formData, sectionIndex, 'institute', entry.institute.trim());
    appendSectionValue(formData, sectionIndex, 'degree', entry.degree.trim());
    appendSectionValue(formData, sectionIndex, 'majors', entry.majors.trim());
    appendSectionValue(formData, sectionIndex, 'city', entry.city.trim());
    appendSectionValue(formData, sectionIndex, 'duration', entry.duration.trim());
    appendSectionValue(formData, sectionIndex, 'graduated', entry.graduated === 'true');
  };

  const appendReferenceEntry = (formData: FormData, sectionIndex: number, entry: ReferenceDraft) => {
    appendSectionValue(formData, sectionIndex, 'employer', entry.employer.trim());
    appendSectionValue(formData, sectionIndex, 'job_title', entry.jobTitle.trim());
    if (entry.email.trim()) {
      appendSectionValue(formData, sectionIndex, 'email', entry.email.trim());
    }
    appendSectionValue(formData, sectionIndex, 'phone', entry.phone.trim());
    appendSectionValue(formData, sectionIndex, 'position', entry.position.trim());
    appendSectionValue(formData, sectionIndex, 'contact_person', entry.contact.trim());
    // Statement + signature are collected once and applied to every reference.
    appendSectionValue(formData, sectionIndex, 'name', referenceName.trim());
    appendSectionValue(formData, sectionIndex, 'signature', referenceSignature.trim());
    appendSectionValue(formData, sectionIndex, 'agree', true);
  };

  const updateExperienceEntry = (index: number, patch: Partial<ExperienceDraft>) => {
    setExperienceEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const updateEducationEntry = (index: number, patch: Partial<EducationDraft>) => {
    setEducationEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const updateReferenceEntry = (index: number, patch: Partial<ReferenceDraft>) => {
    setReferenceEntries((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, ...patch } : entry
    )));
  };

  const appendOnboardingSection = async (
    formData: FormData,
    sectionIndex: number,
    section: OnboardingSection,
  ) => {
    switch (section) {
      case 'license': {
        const entry = licenseEntries.find(licenseIsComplete) || licenseEntries[0];
        if (!entry) throw new Error('Complete the professional license fields before saving.');
        appendLicenseEntry(formData, sectionIndex, entry);
        return;
      }
      case 'experience': {
        const entry = experienceEntries.find(experienceIsComplete) || experienceEntries[0];
        if (!entry) throw new Error('Complete all required work experience fields before saving.');
        appendExperienceEntry(formData, sectionIndex, entry);
        return;
      }
      case 'education': {
        const entry = educationEntries.find(educationIsComplete) || educationEntries[0];
        if (!entry?.country) throw new Error('Complete all required education fields before saving.');
        appendEducationEntry(formData, sectionIndex, entry);
        return;
      }
      case 'documents': {
        const formattedCprExpiry = normalizeApiDate(cprExpiry);
        for (const [key, file] of Object.entries(attachmentFiles)) {
          if (file) await appendSectionUpload(formData, sectionIndex, key, file);
        }
        if (attachmentFiles.cpr && formattedCprExpiry) {
          appendSectionValue(formData, sectionIndex, 'cpr_exp', formattedCprExpiry);
        }
        for (const doc of otherDocs) {
          if (!doc.file || !doc.title.trim()) continue;
          appendSectionValue(formData, sectionIndex, 'other_title', doc.title.trim());
          await appendSectionUpload(formData, sectionIndex, 'other_file', doc.file);
        }
        return;
      }
      case 'resume':
        if (!resume) throw new Error('Upload your most recent resume before continuing.');
        await appendSectionUpload(formData, sectionIndex, 'resume', resume);
        return;
      case 'eligibility': {
        const formattedWorkAuthorizationExpiry = normalizeApiDate(workAuthorizationExpiry);
        if (!eevCategory) {
          throw new Error(
            eevDocPath === 'IA'
              ? 'Select a document type that establishes both identity and employment eligibility.'
              : 'Select an identity document type.',
          );
        }
        if (!eevFile) {
          throw new Error(
            eevDocPath === 'IA'
              ? 'Upload the selected document.'
              : 'Upload the identity document.',
          );
        }
        if (eevDocPath === 'BC' && !eevSecondCategory) {
          throw new Error('Select an employment authorization document type.');
        }
        if (eevDocPath === 'BC' && !eevSecondFile) {
          throw new Error('Upload the employment authorization document.');
        }
        appendSectionValue(formData, sectionIndex, 'category_1', eevCategory.id);
        await appendSectionUpload(formData, sectionIndex, 'file_1', eevFile);
        if (eevDocPath === 'BC' && eevSecondCategory && eevSecondFile) {
          appendSectionValue(formData, sectionIndex, 'category_2', eevSecondCategory.id);
          await appendSectionUpload(formData, sectionIndex, 'file_2', eevSecondFile);
        }
        appendSectionValue(formData, sectionIndex, 'citizen_of_US', citizenship === 'citizen_of_US');
        appendSectionValue(formData, sectionIndex, 'non_citizen_of_US', citizenship === 'non_citizen_of_US');
        appendSectionValue(formData, sectionIndex, 'permanent_resident', citizenship === 'permanent_resident');
        appendSectionValue(formData, sectionIndex, 'noncitizen_authorized', citizenship === 'noncitizen_authorized');
        if (citizenship === 'permanent_resident') {
          appendSectionValue(formData, sectionIndex, 'uscis', uscis.trim());
        }
        if (citizenship === 'noncitizen_authorized') {
          if (!formattedWorkAuthorizationExpiry) {
            throw new Error('Select a valid work authorization expiry date.');
          }
          appendSectionValue(formData, sectionIndex, 'expire_date', formattedWorkAuthorizationExpiry);
        }
        return;
      }
      case 'emergency':
        appendSectionValue(formData, sectionIndex, 'name', emergencyName.trim());
        appendSectionValue(formData, sectionIndex, 'phone', emergencyPhone.trim());
        appendSectionValue(formData, sectionIndex, 'address', emergencyAddress.trim());
        appendSectionValue(formData, sectionIndex, 'relation_ship', emergencyRelationship.trim());
        return;
      case 'references': {
        const entry = referenceEntries.find(referenceIsComplete) || referenceEntries[0];
        if (!entry) throw new Error('Complete the reference fields and save your signature before saving.');
        appendReferenceEntry(formData, sectionIndex, entry);
        return;
      }
    }
  };

  const finishApplication = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await professionalApiClient.post('/application_questionnaire/', {
        sanctioned_disciplined: sanctioned,
        sanctioned_explain: sanctionedExplain.trim(),
        pending_license_action: pendingAction,
        pending_license_explain: pendingActionExplain.trim(),
        application_complete: true,
      });
      if (!response.ok) throw new Error(apiError(response, 'Unable to submit application'));
      await deleteLocalStorageItem(DRAFT_KEY);
      await clearRegistrationDrafts().catch(() => undefined);
      // Match product flow: after submit, end the session until an admin approves login.
      await clearSession();
      Alert.alert(
        'Application submitted',
        'Your application was submitted successfully. An administrator must approve your account before you can sign in.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }],
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to submit application.');
      throw saveError;
    } finally {
      setLoading(false);
    }
  };

  const validateSection = (section: OnboardingSection) => {
    if (section === 'license') {
      const started = licenseEntries.filter(licenseHasAnyValue);
      if (!started.length) return;
      for (const entry of started) {
        if (!licenseIsComplete(entry)) {
          throw new Error('Complete all fields for each license you started, or clear unused license rows.');
        }
      }
      return;
    }
    if (section === 'experience') {
      const started = experienceEntries.filter(experienceHasAnyValue);
      if (!started.length) {
        throw new Error('Add at least one work experience before continuing.');
      }
      for (const entry of started) {
        if (!experienceIsComplete(entry)) {
          if (!/^\d{1,3}(\.\d)?$/.test(entry.duration.trim()) || Number(entry.duration) > 999.9) {
            throw new Error('Duration must be a number from 0 to 999.9, with up to one decimal place.');
          }
          if (entry.telephone.trim() && !isValidUsPhone(entry.telephone)) {
            throw new Error(`Telephone: ${US_PHONE_ERROR}`);
          }
          throw new Error('Complete all fields for each experience you started, or clear unused experience rows.');
        }
      }
      return;
    }
    if (section === 'education') {
      const started = educationEntries.filter(educationHasAnyValue);
      if (!started.length) {
        throw new Error('Add at least one education record before continuing.');
      }
      for (const entry of started) {
        if (!educationIsComplete(entry)) {
          if (!/^\d{1,3}(\.\d)?$/.test(entry.duration.trim()) || Number(entry.duration) > 999.9) {
            throw new Error('Education duration must be a number from 0 to 999.9, with up to one decimal place.');
          }
          if (entry.graduated !== 'true' && entry.graduated !== 'false') {
            throw new Error('Select whether you graduated for each education record.');
          }
          throw new Error('Complete all fields for each education record you started, or clear unused rows.');
        }
      }
      return;
    }
    if (section === 'documents') {
      if (!Object.values(attachmentFiles).some(Boolean)) {
        throw new Error('Select at least one credential document to upload.');
      }
      if (attachmentFiles.cpr && !normalizeApiDate(cprExpiry)) {
        throw new Error('Select a valid CPR certificate expiry date.');
      }
      for (const doc of otherDocs) {
        if (!doc.file && !doc.title.trim()) continue;
        if (!doc.title.trim()) throw new Error('Enter a title for each other document.');
        if (!doc.file) throw new Error('Select a file for each other document that has a title.');
      }
      return;
    }
    if (section === 'resume') {
      if (!resume) throw new Error('Upload your most recent resume before continuing.');
      const extension = resume.name.toLowerCase().split('.').pop();
      if (!extension || !['doc', 'docx', 'pdf'].includes(extension)) {
        throw new Error('Resume must be a DOC, DOCX, or PDF file.');
      }
      if ((resume.size ?? resume.file?.size ?? 0) > 6 * 1024 * 1024) {
        throw new Error('Resume exceeds the 6 MB limit.');
      }
      return;
    }
    if (section === 'eligibility') {
      if (!eevCategory) {
        throw new Error(
          eevDocPath === 'IA'
            ? 'Select a document type that establishes both identity and employment eligibility.'
            : 'Select an identity document type.',
        );
      }
      if (!eevFile) {
        throw new Error(
          eevDocPath === 'IA'
            ? 'Upload the selected document.'
            : 'Upload the identity document.',
        );
      }
      if (eevDocPath === 'BC' && !eevSecondCategory) {
        throw new Error('Select an employment authorization document type.');
      }
      if (eevDocPath === 'BC' && !eevSecondFile) {
        throw new Error('Upload the employment authorization document.');
      }
      if (citizenship === 'permanent_resident' && !uscis.trim()) {
        throw new Error('Enter your USCIS or A-number.');
      }
      if (citizenship === 'noncitizen_authorized' && !normalizeApiDate(workAuthorizationExpiry)) {
        throw new Error('Select a valid work authorization expiry date.');
      }
      return;
    }
    if (section === 'emergency') {
      if (!emergencyName.trim() || !emergencyPhone.trim() || !emergencyAddress.trim() || !emergencyRelationship.trim()) {
        throw new Error('Complete all emergency contact fields before continuing.');
      }
      if (!isValidUsPhone(emergencyPhone)) {
        throw new Error(`Emergency contact phone: ${US_PHONE_ERROR}`);
      }
      return;
    }
    if (section === 'references') {
      const started = referenceEntries.filter(referenceHasAnyValue);
      if (!started.length) {
        throw new Error('Add at least one reference before continuing.');
      }
      if (started.length > MAX_REFERENCES) {
        throw new Error(`You can add a maximum of ${MAX_REFERENCES} references.`);
      }
      for (const entry of started) {
        if (!referenceIsComplete(entry)) {
          if (entry.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.email.trim())) {
            throw new Error('Enter a valid reference email address.');
          }
          if (entry.phone.trim() && !isValidUsPhone(entry.phone)) {
            throw new Error(`Reference phone: ${US_PHONE_ERROR}`);
          }
          throw new Error('Complete all fields for each reference you started, or clear unused rows.');
        }
      }
      if (!referenceName.trim() || !referenceSignature.trim()) {
        throw new Error('Enter your name and save your signature before continuing.');
      }
      if (!sanctioned || !pendingAction) {
        throw new Error('Answer the license / certification questions before continuing.');
      }
      if (sanctioned === 'YES' && !sanctionedExplain.trim()) {
        throw new Error('Please explain any sanctions or disciplinary actions.');
      }
      if (pendingAction === 'YES' && !pendingActionExplain.trim()) {
        throw new Error('Please explain any pending license actions.');
      }
    }
  };

  const fingerprintForSection = (section: OnboardingSection) => {
    const uploads = (files: (SelectedUpload | null)[]) => files.map(uploadFingerprint);
    switch (section) {
      case 'license':
        return JSON.stringify(licenseEntries.map((entry) => ([
          entry.selectedProfession?.id,
          entry.licenseNumber.trim(),
          entry.isMultiState,
          entry.licenseStates.map((item) => item.id),
          entry.primaryState?.id,
          entry.expiryDate,
        ])));
      case 'experience':
        return JSON.stringify(experienceEntries.map((entry) => ([
          entry.company,
          entry.jobTitle,
          entry.supervisor,
          entry.telephone,
          entry.address,
          entry.duration,
          entry.leaving,
        ])));
      case 'education':
        return JSON.stringify(educationEntries.map((entry) => ([
          entry.country?.id,
          entry.state,
          entry.institute,
          entry.degree,
          entry.majors,
          entry.city,
          entry.duration,
          entry.graduated,
        ])));
      case 'documents':
        return JSON.stringify([
          uploads(Object.values(attachmentFiles)),
          cprExpiry,
          otherDocs.map((doc) => [doc.title, uploadFingerprint(doc.file)]),
        ]);
      case 'resume':
        return JSON.stringify(uploadFingerprint(resume));
      case 'eligibility':
        return JSON.stringify([
          citizenship,
          uscis,
          workAuthorizationExpiry,
          eevDocPath,
          eevCategory?.id,
          eevSecondCategory?.id,
          uploadFingerprint(eevFile),
          uploadFingerprint(eevSecondFile),
        ]);
      case 'emergency':
        return JSON.stringify([emergencyName, emergencyPhone, emergencyAddress, emergencyRelationship]);
      case 'references':
        return JSON.stringify([
          referenceEntries.map((entry) => ([
            entry.employer,
            entry.jobTitle,
            entry.email,
            entry.phone,
            entry.position,
            entry.contact,
          ])),
          referenceName,
          referenceSignature,
          sanctioned,
          sanctionedExplain,
          pendingAction,
          pendingActionExplain,
        ]);
    }
  };

  const persistDraft = async (updates: Record<string, unknown> = {}) => {
    const draft = JSON.parse(draftJson) as Record<string, unknown>;
    await setLocalStorageItem(DRAFT_KEY, JSON.stringify({ ...draft, ...updates }));
  };

  const continueSection = async () => {
    setError(null);
    try {
      validateSection(ONBOARDING_SECTIONS[sectionIndex].id);
      const nextIndex = Math.min(sectionIndex + 1, ONBOARDING_SECTIONS.length - 1);
      await persistDraft({ sectionIndex: nextIndex });
      setSectionIndex(nextIndex);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Please complete this section.');
    }
  };

  const submitAll = async () => {
    if (submissionInProgress.current) return;
    submissionInProgress.current = true;
    setSubmitting(true);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      for (let index = 0; index < ONBOARDING_SECTIONS.length; index += 1) {
        try {
          validateSection(ONBOARDING_SECTIONS[index].id);
        } catch (validationError) {
          setSectionIndex(index);
          throw validationError;
        }
      }

      const completeLicenses = licenseEntries.filter(licenseIsComplete);
      const licenseEmpty = !licenseEntries.some(licenseHasAnyValue);
      if (licenseEmpty) {
        const existingResponse = await professionalApiClient.get<Option[] | { results?: Option[] }>('/licenses/');
        if (!existingResponse.ok) {
          throw new Error(apiError(existingResponse, 'Unable to check existing licenses'));
        }
        const existingLicenses = Array.isArray(existingResponse.data)
          ? existingResponse.data
          : existingResponse.data?.results;
        if (!existingLicenses) throw new Error('The server returned an invalid license list.');
        if (!existingLicenses.length) {
          setSectionIndex(0);
          throw new Error('Add at least one professional license before continuing.');
        }
        setNotice('Existing license records on your account will be kept.');
      }

      type PendingItem =
        | { kind: 'section'; id: OnboardingSection; fingerprint: string }
        | { kind: 'license'; entry: LicenseDraft; fingerprint: string; key: string }
        | { kind: 'experience'; entry: ExperienceDraft; fingerprint: string; key: string }
        | { kind: 'education'; entry: EducationDraft; fingerprint: string; key: string }
        | { kind: 'reference'; entry: ReferenceDraft; fingerprint: string; key: string };

      const pending: PendingItem[] = [];
      for (const { id } of ONBOARDING_SECTIONS) {
        const fingerprint = fingerprintForSection(id);
        if (submittedSections[id] === fingerprint) continue;

        if (id === 'license') {
          if (licenseEmpty) continue;
          completeLicenses.forEach((entry, index) => {
            pending.push({
              kind: 'license',
              entry,
              fingerprint,
              key: `license:${index}`,
            });
          });
          continue;
        }
        if (id === 'experience') {
          experienceEntries.filter(experienceIsComplete).forEach((entry, index) => {
            pending.push({
              kind: 'experience',
              entry,
              fingerprint,
              key: `experience:${index}`,
            });
          });
          continue;
        }
        if (id === 'education') {
          educationEntries.filter(educationIsComplete).forEach((entry, index) => {
            pending.push({
              kind: 'education',
              entry,
              fingerprint,
              key: `education:${index}`,
            });
          });
          continue;
        }
        if (id === 'references') {
          referenceEntries.filter(referenceIsComplete).forEach((entry, index) => {
            pending.push({
              kind: 'reference',
              entry,
              fingerprint,
              key: `reference:${index}`,
            });
          });
          continue;
        }
        pending.push({ kind: 'section', id, fingerprint });
      }

      if (pending.length) {
        const sections: RegistrationSubmitSection[] = pending.map((item) => {
          if (item.kind === 'license') {
            return {
              type: 'licenses' as const,
              key: item.key,
              appendFields: (formData, sectionIndex) => {
                appendLicenseEntry(formData, sectionIndex, item.entry);
              },
            };
          }
          if (item.kind === 'experience') {
            return {
              type: 'employements' as const,
              key: item.key,
              appendFields: (formData, sectionIndex) => {
                appendExperienceEntry(formData, sectionIndex, item.entry);
              },
            };
          }
          if (item.kind === 'education') {
            return {
              type: 'educations' as const,
              key: item.key,
              appendFields: (formData, sectionIndex) => {
                appendEducationEntry(formData, sectionIndex, item.entry);
              },
            };
          }
          if (item.kind === 'reference') {
            return {
              type: 'references' as const,
              key: item.key,
              appendFields: (formData, sectionIndex) => {
                appendReferenceEntry(formData, sectionIndex, item.entry);
              },
            };
          }
          return {
            type: SECTION_API_TYPE[item.id],
            key: item.id,
            appendFields: async (formData, sectionIndex) => {
              await appendOnboardingSection(formData, sectionIndex, item.id);
            },
          };
        });

        try {
          await submitRegistrationSections(sections);
        } catch (submitError) {
          // Atomic submit rolled back — clear fingerprints so a retry re-posts.
          setSubmittedSections({});
          await persistDraft({ submittedSections: {} });
          const failed = submitError as Error & { sectionKey?: string; sectionIndex?: number };
          const failedItem = typeof failed.sectionIndex === 'number' ? pending[failed.sectionIndex] : null;
          const failedId = failedItem?.kind === 'section'
            ? failedItem.id
            : failedItem?.kind === 'license'
              || (typeof failed.sectionKey === 'string' && failed.sectionKey.startsWith('license'))
              ? 'license'
              : failedItem?.kind === 'experience'
                || (typeof failed.sectionKey === 'string' && failed.sectionKey.startsWith('experience'))
                ? 'experience'
                : failedItem?.kind === 'education'
                  || (typeof failed.sectionKey === 'string' && failed.sectionKey.startsWith('education'))
                  ? 'education'
                  : failedItem?.kind === 'reference'
                    || (typeof failed.sectionKey === 'string' && failed.sectionKey.startsWith('reference'))
                    ? 'references'
                    : typeof failed.sectionKey === 'string'
                      && ONBOARDING_SECTIONS.some((item) => item.id === failed.sectionKey)
                      ? (failed.sectionKey as OnboardingSection)
                      : null;
          if (failedId) {
            const uiIndex = ONBOARDING_SECTIONS.findIndex((item) => item.id === failedId);
            if (uiIndex >= 0) setSectionIndex(uiIndex);
          }
          throw submitError;
        }

        const updatedSections = { ...submittedSections };
        pending.forEach((item) => {
          if (item.kind === 'section') updatedSections[item.id] = item.fingerprint;
          if (item.kind === 'license') updatedSections.license = item.fingerprint;
          if (item.kind === 'experience') updatedSections.experience = item.fingerprint;
          if (item.kind === 'education') updatedSections.education = item.fingerprint;
          if (item.kind === 'reference') updatedSections.references = item.fingerprint;
        });
        setSubmittedSections(updatedSections);
        await persistDraft({ submittedSections: updatedSections });
      }

      await finishApplication();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save onboarding.');
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
      setLoading(false);
    }
  };

  const saveAndContinueLater = async () => {
    setError(null);
    setLoading(true);
    try {
      const draft = { ...JSON.parse(draftJson) as Record<string, unknown>, sectionIndex };
      await setLocalStorageItem(DRAFT_KEY, JSON.stringify(draft));
      // Match the web app: persist to the server while still authenticated,
      // then sign out so the next login resumes this onboarding form.
      await saveMobileOnboardingDraft(draft);
      await clearSession();
      Alert.alert(
        'Progress saved',
        'Your onboarding progress was saved. Sign in again to continue where you left off.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/sign-in') }],
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your progress.');
    } finally {
      setLoading(false);
    }
  };

  const toggleLicenseState = (index: number, option: Option) => {
    setLicenseEntries((current) => current.map((entry, entryIndex) => {
      if (entryIndex !== index) return entry;
      const exists = entry.licenseStates.some((state) => state.id === option.id);
      return {
        ...entry,
        licenseStates: exists
          ? entry.licenseStates.filter((state) => state.id !== option.id)
          : [...entry.licenseStates, option],
      };
    }));
  };

  const renderLicense = () => (
    <View style={styles.form}>
      <SectionHeading title="Professional Licenses" icon="badge" />
      <Text style={styles.helpText}>Add one or more licenses. Use Add another for multi-state or additional credentials.</Text>
      {licenseEntries.map((entry, index) => (
        <View key={`license-${index}`} style={styles.licenseCard}>
          {licenseEntries.length > 1 ? (
            <View style={styles.licenseCardHeader}>
              <Text style={styles.licenseCardTitle}>License {index + 1}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLicenseEntries((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  setActiveLicenseIndex((current) => (current >= index ? Math.max(0, current - 1) : current));
                }}>
                <MaterialIcons name="delete-outline" size={20} color="#b42318" />
              </Pressable>
            </View>
          ) : null}
          <SelectField
            label="Professional License"
            icon="medical-services"
            value={entry.selectedProfession}
            onPress={() => {
              setActiveLicenseIndex(index);
              setProfessionModal(true);
            }}
          />
          <IconTextInput
            {...fieldColors}
            icon="confirmation-number"
            placeholder="License Number *"
            value={entry.licenseNumber}
            onChangeText={(value) => updateLicenseEntry(index, { licenseNumber: value })}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Single state</Text>
            <Switch
              value={entry.isMultiState}
              onValueChange={(value) => updateLicenseEntry(index, { isMultiState: value, licenseStates: [] })}
              trackColor={{ true: FORM_PRIMARY }}
            />
            <Text style={styles.switchLabel}>Multi-state</Text>
          </View>
          <Pressable
            style={styles.selectField}
            onPress={() => {
              setActiveLicenseIndex(index);
              setLicenseStateModal(true);
            }}>
            <MaterialIcons name="map" size={20} color="#6b7280" />
            <Text style={[styles.selectText, { color: entry.licenseStates.length ? '#263341' : '#7b8490' }]}>
              {entry.isMultiState
                ? `${entry.licenseStates.length} license states selected`
                : entry.licenseStates[0]?.name || 'Select License State *'}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={22} color="#6b7280" />
          </Pressable>
          <SelectField
            label="Primary State"
            icon="location-on"
            value={entry.primaryState}
            onPress={() => {
              setActiveLicenseIndex(index);
              setPrimaryStateModal(true);
            }}
          />
          <IconDateField
            {...fieldColors}
            placeholder="Expiry Date *"
            value={entry.expiryDate}
            onChange={(value) => updateLicenseEntry(index, { expiryDate: value })}
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        style={styles.addOtherDoc}
        onPress={() => {
          setLicenseEntries((current) => [...current, emptyLicense()]);
          setActiveLicenseIndex(licenseEntries.length);
        }}>
        <MaterialIcons name="add" size={18} color={FORM_PRIMARY} />
        <Text style={styles.addOtherDocText}>Add another license</Text>
      </Pressable>
    </View>
  );

  const renderExperience = () => (
    <View style={styles.form}>
      <SectionHeading title="Work Experience" icon="work" />
     
      {experienceEntries.map((entry, index) => (
        <View key={`experience-${index}`} style={styles.licenseCard}>
          {experienceEntries.length > 1 ? (
            <View style={styles.licenseCardHeader}>
              <Text style={styles.licenseCardTitle}>Experience {index + 1}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setExperienceEntries((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}>
                <MaterialIcons name="delete-outline" size={20} color="#b42318" />
              </Pressable>
            </View>
          ) : null}
          <IconTextInput
            {...fieldColors}
            icon="business"
            placeholder="Company / Institute Name *"
            value={entry.company}
            onChangeText={(value) => updateExperienceEntry(index, { company: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="work"
            placeholder="Job Title *"
            value={entry.jobTitle}
            onChangeText={(value) => updateExperienceEntry(index, { jobTitle: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="person"
            placeholder="Supervisor *"
            value={entry.supervisor}
            onChangeText={(value) => updateExperienceEntry(index, { supervisor: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="phone"
            placeholder="Telephone *"
            value={formatPhoneNumber(entry.telephone)}
            onChangeText={(value) => updateExperienceEntry(index, { telephone: normalizePhoneInput(value) })}
            keyboardType="phone-pad"
            maxLength={US_PHONE_INPUT_MAX_LENGTH}
          />
          <IconTextInput
            {...fieldColors}
            icon="schedule"
            placeholder="Duration in years (e.g. 3.5) *"
            value={entry.duration}
            onChangeText={(value) => updateExperienceEntry(index, {
              duration: boundedDecimalInput(value, entry.duration, 3, 999.9),
            })}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          <IconTextInput
            {...fieldColors}
            icon="location-on"
            placeholder="Address *"
            value={entry.address}
            onChangeText={(value) => updateExperienceEntry(index, { address: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="description"
            placeholder="Description *"
            value={entry.leaving}
            onChangeText={(value) => updateExperienceEntry(index, { leaving: value })}
            multiline
            maxLength={2000}
          />
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        style={styles.addOtherDoc}
        onPress={() => setExperienceEntries((current) => [...current, emptyExperience()])}>
        <MaterialIcons name="add-circle-outline" size={20} color={FORM_PRIMARY} />
        <Text style={styles.addOtherDocText}>Add another experience</Text>
      </Pressable>
    </View>
  );

  const renderEducation = () => (
    <View style={styles.form}>
      <SectionHeading title="Education" icon="school" />
      <Text style={styles.helpText}>Add one or more education records.</Text>
      {educationEntries.map((entry, index) => (
        <View key={`education-${index}`} style={styles.licenseCard}>
          {educationEntries.length > 1 ? (
            <View style={styles.licenseCardHeader}>
              <Text style={styles.licenseCardTitle}>Education {index + 1}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEducationEntries((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  setActiveEducationIndex((current) => (current >= index ? Math.max(0, current - 1) : current));
                }}>
                <MaterialIcons name="delete-outline" size={20} color="#b42318" />
              </Pressable>
            </View>
          ) : null}
          <IconTextInput
            {...fieldColors}
            icon="school"
            placeholder="Degree *"
            value={entry.degree}
            onChangeText={(value) => updateEducationEntry(index, { degree: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="account-balance"
            placeholder="School or College *"
            value={entry.institute}
            onChangeText={(value) => updateEducationEntry(index, { institute: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="menu-book"
            placeholder="Major *"
            value={entry.majors}
            onChangeText={(value) => updateEducationEntry(index, { majors: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="schedule"
            placeholder="Duration in years (e.g. 4) *"
            value={entry.duration}
            onChangeText={(value) => updateEducationEntry(index, {
              duration: boundedDecimalInput(value, entry.duration, 3, 999.9),
            })}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          <SelectField
            label="Country"
            icon="public"
            value={entry.country}
            onPress={() => {
              setActiveEducationIndex(index);
              setEduCountryModal(true);
            }}
          />
          <IconTextInput
            {...fieldColors}
            icon="location-city"
            placeholder="City *"
            value={entry.city}
            onChangeText={(value) => updateEducationEntry(index, { city: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="map"
            placeholder="State *"
            value={entry.state}
            onChangeText={(value) => updateEducationEntry(index, { state: value })}
          />
          <Text style={styles.helpText}>Did you graduate? *</Text>
          <View style={styles.licenseChoiceRow}>
            {([
              { value: 'true' as const, label: 'Yes' },
              { value: 'false' as const, label: 'No' },
            ]).map(({ value, label }) => {
              const selected = entry.graduated === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[styles.licenseChoiceOption, selected && styles.licenseChoiceOptionSelected]}
                  onPress={() => updateEducationEntry(index, { graduated: value })}>
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={20}
                    color={FORM_PRIMARY}
                  />
                  <Text style={styles.licenseChoiceText}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        style={styles.addOtherDoc}
        onPress={() => setEducationEntries((current) => [...current, emptyEducation()])}>
        <MaterialIcons name="add-circle-outline" size={20} color={FORM_PRIMARY} />
        <Text style={styles.addOtherDocText}>Add another education</Text>
      </Pressable>
    </View>
  );

  const renderDocuments = () => {
    const documents: { key: AttachmentName; label: string }[] = [
      { key: 'physical', label: 'Physical Exam' },
      { key: 'x_ray', label: 'TB Test / Chest X-Ray' },
      { key: 'covid', label: 'COVID-19 Vaccination' },
      { key: 'dementia', label: 'Dementia Training Proof' },
      { key: 'flue', label: 'Flu Vaccination' },
      { key: 'cpr', label: 'CPR Card / Certificate' },
    ];
    return (
      <View style={styles.form}>
        <SectionHeading title="Attachments" icon="file-upload" />
        <Text style={styles.helpText}>Upload image or PDF documents. CPR requires an expiry date.</Text>
        {documents.map(({ key, label }) => (
          <View key={key}>
            <Pressable style={styles.uploadRow} onPress={() => void setAttachment(key)}>
              <MaterialIcons name={attachmentFiles[key] ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
              <Text style={styles.uploadText}>{attachmentFiles[key]?.name || label}</Text>
              {attachmentFiles[key] ? (
                <Pressable onPress={() => setAttachmentFiles((current) => ({ ...current, [key]: null }))}>
                  <MaterialIcons name="close" size={20} color="#b42318" />
                </Pressable>
              ) : null}
            </Pressable>
            {key === 'cpr' && attachmentFiles.cpr ? (
              <IconDateField {...fieldColors} placeholder="CPR Expiry Date *" value={cprExpiry} onChange={setCprExpiry} />
            ) : null}
          </View>
        ))}

        <SectionHeading title="Other Documents" icon="attach-file" />
        <Text style={styles.helpText}>Optional. Each other document needs a title and a file.</Text>
        {otherDocs.map((doc, index) => (
          <View key={`other-doc-${index}`} style={styles.otherDocBlock}>
            <IconTextInput
              {...fieldColors}
              icon="title"
              placeholder="Document title"
              value={doc.title}
              onChangeText={(value) => {
                setOtherDocs((current) => current.map((item, itemIndex) => (
                  itemIndex === index ? { ...item, title: value.slice(0, 150) } : item
                )));
              }}
              maxLength={150}
            />
            <Pressable
              style={styles.uploadRow}
              onPress={async () => {
                try {
                  const selected = await pickDocument('image');
                  if (!selected) return;
                  setOtherDocs((current) => current.map((item, itemIndex) => (
                    itemIndex === index ? { ...item, file: selected } : item
                  )));
                } catch (pickError) {
                  setError(pickError instanceof Error ? pickError.message : 'Unable to select the document.');
                }
              }}>
              <MaterialIcons name={doc.file ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
              <Text style={styles.uploadText}>{doc.file?.name || 'Upload other document'}</Text>
              {doc.file ? (
                <Pressable
                  onPress={() => {
                    setOtherDocs((current) => current.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, file: null } : item
                    )));
                  }}>
                  <MaterialIcons name="close" size={20} color="#b42318" />
                </Pressable>
              ) : null}
            </Pressable>
            {otherDocs.length > 1 ? (
              <Pressable
                style={styles.removeOtherDoc}
                onPress={() => {
                  setOtherDocs((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}>
                <MaterialIcons name="delete-outline" size={18} color="#b42318" />
                <Text style={styles.removeOtherDocText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          style={styles.addOtherDoc}
          onPress={() => setOtherDocs((current) => [...current, emptyOtherDoc()])}>
          <MaterialIcons name="add" size={18} color={FORM_PRIMARY} />
          <Text style={styles.addOtherDocText}>Add another</Text>
        </Pressable>
      </View>
    );
  };

  const renderResume = () => (
    <View style={styles.form}>
      <SectionHeading title="Upload Resume" icon="description" />
      <Text style={styles.helpText}>Upload your most recent resume. DOC, DOCX or PDF (maximum 6 MB).</Text>
      <Pressable
        style={styles.uploadRow}
        onPress={async () => {
          try {
            setResume(await pickDocument('resume'));
          } catch (pickError) {
            setError(pickError instanceof Error ? pickError.message : 'Unable to select the resume.');
          }
        }}>
        <MaterialIcons name={resume ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
        <Text style={styles.uploadText}>{resume?.name || 'Upload Resume *'}</Text>
        {resume ? <Pressable onPress={() => setResume(null)}><MaterialIcons name="close" size={20} color="#b42318" /></Pressable> : null}
      </Pressable>
      {(resume?.size ?? resume?.file?.size ?? 0) > 6 * 1024 * 1024 ? (
        <Text style={styles.errorText}>Resume exceeds the 6 MB limit.</Text>
      ) : null}
    </View>
  );

  const selectCitizenship = (
    value: 'citizen_of_US' | 'non_citizen_of_US' | 'permanent_resident' | 'noncitizen_authorized',
  ) => {
    setCitizenship(value);
    if (value !== 'permanent_resident') setUscis('');
    if (value !== 'noncitizen_authorized') {
      setWorkAuthorizationExpiry('');
    }
  };

  const selectEevDocPath = (path: EevDocPath) => {
    // Re-tapping the already selected path must not wipe a chosen document type/file.
    if (path === eevDocPath) return;
    setEevDocPath(path);
    setEevCategory(null);
    setEevSecondCategory(null);
    setEevFile(null);
    setEevSecondFile(null);
  };

  const renderEligibility = () => (
    <View style={styles.form}>
      <SectionHeading title="Employment Eligibility Verification" icon="verified-user" />
      <Text style={styles.helpText}>
        Check one of the following boxes to attest to your citizenship or immigration status.
      </Text>

      <Pressable style={styles.checkRow} onPress={() => selectCitizenship('citizen_of_US')}>
        <MaterialIcons name={citizenship === 'citizen_of_US' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
        <Text style={styles.choiceText}>A citizen of the United States</Text>
      </Pressable>

      <Pressable style={styles.checkRow} onPress={() => selectCitizenship('non_citizen_of_US')}>
        <MaterialIcons name={citizenship === 'non_citizen_of_US' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
        <Text style={styles.choiceText}>A noncitizen national of the United States</Text>
      </Pressable>

      <View style={styles.eligibilityOptionBlock}>
        <Pressable style={styles.checkRow} onPress={() => selectCitizenship('permanent_resident')}>
          <MaterialIcons name={citizenship === 'permanent_resident' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
          <Text style={styles.choiceText}>A lawful permanent resident. (Enter USCIS or A-Number.)</Text>
        </Pressable>
        {citizenship === 'permanent_resident' ? (
          <IconTextInput
            {...fieldColors}
            icon="badge"
            placeholder="USCIS or A-Number *"
            value={uscis}
            onChangeText={setUscis}
            autoCapitalize="characters"
          />
        ) : null}
      </View>

      <View style={styles.eligibilityOptionBlock}>
        <Pressable style={styles.checkRow} onPress={() => selectCitizenship('noncitizen_authorized')}>
          <MaterialIcons name={citizenship === 'noncitizen_authorized' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
          <Text style={styles.choiceText}>A noncitizen authorized to work until (expiry date)</Text>
        </Pressable>
        {citizenship === 'noncitizen_authorized' ? (
          <IconDateField
            {...fieldColors}
            placeholder="Expiry Date *"
            value={workAuthorizationExpiry}
            onChange={setWorkAuthorizationExpiry}
            minimumDate={new Date()}
          />
        ) : null}
      </View>

      <Text style={[styles.helpText, { marginTop: 8 }]}>
        Acceptable documents — choose one option:
      </Text>
      <Pressable style={styles.checkRow} onPress={() => selectEevDocPath('IA')}>
        <MaterialIcons name={eevDocPath === 'IA' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
        <Text style={styles.choiceText}>
          One document that establishes both identity and employment eligibility
        </Text>
      </Pressable>
      <Pressable style={styles.checkRow} onPress={() => selectEevDocPath('BC')}>
        <MaterialIcons name={eevDocPath === 'BC' ? 'radio-button-checked' : 'radio-button-unchecked'} size={21} color={FORM_PRIMARY} />
        <Text style={styles.choiceText}>
          One identity document and one employment authorization document
        </Text>
      </Pressable>

      {eevDocPath === 'IA' ? (
        <>
          <SelectField
            label="Document (both identity & employment)"
            icon="description"
            value={eevCategory}
            onPress={() => setEevCategoryModal(true)}
          />
          {eevCategory ? (
            <Pressable style={styles.uploadRow} onPress={async () => {
              try {
                const file = await pickDocument('image');
                if (file) setEevFile(file);
              } catch (pickError) {
                setError(pickError instanceof Error ? pickError.message : 'Unable to select the document.');
              }
            }}>
              <MaterialIcons name={eevFile ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
              <Text style={styles.uploadText}>{eevFile?.name || 'Upload document *'}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <SelectField
            label="Identity document"
            icon="description"
            value={eevCategory}
            onPress={() => setEevCategoryModal(true)}
          />
          {eevCategory ? (
            <Pressable style={styles.uploadRow} onPress={async () => {
              try {
                const file = await pickDocument('image');
                if (file) setEevFile(file);
              } catch (pickError) {
                setError(pickError instanceof Error ? pickError.message : 'Unable to select identity document.');
              }
            }}>
              <MaterialIcons name={eevFile ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
              <Text style={styles.uploadText}>{eevFile?.name || 'Upload identity document *'}</Text>
            </Pressable>
          ) : null}

          <SelectField
            label="Employment authorization document"
            icon="description"
            value={eevSecondCategory}
            onPress={() => setEevSecondCategoryModal(true)}
          />
          {eevSecondCategory ? (
            <Pressable style={styles.uploadRow} onPress={async () => {
              try {
                const file = await pickDocument('image');
                if (file) setEevSecondFile(file);
              } catch (pickError) {
                setError(pickError instanceof Error ? pickError.message : 'Unable to select employment authorization document.');
              }
            }}>
              <MaterialIcons name={eevSecondFile ? 'insert-drive-file' : 'file-upload'} size={21} color={FORM_PRIMARY} />
              <Text style={styles.uploadText}>{eevSecondFile?.name || 'Upload employment authorization document *'}</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );

  const renderEmergencyContact = () => (
    <View style={styles.form}>
      <SectionHeading title="Emergency Contact Information" icon="contact-phone" />
      <IconTextInput {...fieldColors} icon="person" placeholder="Name *" value={emergencyName} onChangeText={setEmergencyName} />
      <IconTextInput
        {...fieldColors}
        icon="phone"
        placeholder="Phone *"
        value={formatPhoneNumber(emergencyPhone)}
        onChangeText={(value) => setEmergencyPhone(normalizePhoneInput(value))}
        keyboardType="phone-pad"
        maxLength={US_PHONE_INPUT_MAX_LENGTH}
      />
      <IconTextInput {...fieldColors} icon="home" placeholder="Address *" value={emergencyAddress} onChangeText={setEmergencyAddress} />
      <IconTextInput {...fieldColors} icon="people" placeholder="Relationship *" value={emergencyRelationship} onChangeText={setEmergencyRelationship} />
    </View>
  );

  const renderReferences = () => (
    <View style={styles.form}>
      <SectionHeading title="Applicant Reference Check" icon="fact-check" />
      <Text style={styles.helpText}>
        Add up to {MAX_REFERENCES} references. The statement and signature are completed once below.
      </Text>
      {referenceEntries.map((entry, index) => (
        <View key={`reference-${index}`} style={styles.licenseCard}>
          <View style={styles.licenseCardHeader}>
            <Text style={styles.licenseCardTitle}>Reference {index + 1}</Text>
            {referenceEntries.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setReferenceEntries((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}>
                <MaterialIcons name="delete-outline" size={20} color="#b42318" />
              </Pressable>
            ) : null}
          </View>
          <IconTextInput
            {...fieldColors}
            icon="business"
            placeholder="Previous Employer *"
            value={entry.employer}
            onChangeText={(value) => updateReferenceEntry(index, { employer: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="work"
            placeholder="Job Title *"
            value={entry.jobTitle}
            onChangeText={(value) => updateReferenceEntry(index, { jobTitle: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="email"
            placeholder="Email Address (optional)"
            value={entry.email}
            onChangeText={(value) => updateReferenceEntry(index, { email: value })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <IconTextInput
            {...fieldColors}
            icon="phone"
            placeholder="Phone Number *"
            value={formatPhoneNumber(entry.phone)}
            onChangeText={(value) => updateReferenceEntry(index, { phone: normalizePhoneInput(value) })}
            keyboardType="phone-pad"
            maxLength={US_PHONE_INPUT_MAX_LENGTH}
          />
          <IconTextInput
            {...fieldColors}
            icon="badge"
            placeholder="Position *"
            value={entry.position}
            onChangeText={(value) => updateReferenceEntry(index, { position: value })}
          />
          <IconTextInput
            {...fieldColors}
            icon="contact-mail"
            placeholder="Contact Person *"
            value={entry.contact}
            onChangeText={(value) => updateReferenceEntry(index, { contact: value })}
          />
        </View>
      ))}
      {referenceEntries.length < MAX_REFERENCES ? (
        <Pressable
          accessibilityRole="button"
          style={styles.addOtherDoc}
          onPress={() => setReferenceEntries((current) => [...current, emptyReference()])}>
          <MaterialIcons name="add-circle-outline" size={20} color={FORM_PRIMARY} />
          <Text style={styles.addOtherDocText}>Add another reference</Text>
        </Pressable>
      ) : null}

      <SectionHeading title="Statement of Accuracy and Release" icon="verified-user" />
      <Text style={styles.helpText}>
        I certify that any omission or misleading or untrue statement or answer in this application may jeopardize my
        employment opportunities with IsentCare and may also result in my termination, if employed. I authorize
        IsentCare to investigate all the references and to secure information about me from any other person, company
        or organization without liability in such person, company or organization or IsentCare. I understand that if
        any offer or employment is made, it will be conditioned upon passing a pre-employment physical indicating
        that I can perform all essential job functions without reasonable accommodation. IsentCare will perform
        criminal background checks on all applicants.
      </Text>
      <IconTextInput
        {...fieldColors}
        icon="person"
        placeholder="Your Name *"
        value={referenceName}
        onChangeText={setReferenceName}
      />
      <Text style={styles.helpText}>
        Date: {new Date().toISOString().slice(0, 10)}
      </Text>
      <SignaturePad
        strokes={referenceSignatureStrokes}
        onStrokesChange={(strokes) => {
          setReferenceSignatureStrokes(strokes);
          setReferenceSignature('');
        }}
        onSave={setReferenceSignature}
        onClear={() => {
          setReferenceSignatureStrokes([]);
          setReferenceSignature('');
        }}
      />
      <Text style={styles.helpText}>
        {referenceSignature ? 'Signature saved.' : 'Sign above, then select Save Signature.'}
      </Text>

      <SectionHeading title="License / Certification Questions" icon="help-outline" />
      <Text style={styles.helpText}>Have you ever been sanctioned, disciplined, or excluded by a regulatory agency?</Text>
      <View style={styles.licenseChoiceRow}>
        {['YES', 'NO', 'NA'].map((value) => {
          const selected = sanctioned === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.licenseChoiceOption, selected && styles.licenseChoiceOptionSelected]}
              onPress={() => setSanctioned(value)}>
              <MaterialIcons
                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={FORM_PRIMARY}
              />
              <Text style={styles.licenseChoiceText}>{value === 'NA' ? 'N/A' : value}</Text>
            </Pressable>
          );
        })}
      </View>
      {sanctioned === 'YES' ? (
        <IconTextInput {...fieldColors} icon="description" placeholder="Please explain" value={sanctionedExplain} onChangeText={setSanctionedExplain} multiline />
      ) : null}
      <Text style={styles.helpText}>Are there pending actions or active investigations related to a job-related license?</Text>
      <View style={styles.licenseChoiceRow}>
        {['YES', 'NO', 'NA'].map((value) => {
          const selected = pendingAction === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.licenseChoiceOption, selected && styles.licenseChoiceOptionSelected]}
              onPress={() => setPendingAction(value)}>
              <MaterialIcons
                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={20}
                color={FORM_PRIMARY}
              />
              <Text style={styles.licenseChoiceText}>{value === 'NA' ? 'N/A' : value}</Text>
            </Pressable>
          );
        })}
      </View>
      {pendingAction === 'YES' ? (
        <IconTextInput {...fieldColors} icon="description" placeholder="Please explain" value={pendingActionExplain} onChangeText={setPendingActionExplain} multiline />
      ) : null}
    </View>
  );

  const renderCurrentSection = () => {
    switch (ONBOARDING_SECTIONS[sectionIndex].id) {
      case 'license': return renderLicense();
      case 'experience': return renderExperience();
      case 'education': return renderEducation();
      case 'documents': return renderDocuments();
      case 'resume': return renderResume();
      case 'eligibility': return renderEligibility();
      case 'emergency': return renderEmergencyContact();
      case 'references': return renderReferences();
    }
  };

  const goToPreviousSection = async () => {
    const previousIndex = Math.max(sectionIndex - 1, 0);
    setError(null);
    try {
      await persistDraft({ sectionIndex: previousIndex });
      setSectionIndex(previousIndex);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your progress.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <Text style={styles.title}>Professional Onboarding</Text>
        {sessionStatus === 'pending' ? (
          <Text style={styles.notice}>
            Your account is awaiting administrator verification. Please contact an administrator if verification is pending.
          </Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionNav}>
          {ONBOARDING_SECTIONS.map((section, index) => (
            <View key={section.id} style={styles.sectionStep}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={section.title}
                accessibilityState={{ disabled: index > sectionIndex, selected: index === sectionIndex }}
                disabled={index > sectionIndex}
                onPress={() => setSectionIndex(index)}
                style={[
                  styles.sectionIcon,
                  index === sectionIndex && styles.sectionIconActive,
                  index < sectionIndex && styles.sectionIconComplete,
                ]}>
                <MaterialIcons
                  name={SECTION_ICONS[section.id]}
                  size={19}
                  color={index === sectionIndex ? '#fff' : index < sectionIndex ? FORM_PRIMARY : '#7b8490'}
                />
              </Pressable>
              {index < ONBOARDING_SECTIONS.length - 1 ? (
                <View style={[styles.sectionConnector, index < sectionIndex && styles.sectionConnectorComplete]} />
              ) : null}
            </View>
          ))}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {catalogLoading || !draftLoaded ? (
          <ActivityIndicator color={FORM_PRIMARY} />
        ) : catalogError ? (
          <View style={styles.catalogError}>
            <Text style={styles.errorText}>{catalogError}</Text>
            <Pressable onPress={retryCatalogs}><Text style={styles.retryText}>Try again</Text></Pressable>
          </View>
        ) : (
          <View style={styles.sections}>{renderCurrentSection()}</View>
        )}
        {!catalogLoading && !catalogError && draftLoaded ? (
          <View style={styles.navigationButtons}>
            {sectionIndex > 0 ? (
              <Pressable
                accessibilityRole="button"
                style={[styles.secondaryButton, styles.navigationButton, (loading || submitting) && styles.disabled]}
                onPress={() => void goToPreviousSection()}
                disabled={loading || submitting}>
                <MaterialIcons name="arrow-back" size={18} color={FORM_PRIMARY} />
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            ) : <View style={styles.navigationButtonSpacer} />}
            <Pressable
              accessibilityRole="button"
              style={[
                styles.laterButton,
                styles.navigationButton,
                styles.saveNavigationButton,
                (!draftLoaded || loading || submitting) && styles.disabled,
              ]}
              onPress={() => void saveAndContinueLater()}
              disabled={!draftLoaded || loading || submitting}>
              <MaterialIcons name="save-alt" size={16} color="#667085" />
              <Text style={styles.laterButtonText}>Save for later</Text>
            </Pressable>
            {sectionIndex < ONBOARDING_SECTIONS.length - 1 ? (
              <Pressable
                accessibilityRole="button"
                style={[styles.button, styles.nextButton, (loading || submitting) && styles.disabled]}
                onPress={() => void continueSection()}
                disabled={loading || submitting}>
                <Text style={styles.buttonText}>Next</Text>
                <MaterialIcons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                style={[styles.button, styles.nextButton, (loading || submitting) && styles.disabled]}
                onPress={() => void submitAll()}
                disabled={loading || submitting}>
                {loading || submitting ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Text style={styles.buttonText}>Submit</Text>
                    <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                  </>
                )}
              </Pressable>
            )}
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>

      {submitting ? (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color={FORM_PRIMARY} />
          <Text style={styles.submittingText}>Submitting application…</Text>
        </View>
      ) : null}

      <OptionModal
        visible={professionModal}
        title="Select Professional License"
        options={professions}
        onClose={() => setProfessionModal(false)}
        onSelect={(option) => {
          updateLicenseEntry(activeLicenseIndex, { selectedProfession: option });
          setProfessionModal(false);
        }}
      />
      <OptionModal
        visible={licenseStateModal}
        title={licenseEntries[activeLicenseIndex]?.isMultiState ? 'Select License States' : 'Select License State'}
        options={states}
        selectedIds={(licenseEntries[activeLicenseIndex]?.licenseStates || []).map((state) => state.id)}
        multi={!!licenseEntries[activeLicenseIndex]?.isMultiState}
        onClose={() => setLicenseStateModal(false)}
        onSelect={(option) => {
          const current = licenseEntries[activeLicenseIndex];
          if (current?.isMultiState) {
            toggleLicenseState(activeLicenseIndex, option);
          } else {
            updateLicenseEntry(activeLicenseIndex, { licenseStates: [option] });
            setLicenseStateModal(false);
          }
        }}
      />
      <OptionModal
        visible={primaryStateModal}
        title="Select Primary State"
        options={states}
        onClose={() => setPrimaryStateModal(false)}
        onSelect={(option) => {
          updateLicenseEntry(activeLicenseIndex, { primaryState: option });
          setPrimaryStateModal(false);
        }}
      />
      <OptionModal
        visible={eduCountryModal}
        title="Select Country"
        options={countries}
        onClose={() => setEduCountryModal(false)}
        onSelect={(option) => {
          updateEducationEntry(activeEducationIndex, { country: option });
          setEduCountryModal(false);
        }}
      />
      <OptionModal
        visible={eevCategoryModal}
        title={eevDocPath === 'IA' ? 'Select document' : 'Select identity document'}
        options={attachmentCategories.filter((category) => (
          category.category === (eevDocPath === 'IA' ? 'IA' : 'ID')
        ))}
        selectedIds={eevCategory ? [eevCategory.id] : []}
        onClose={() => setEevCategoryModal(false)}
        onSelect={(option) => {
          setEevCategory({
            id: Number(option.id),
            name: option.name,
            category: eevDocPath === 'IA' ? 'IA' : 'ID',
          });
          setEevCategoryModal(false);
        }}
      />
      <OptionModal
        visible={eevSecondCategoryModal}
        title="Select employment authorization document"
        options={attachmentCategories.filter((category) => category.category === 'AU')}
        selectedIds={eevSecondCategory ? [eevSecondCategory.id] : []}
        onClose={() => setEevSecondCategoryModal(false)}
        onSelect={(option) => {
          setEevSecondCategory({
            id: Number(option.id),
            name: option.name,
            category: 'AU',
          });
          setEevSecondCategoryModal(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f9fc' },
  keyboardAvoiding: { flex: 1 },
  submittingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(247,249,252,0.88)',
  },
  submittingText: { color: '#263341', fontSize: 15, fontWeight: '600' },
  container: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 32, gap: Spacing.three },
  title: { fontSize: 22, color: '#263341', fontWeight: '700' },
  sectionNav: { alignItems: 'center', paddingVertical: Spacing.one },
  sectionStep: { flexDirection: 'row', alignItems: 'center' },
  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d8e0e8',
    backgroundColor: '#fff',
  },
  sectionIconActive: { borderColor: FORM_PRIMARY, backgroundColor: FORM_PRIMARY },
  sectionIconComplete: { borderColor: '#b7d4ed', backgroundColor: '#eaf3fb' },
  sectionConnector: { width: 10, height: 2, backgroundColor: '#d8e0e8' },
  sectionConnectorComplete: { backgroundColor: '#b7d4ed' },
  sections: { gap: Spacing.four, padding: Spacing.three, borderRadius: 16, borderWidth: 1, borderColor: '#e7edf3', backgroundColor: '#fff' },
  form: { gap: Spacing.two },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderBottomWidth: 1, borderBottomColor: '#d8e0e8', paddingBottom: Spacing.two },
  sectionTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: FORM_PRIMARY },
  helpText: { color: '#5e6875', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  selectField: { minHeight: 50, borderWidth: 1, borderColor: '#d8e0e8', borderRadius: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, backgroundColor: '#fff' },
  selectText: { flex: 1, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, marginVertical: Spacing.one },
  switchLabel: { color: '#344054', fontSize: 14, fontWeight: '600' },
  button: { minHeight: 50, backgroundColor: FORM_PRIMARY, paddingVertical: Spacing.three, borderRadius: Spacing.two, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  navigationButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.one, marginTop: Spacing.two },
  navigationButton: { flex: 1, paddingHorizontal: 6, marginTop: 0, minHeight: 44 },
  saveNavigationButton: { flex: 1.35 },
  nextButton: { flex: 0, minWidth: 92, minHeight: 44, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
  navigationButtonSpacer: { flex: 1 },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#d8e0e8',
    backgroundColor: '#fff',
  },
  secondaryButtonText: { color: FORM_PRIMARY, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: '#b42318', backgroundColor: '#fef3f2', padding: 12, borderRadius: 8, fontSize: 14 },
  notice: { color: '#175cd3', backgroundColor: '#eff8ff', padding: 12, borderRadius: 8, fontSize: 14 },
  catalogError: { backgroundColor: '#fff', padding: 14, borderRadius: 10, gap: 10 },
  errorText: { color: '#b42318' },
  retryText: { color: FORM_PRIMARY, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 20 },
  modalContent: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: Spacing.two, color: '#202b36' },
  optionList: { maxHeight: 360 },
  optionRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  optionText: { color: '#344054', fontSize: 15 },
  uploadRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d8e0e8', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 },
  uploadText: { flex: 1, color: '#344054', fontSize: 14 },
  checkRow: { minHeight: 34, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eligibilityOptionBlock: { gap: Spacing.two },
  choiceRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  choiceText: { color: '#344054', fontSize: 14, flex: 1, flexShrink: 1 },
  licenseChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  licenseChoiceOption: {
    minWidth: 88,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8e0e8',
    backgroundColor: '#fff',
  },
  licenseChoiceOptionSelected: {
    borderColor: FORM_PRIMARY,
    backgroundColor: '#eaf3fb',
  },
  licenseChoiceText: {
    color: '#344054',
    fontSize: 14,
    fontWeight: '700',
  },
  licenseCard: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e7ec',
  },
  licenseCardHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  licenseCardTitle: {
    color: '#263341',
    fontSize: 15,
    fontWeight: '700',
  },
  otherDocBlock: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e7ec',
  },
  removeOtherDoc: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  removeOtherDocText: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '600',
  },
  addOtherDoc: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginTop: Spacing.one,
  },
  addOtherDocText: {
    color: FORM_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  laterButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, marginTop: Spacing.one },
  laterButtonText: { color: '#667085', fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
});
