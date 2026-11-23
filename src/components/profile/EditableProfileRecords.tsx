import { apiOrigin } from '@/api/apiClient';
import {
  createEducation,
  createEmployment,
  createLicense,
  createOtherAttachment,
  CREDENTIAL_UPLOAD_TYPES,
  deleteAttachment,
  deleteEducation,
  deleteEmployment,
  deleteOtherAttachment,
  deleteResume,
  fetchAttachments,
  fetchCatalogOptions,
  fetchEducations,
  fetchEmployments,
  fetchExtraAttachmentCategories,
  fetchExtraAttachments,
  fetchLicenses,
  fetchOtherAttachments,
  fetchResume,
  isCprAttachment,
  isLicenseExpired,
  licenseStatusLabel,
  optionId,
  optionName,
  renewLicense,
  replaceAttachment,
  updateEducation,
  updateEmployment,
  updateOtherAttachment,
  uploadCredential,
  uploadExtraAttachments,
  uploadResume,
  type AttachmentRecord,
  type CatalogOption,
  type CredentialUploadKey,
  type EducationRecord,
  type EmploymentRecord,
  type ExtraAttachmentCategoryOption,
  type ExtraAttachmentRecord,
  type LicenseRecord,
  type OtherAttachmentRecord,
  type ResumeRecord,
} from '@/api/profileRecords';
import { OptionPickerModal } from '@/components/profile/OptionPickerModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import {
  FORM_PRIMARY,
  IconDateField,
  IconTextInput,
  normalizeApiDate,
} from '@/components/ui/RegistrationFields';
import { Skeleton, SkeletonLines } from '@/components/ui/Skeleton';
import {
  getCachedSection,
  invalidateProfileRecordsCache,
  setCachedSection,
  type EditableSection,
} from '@/store/profileRecordsCache';
import {
  formatPhoneNumber,
  isValidUsPhone,
  normalizePhoneInput,
  US_PHONE_ERROR,
  US_PHONE_INPUT_MAX_LENGTH,
} from '@/utils/phone';
import { eevPathMismatchMessage } from '@/utils/eevDocuments';
import type { SelectedUpload } from '@/utils/upload';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type { EditableSection };

type PendingDelete =
  | { kind: 'employment'; record: EmploymentRecord }
  | { kind: 'education'; record: EducationRecord }
  | { kind: 'attachment'; record: AttachmentRecord }
  | { kind: 'resume' }
  | { kind: 'other'; record: OtherAttachmentRecord };

type EditableProfileRecordsProps = {
  section: EditableSection;
  onBusyChange?: (busy: boolean) => void;
};

const fieldColors = {
  backgroundColor: '#f5f8fb',
  textColor: '#263341',
};

function documentUrl(value: string) {
  return /^https?:\/\//i.test(value)
    ? value
    : `${apiOrigin}${value.startsWith('/') ? '' : '/'}${value}`;
}

function fileName(value: string) {
  return decodeURIComponent(value.split(/[?#]/, 1)[0].split('/').pop() || 'Open document');
}

function durationLabel(value: unknown, fallbackDates: (string | null | undefined)[]) {
  if (value !== null && value !== undefined && String(value).trim()) {
    return `${value} years`;
  }
  return fallbackDates.filter(Boolean).join(' – ') || '—';
}

async function pickUpload(kind: 'document' | 'resume'): Promise<SelectedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: kind === 'resume'
      ? [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ]
      : ['image/*', 'application/pdf'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || (kind === 'resume' ? 'resume.pdf' : 'document.pdf'),
    mimeType: asset.mimeType,
    size: asset.size,
    // Web needs the File/Blob; without it FormData sends a string and Django rejects the upload.
    file: asset.file ?? null,
  };
}

export function EditableProfileRecords({ section, onBusyChange }: EditableProfileRecordsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [employments, setEmployments] = useState<EmploymentRecord[]>([]);
  const [educations, setEducations] = useState<EducationRecord[]>([]);
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [otherAttachments, setOtherAttachments] = useState<OtherAttachmentRecord[]>([]);
  const [extraAttachments, setExtraAttachments] = useState<ExtraAttachmentRecord[]>([]);
  const [resume, setResume] = useState<ResumeRecord | null>(null);

  const [professions, setProfessions] = useState<CatalogOption[]>([]);
  const [states, setStates] = useState<CatalogOption[]>([]);
  const [countries, setCountries] = useState<CatalogOption[]>([]);
  const [eevCategories, setEevCategories] = useState<ExtraAttachmentCategoryOption[]>([]);
  const [eevModalOpen, setEevModalOpen] = useState(false);
  const [eevDocPath, setEevDocPath] = useState<'IA' | 'BC'>('IA');
  const [eevCategory, setEevCategory] = useState<ExtraAttachmentCategoryOption | null>(null);
  const [eevSecondCategory, setEevSecondCategory] = useState<ExtraAttachmentCategoryOption | null>(null);
  const [eevFile, setEevFile] = useState<SelectedUpload | null>(null);
  const [eevSecondFile, setEevSecondFile] = useState<SelectedUpload | null>(null);
  const [eevCategoryPickerOpen, setEevCategoryPickerOpen] = useState(false);
  const [eevSecondCategoryPickerOpen, setEevSecondCategoryPickerOpen] = useState(false);
  const professionsRef = useRef<CatalogOption[]>([]);
  const eevCategoriesRef = useRef<ExtraAttachmentCategoryOption[]>([]);
  const statesRef = useRef<CatalogOption[]>([]);
  const countriesRef = useRef<CatalogOption[]>([]);

  const [employmentModalOpen, setEmploymentModalOpen] = useState(false);
  const [editingEmployment, setEditingEmployment] = useState<EmploymentRecord | null>(null);
  const [empCompany, setEmpCompany] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empSupervisor, setEmpSupervisor] = useState('');
  const [empTelephone, setEmpTelephone] = useState('');
  const [empAddress, setEmpAddress] = useState('');
  const [empDuration, setEmpDuration] = useState('');
  const [empLeaving, setEmpLeaving] = useState('');

  const [educationModalOpen, setEducationModalOpen] = useState(false);
  const [editingEducation, setEditingEducation] = useState<EducationRecord | null>(null);
  const [eduInstitute, setEduInstitute] = useState('');
  const [eduDegree, setEduDegree] = useState('');
  const [eduMajors, setEduMajors] = useState('');
  const [eduCity, setEduCity] = useState('');
  const [eduState, setEduState] = useState('');
  const [eduDuration, setEduDuration] = useState('');
  const [eduGraduated, setEduGraduated] = useState<'true' | 'false' | ''>('');
  const [eduCountry, setEduCountry] = useState<CatalogOption | null>(null);
  const [eduCountryModal, setEduCountryModal] = useState(false);

  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<LicenseRecord | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseExpiry, setLicenseExpiry] = useState('');
  const [selectedProfession, setSelectedProfession] = useState<CatalogOption | null>(null);
  const [primaryState, setPrimaryState] = useState<CatalogOption | null>(null);
  const [licenseStates, setLicenseStates] = useState<CatalogOption[]>([]);
  const [professionModal, setProfessionModal] = useState(false);
  const [primaryStateModal, setPrimaryStateModal] = useState(false);
  const [licenseStateModal, setLicenseStateModal] = useState(false);

  const [uploadTypeModal, setUploadTypeModal] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<AttachmentRecord | null>(null);
  const [cprExpiry, setCprExpiry] = useState('');
  const [pendingCredentialKey, setPendingCredentialKey] = useState<CredentialUploadKey | null>(null);

  const [otherDocModalOpen, setOtherDocModalOpen] = useState(false);
  const [editingOtherDoc, setEditingOtherDoc] = useState<OtherAttachmentRecord | null>(null);
  const [otherDocTitle, setOtherDocTitle] = useState('');
  const [otherDocFile, setOtherDocFile] = useState<SelectedUpload | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const loadRequestId = useRef(0);

  const setBusy = useCallback((value: boolean) => {
    setSaving(value);
    onBusyChange?.(value);
  }, [onBusyChange]);

  const applySectionCache = useCallback((activeSection: EditableSection) => {
    if (activeSection === 'employment-history') {
      const cached = getCachedSection('employment-history');
      if (!cached) return false;
      setEmployments(cached.data);
      return true;
    }
    if (activeSection === 'education') {
      const cached = getCachedSection('education');
      if (!cached) return false;
      setEducations(cached.data.educations);
      countriesRef.current = cached.data.countries;
      setCountries(cached.data.countries);
      return true;
    }
    if (activeSection === 'licenses') {
      const cached = getCachedSection('licenses');
      if (!cached) return false;
      setLicenses(cached.data.licenses);
      professionsRef.current = cached.data.professions;
      statesRef.current = cached.data.states;
      setProfessions(cached.data.professions);
      setStates(cached.data.states);
      return true;
    }
    const cached = getCachedSection('attachments');
    if (!cached) return false;
    setAttachments(cached.data.attachments);
    setOtherAttachments(cached.data.otherAttachments);
    setResume(cached.data.resume);
    setExtraAttachments(cached.data.extraAttachments);
    return true;
  }, []);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const requestId = ++loadRequestId.current;
    // Stale-while-revalidate: paint cache immediately, always refetch so
    // replacements made on web/admin show up without waiting on a TTL.
    const hasCache = applySectionCache(section);

    if (!hasCache) {
      setLoading(true);
    } else {
      setLoading(false);
    }
    setError(null);
    if (options?.force) setMessage(null);

    try {
      if (section === 'employment-history') {
        const rows = await fetchEmployments();
        if (requestId !== loadRequestId.current) return;
        setEmployments(rows);
        setCachedSection('employment-history', rows);
      } else if (section === 'education') {
        const [rows, countryOptions] = await Promise.all([
          fetchEducations(),
          countriesRef.current.length
            ? Promise.resolve(countriesRef.current)
            : fetchCatalogOptions('countries'),
        ]);
        if (requestId !== loadRequestId.current) return;
        setEducations(rows);
        countriesRef.current = countryOptions;
        setCountries(countryOptions);
        setCachedSection('education', { educations: rows, countries: countryOptions });
      } else if (section === 'licenses') {
        const [rows, professionOptions, stateOptions] = await Promise.all([
          fetchLicenses(),
          professionsRef.current.length
            ? Promise.resolve(professionsRef.current)
            : fetchCatalogOptions('professions'),
          statesRef.current.length
            ? Promise.resolve(statesRef.current)
            : fetchCatalogOptions('states'),
        ]);
        if (requestId !== loadRequestId.current) return;
        setLicenses(rows);
        professionsRef.current = professionOptions;
        statesRef.current = stateOptions;
        setProfessions(professionOptions);
        setStates(stateOptions);
        setCachedSection('licenses', {
          licenses: rows,
          professions: professionOptions,
          states: stateOptions,
        });
      } else {
        const [attachmentRows, otherRows, resumeRow, extraRows] = await Promise.all([
          fetchAttachments(),
          fetchOtherAttachments(),
          fetchResume(),
          fetchExtraAttachments(),
        ]);
        if (requestId !== loadRequestId.current) return;
        setAttachments(attachmentRows);
        setOtherAttachments(otherRows);
        setResume(resumeRow);
        setExtraAttachments(extraRows);
        setCachedSection('attachments', {
          attachments: attachmentRows,
          otherAttachments: otherRows,
          resume: resumeRow,
          extraAttachments: extraRows,
        });
      }
    } catch (loadError) {
      if (requestId === loadRequestId.current && !hasCache) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load records.');
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [applySectionCache, section]);

  const reloadAfterMutation = useCallback(async () => {
    invalidateProfileRecordsCache(section);
    await load({ force: true });
  }, [load, section]);

  useFocusEffect(useCallback(() => {
    const request = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(request);
      loadRequestId.current += 1;
    };
  }, [load]));

  const openDocument = async (path: string) => {
    try {
      await WebBrowser.openBrowserAsync(documentUrl(path));
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open document.');
    }
  };

  const resetEmploymentForm = () => {
    setEmpCompany('');
    setEmpJobTitle('');
    setEmpSupervisor('');
    setEmpTelephone('');
    setEmpAddress('');
    setEmpDuration('');
    setEmpLeaving('');
  };

  const openEmploymentEditor = (record?: EmploymentRecord) => {
    setEditingEmployment(record ?? null);
    setEmpCompany(record?.company || '');
    setEmpJobTitle(record?.job_title || '');
    setEmpSupervisor(record?.supervisor || '');
    setEmpTelephone(normalizePhoneInput(String(record?.telephone || '')));
    setEmpAddress(record?.address || '');
    setEmpDuration(record?.duration != null ? String(record.duration) : '');
    setEmpLeaving(record?.leaving_reason || '');
    setEmploymentModalOpen(true);
  };

  const saveEmployment = async () => {
    if (!empCompany.trim() || !empJobTitle.trim() || !empSupervisor.trim() || !empTelephone.trim()
      || !empAddress.trim() || !empDuration.trim() || !empLeaving.trim()) {
      Alert.alert('Missing fields', 'Complete all employment fields before saving.');
      return;
    }
    if (!/^\d{1,3}(\.\d)?$/.test(empDuration.trim()) || Number(empDuration) > 999.9) {
      Alert.alert('Invalid duration', 'Duration must be a number from 0 to 999.9, with up to one decimal place.');
      return;
    }
    if (!isValidUsPhone(empTelephone)) {
      Alert.alert('Invalid telephone', US_PHONE_ERROR);
      return;
    }

    const payload = {
      company: empCompany.trim(),
      job_title: empJobTitle.trim(),
      supervisor: empSupervisor.trim(),
      telephone: empTelephone.trim(),
      address: empAddress.trim(),
      duration: empDuration.trim(),
      leaving_reason: empLeaving.trim(),
    };

    setBusy(true);
    setError(null);
    try {
      if (editingEmployment?.id) {
        await updateEmployment(editingEmployment.id, payload);
        setMessage('Employment history updated.');
      } else {
        await createEmployment(payload);
        setMessage('Employment history added.');
      }
      setEmploymentModalOpen(false);
      resetEmploymentForm();
      await reloadAfterMutation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save employment history.');
    } finally {
      setBusy(false);
    }
  };

  const syncResumeCache = (next: ResumeRecord) => {
    setResume(next);
    const cached = getCachedSection('attachments');
    if (cached) {
      setCachedSection('attachments', {
        ...cached.data,
        resume: next,
      });
    }
  };

  const deleteCopy = (() => {
    if (!pendingDelete) {
      return { title: 'Delete', message: '' };
    }
    if (pendingDelete.kind === 'employment') {
      return {
        title: 'Delete employment',
        message: `Remove ${pendingDelete.record.company || 'this employment record'}?`,
      };
    }
    if (pendingDelete.kind === 'education') {
      return {
        title: 'Delete education',
        message: `Remove ${pendingDelete.record.degree || 'this education record'}?`,
      };
    }
    if (pendingDelete.kind === 'attachment') {
      return {
        title: 'Delete attachment',
        message: `Remove ${pendingDelete.record.type || 'this document'}?`,
      };
    }
    if (pendingDelete.kind === 'other') {
      return {
        title: 'Delete document',
        message: `Remove ${pendingDelete.record.title || 'this document'}?`,
      };
    }
    return {
      title: 'Delete resume',
      message: 'Remove your uploaded resume?',
    };
  })();

  const runPendingDelete = async () => {
    if (!pendingDelete || saving) return;
    const action = pendingDelete;
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'employment') {
        await deleteEmployment(action.record.id);
        setMessage('Employment history deleted.');
      } else if (action.kind === 'education') {
        await deleteEducation(action.record.id);
        setMessage('Education deleted.');
      } else if (action.kind === 'attachment') {
        await deleteAttachment(action.record.id);
        setMessage('Attachment deleted.');
      } else if (action.kind === 'other') {
        await deleteOtherAttachment(action.record.id);
        setMessage('Other document deleted.');
      } else {
        await deleteResume();
        syncResumeCache({ resume: null, has_resume: false });
        setMessage('Resume deleted.');
      }
      setPendingDelete(null);
      await reloadAfterMutation();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete.');
    } finally {
      setBusy(false);
    }
  };

  const openEducationEditor = (record?: EducationRecord) => {
    setEditingEducation(record ?? null);
    setEduInstitute(record?.institute || '');
    setEduDegree(record?.degree || '');
    setEduMajors(record?.majors || '');
    setEduCity(record?.city || '');
    setEduState(record?.state || '');
    setEduDuration(record?.duration != null ? String(record.duration) : '');
    if (record?.graduated === true) setEduGraduated('true');
    else if (record?.graduated === false) setEduGraduated('false');
    else setEduGraduated('');
    const countryId = optionId(record?.country ?? null);
    setEduCountry(
      countryId != null
        ? countries.find((item) => item.id === countryId)
          || (typeof record?.country === 'object' && record.country
            ? { id: countryId, name: optionName(record.country) || `Country #${countryId}` }
            : null)
        : null,
    );
    setEducationModalOpen(true);
  };

  const saveEducation = async () => {
    if (!eduCountry || !eduInstitute.trim() || !eduDegree.trim() || !eduMajors.trim()
      || !eduCity.trim() || !eduState.trim() || !eduDuration.trim()) {
      Alert.alert('Missing fields', 'Complete all required education fields before saving.');
      return;
    }
    if (!/^\d{1,3}(\.\d)?$/.test(eduDuration.trim()) || Number(eduDuration) > 999.9) {
      Alert.alert('Invalid duration', 'Duration must be a number from 0 to 999.9, with up to one decimal place.');
      return;
    }
    if (eduGraduated !== 'true' && eduGraduated !== 'false') {
      Alert.alert('Missing fields', 'Select whether you graduated.');
      return;
    }

    const payload = {
      country: eduCountry.id,
      state: eduState.trim(),
      institute: eduInstitute.trim(),
      degree: eduDegree.trim(),
      majors: eduMajors.trim(),
      city: eduCity.trim(),
      duration: eduDuration.trim(),
      graduated: eduGraduated === 'true',
    };

    setBusy(true);
    setError(null);
    try {
      if (editingEducation?.id) {
        await updateEducation(editingEducation.id, payload);
        setMessage('Education updated.');
      } else {
        await createEducation(payload);
        setMessage('Education added.');
      }
      setEducationModalOpen(false);
      await reloadAfterMutation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save education.');
    } finally {
      setBusy(false);
    }
  };


  const openLicenseEditor = (record?: LicenseRecord) => {
    setEditingLicense(record ?? null);
    setLicenseNumber(record?.number || '');
    setLicenseExpiry(record?.expiry_date || '');
    const professionId = optionId(record?.profession ?? null);
    setSelectedProfession(
      professionId != null
        ? professions.find((item) => item.id === professionId)
          || (typeof record?.profession === 'object' && record.profession
            ? { id: professionId, name: optionName(record.profession) || `Profession #${professionId}` }
            : null)
        : null,
    );
    const primaryId = optionId(record?.primary_state ?? null);
    setPrimaryState(
      primaryId != null
        ? states.find((item) => item.id === primaryId)
          || (typeof record?.primary_state === 'object' && record.primary_state
            ? { id: primaryId, name: optionName(record.primary_state) || `State #${primaryId}` }
            : null)
        : null,
    );
    const selectedStates = Array.isArray(record?.state)
      ? record.state
        .map((item) => {
          const id = optionId(item);
          if (id == null) return null;
          return states.find((state) => state.id === id)
            || (typeof item === 'object' ? { id, name: optionName(item) || `State #${id}` } : { id, name: `State #${id}` });
        })
        .filter((item): item is CatalogOption => Boolean(item))
      : [];
    setLicenseStates(selectedStates);
    setLicenseModalOpen(true);
  };

  const toggleLicenseState = (option: CatalogOption) => {
    setLicenseStates((current) => (
      current.some((item) => item.id === option.id)
        ? current.filter((item) => item.id !== option.id)
        : [...current, option]
    ));
  };

  const saveLicense = async () => {
    const formattedExpiry = normalizeApiDate(licenseExpiry);
    if (!selectedProfession || !licenseNumber.trim() || !primaryState || !licenseStates.length || !formattedExpiry) {
      Alert.alert('Missing fields', 'Complete profession, number, state(s), primary state, and expiry date.');
      return;
    }

    const payload = {
      number: licenseNumber.trim(),
      expiry_date: formattedExpiry,
      profession: selectedProfession.id,
      primary_state: primaryState.id,
      state: licenseStates.map((item) => item.id),
    };

    setBusy(true);
    setError(null);
    try {
      if (editingLicense?.id) {
        await renewLicense(editingLicense.id, payload);
        setMessage(
          isLicenseExpired(editingLicense.expiry_date)
            ? 'License renewal submitted for review.'
            : 'License updated and submitted for review.',
        );
      } else {
        await createLicense(payload);
        setMessage('License added.');
      }
      setLicenseModalOpen(false);
      await reloadAfterMutation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save license.');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadCredential = async (key: CredentialUploadKey) => {
    if (key === 'cpr' && !normalizeApiDate(cprExpiry)) {
      Alert.alert('CPR expiry required', 'Select a CPR expiry date under CPR Card or Certificate first.');
      return;
    }
    setPendingCredentialKey(key);
    const file = await pickUpload('document');
    if (!file) {
      setPendingCredentialKey(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadCredential({
        key,
        file,
        expiryDate: key === 'cpr' ? normalizeApiDate(cprExpiry) : null,
      });
      setMessage('Credential uploaded.');
      setUploadTypeModal(false);
      setPendingCredentialKey(null);
      setCprExpiry('');
      await reloadAfterMutation();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload credential.');
    } finally {
      setBusy(false);
      setPendingCredentialKey(null);
    }
  };

  const closeUploadModal = () => {
    if (saving) return;
    setUploadTypeModal(false);
    setPendingCredentialKey(null);
  };

  const handleReplaceAttachment = async (record: AttachmentRecord) => {
    const needsExpiry = isCprAttachment(record);
    if (needsExpiry && !normalizeApiDate(cprExpiry) && !record.expiry_date) {
      setReplaceTarget(record);
      Alert.alert('CPR expiry', 'Enter a CPR expiry date, then tap Replace again.');
      return;
    }
    const file = await pickUpload('document');
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await replaceAttachment(record.id, {
        file,
        expiryDate: needsExpiry
          ? (normalizeApiDate(cprExpiry) || record.expiry_date || null)
          : null,
      });
      setMessage('Attachment replaced.');
      setReplaceTarget(null);
      setCprExpiry('');
      await reloadAfterMutation();
    } catch (replaceError) {
      setError(replaceError instanceof Error ? replaceError.message : 'Unable to replace attachment.');
    } finally {
      setBusy(false);
    }
  };


  const handleResumeUpload = async () => {
    const file = await pickUpload('resume');
    if (!file) return;
    const wasReplacing = Boolean(resume?.has_resume);
    setBusy(true);
    setError(null);
    try {
      const next = await uploadResume(file);
      syncResumeCache(next);
      setMessage(wasReplacing ? 'Resume replaced.' : 'Resume uploaded.');
      await reloadAfterMutation();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Unable to upload resume.');
    } finally {
      setBusy(false);
    }
  };


  const openOtherDocEditor = (record?: OtherAttachmentRecord) => {
    setEditingOtherDoc(record ?? null);
    setOtherDocTitle(record?.title || '');
    setOtherDocFile(null);
    setOtherDocModalOpen(true);
  };

  const saveOtherDoc = async () => {
    const title = otherDocTitle.trim();
    if (!title) {
      Alert.alert('Missing title', 'Enter a document title.');
      return;
    }
    if (!editingOtherDoc && !otherDocFile) {
      Alert.alert('Missing file', 'Upload a document file.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingOtherDoc?.id) {
        await updateOtherAttachment(editingOtherDoc.id, {
          title,
          file: otherDocFile,
        });
        setMessage('Other document updated.');
      } else if (otherDocFile) {
        await createOtherAttachment({ title, file: otherDocFile });
        setMessage('Other document added.');
      }
      setOtherDocModalOpen(false);
      setEditingOtherDoc(null);
      setOtherDocTitle('');
      setOtherDocFile(null);
      await reloadAfterMutation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save other document.');
    } finally {
      setBusy(false);
    }
  };

  const resetEevForm = (path: 'IA' | 'BC' = 'IA') => {
    setEevDocPath(path);
    setEevCategory(null);
    setEevSecondCategory(null);
    setEevFile(null);
    setEevSecondFile(null);
  };

  const selectEevDocPath = (path: 'IA' | 'BC') => {
    // Re-tapping the already selected path must not wipe a chosen document type/file.
    if (path === eevDocPath) return;
    resetEevForm(path);
  };

  const openEevEditor = async () => {
    setBusy(true);
    setError(null);
    try {
      const categories = eevCategoriesRef.current.length
        ? eevCategoriesRef.current
        : await fetchExtraAttachmentCategories();
      eevCategoriesRef.current = categories;
      setEevCategories(categories);
      resetEevForm(extraAttachments.length > 1 ? 'BC' : 'IA');
      setEevModalOpen(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load document types.');
    } finally {
      setBusy(false);
    }
  };

  const saveEevDocuments = async () => {
    const eevMismatch = eevPathMismatchMessage(eevDocPath, eevCategory, eevSecondCategory);
    if (eevMismatch || !eevCategory) {
      Alert.alert(
        'Missing document type',
        eevMismatch || 'Select an employment eligibility document type.',
      );
      return;
    }
    if (!eevFile) {
      Alert.alert(
        'Missing file',
        eevDocPath === 'IA' ? 'Upload the selected document.' : 'Upload the identity document.',
      );
      return;
    }
    if (eevDocPath === 'BC' && !eevSecondFile) {
      Alert.alert('Missing file', 'Upload the employment authorization document.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await uploadExtraAttachments({
        category1Id: eevCategory.id,
        file1: eevFile,
        category2Id: eevDocPath === 'BC' ? eevSecondCategory?.id : null,
        file2: eevDocPath === 'BC' ? eevSecondFile : null,
      });
      setMessage('Employment eligibility documents updated.');
      setEevModalOpen(false);
      resetEevForm();
      await reloadAfterMutation();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update eligibility documents.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingBlock} accessibilityLabel="Loading records" accessibilityRole="progressbar">
        <View style={styles.card}>
          <Skeleton style={{ width: '46%', height: 16 }} />
          <SkeletonLines count={3} />
        </View>
        <View style={styles.card}>
          <Skeleton style={{ width: '58%', height: 16 }} />
          <SkeletonLines count={2} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => void load({ force: true })}>
            <Text style={styles.link}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {message ? <Text style={styles.successText}>{message}</Text> : null}

      {section === 'employment-history' ? (
        <>
          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={() => openEmploymentEditor()}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Add employment</Text>
          </Pressable>
          {employments.length ? employments.map((record) => (
            <View key={record.id} style={styles.card}>
              <Text style={styles.cardTitle}>{record.company || 'Employer'}</Text>
              <Text style={styles.muted}>{record.job_title || '—'}</Text>
              <Text style={styles.muted}>Supervisor: {record.supervisor || '—'}</Text>
              <Text style={styles.muted}>
                Phone: {record.telephone ? formatPhoneNumber(record.telephone) : '—'}
              </Text>
              <Text style={styles.muted}>
                Duration: {durationLabel(record.duration, [record.from_date, record.to_date])}
              </Text>
              <Text style={styles.muted}>{record.address || ''}</Text>
              {record.leaving_reason ? <Text style={styles.muted}>Left: {record.leaving_reason}</Text> : null}
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onPress={() => openEmploymentEditor(record)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={saving}
                  onPress={() => setPendingDelete({ kind: 'employment', record })}>
                  <Text style={styles.dangerButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )) : <Empty text="No employment history yet." />}
        </>
      ) : null}

      {section === 'education' ? (
        <>
          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={() => openEducationEditor()}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Add education</Text>
          </Pressable>
          {educations.length ? educations.map((record) => (
            <View key={record.id} style={styles.card}>
              <Text style={styles.cardTitle}>{record.degree || 'Degree'}</Text>
              <Text style={styles.muted}>{record.institute || '—'}</Text>
              <Text style={styles.muted}>Major: {record.majors || '—'}</Text>
              <Text style={styles.muted}>
                Duration: {durationLabel(record.duration, [record.start_date, record.end_date])}
              </Text>
              <Text style={styles.muted}>
                {[record.city, record.state, optionName(record.country)].filter(Boolean).join(', ')}
              </Text>
              <Text style={styles.muted}>
                Graduated:{' '}
                {record.graduated === true ? 'Yes' : record.graduated === false ? 'No' : '—'}
              </Text>
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onPress={() => openEducationEditor(record)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={saving}
                  onPress={() => setPendingDelete({ kind: 'education', record })}>
                  <Text style={styles.dangerButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )) : <Empty text="No education records yet." />}
        </>
      ) : null}

      {section === 'licenses' ? (
        <>
          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={() => openLicenseEditor()}>
            <MaterialIcons name="add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Add license</Text>
          </Pressable>
          <Text style={styles.helpText}>
            You can hold multiple licenses. Renew an expired license to resubmit it for review.
          </Text>
          {licenses.length ? licenses.map((record) => {
            const expired = isLicenseExpired(record.expiry_date);
            return (
              <View key={record.id} style={styles.card}>
                <Text style={styles.cardTitle}>{optionName(record.profession) || 'License'}</Text>
                <Text style={styles.muted}>Number: {record.number || '—'}</Text>
                <Text style={styles.muted}>Primary state: {optionName(record.primary_state) || '—'}</Text>
                <Text style={styles.muted}>
                  States: {Array.isArray(record.state) ? record.state.map(optionName).filter(Boolean).join(', ') : '—'}
                </Text>
                <Text style={styles.muted}>Expiry: {record.expiry_date || '—'}</Text>
                <Text style={styles.muted}>Status: {licenseStatusLabel(record.status)}</Text>
                {expired ? (
                  <Pressable
                    accessibilityRole="button"
                    style={[styles.primaryButton, saving && styles.disabled]}
                    disabled={saving}
                    onPress={() => openLicenseEditor(record)}>
                    <Text style={styles.primaryButtonText}>Renew</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }) : <Empty text="No licenses yet." />}
        </>
      ) : null}

      {section === 'attachments' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Resume</Text>
            {resume?.has_resume && resume.resume ? (
              <Pressable
                accessibilityRole="button"
                style={styles.documentRow}
                onPress={() => void openDocument(resume.resume!)}>
                <MaterialIcons name="description" size={22} color={FORM_PRIMARY} />
                <Text style={styles.documentLabel} numberOfLines={1}>{fileName(resume.resume)}</Text>
                <MaterialIcons name="open-in-new" size={18} color="#667085" />
              </Pressable>
            ) : (
              <Text style={styles.muted}>No resume uploaded.</Text>
            )}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.secondaryButton}
                disabled={saving}
                onPress={() => void handleResumeUpload()}>
                <Text style={styles.secondaryButtonText}>{resume?.has_resume ? 'Replace' : 'Upload'}</Text>
              </Pressable>
              {resume?.has_resume ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={saving}
                  onPress={() => setPendingDelete({ kind: 'resume' })}>
                  <Text style={styles.dangerButtonText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={() => setUploadTypeModal(true)}>
            <MaterialIcons name="upload-file" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Upload credential</Text>
          </Pressable>

          {attachments.length ? attachments.map((record) => (
            <View key={record.id} style={styles.card}>
              <Text style={styles.cardTitle}>{record.type || 'Credential'}</Text>
              {isCprAttachment(record) ? (
                <Text style={styles.muted}>Expiry: {record.expiry_date || '—'}</Text>
              ) : null}
              {typeof record.file === 'string' && record.file ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.documentRow}
                  onPress={() => void openDocument(record.file!)}>
                  <MaterialIcons name="description" size={22} color={FORM_PRIMARY} />
                  <Text style={styles.documentLabel} numberOfLines={1}>{fileName(record.file)}</Text>
                  <MaterialIcons name="open-in-new" size={18} color="#667085" />
                </Pressable>
              ) : null}
              {isCprAttachment(record) ? (
                <IconDateField
                  {...fieldColors}
                  placeholder="CPR expiry date"
                  value={cprExpiry || record.expiry_date || ''}
                  onChange={setCprExpiry}
                  minimumDate={new Date()}
                />
              ) : null}
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onPress={() => {
                    setReplaceTarget(record);
                    void handleReplaceAttachment(record);
                  }}>
                  <Text style={styles.secondaryButtonText}>Replace</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={saving}
                  onPress={() => setPendingDelete({ kind: 'attachment', record })}>
                  <Text style={styles.dangerButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )) : <Empty text="No credential attachments yet." />}

          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={() => openOtherDocEditor()}>
            <MaterialIcons name="note-add" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Add other document</Text>
          </Pressable>

          {otherAttachments.length ? otherAttachments.map((record) => (
            <View key={`other-${record.id}`} style={styles.card}>
              <Text style={styles.cardTitle}>{record.title || 'Other document'}</Text>
              {typeof record.file === 'string' && record.file ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.documentRow}
                  onPress={() => void openDocument(record.file!)}>
                  <MaterialIcons name="description" size={22} color={FORM_PRIMARY} />
                  <Text style={styles.documentLabel} numberOfLines={1}>{fileName(record.file)}</Text>
                  <MaterialIcons name="open-in-new" size={18} color="#667085" />
                </Pressable>
              ) : (
                <Text style={styles.muted}>No file on record.</Text>
              )}
              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                  disabled={saving}
                  onPress={() => openOtherDocEditor(record)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.dangerButton}
                  disabled={saving}
                  onPress={() => setPendingDelete({ kind: 'other', record })}>
                  <Text style={styles.dangerButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          )) : <Empty text="No other documents yet." />}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Employment eligibility</Text>
            <Text style={styles.helpText}>
              Acceptable documents — one document for both identity and employment, or one identity document plus one employment authorization document.
            </Text>
            {extraAttachments.length ? (
              extraAttachments.map((record) => (
                <Pressable
                  key={record.id}
                  accessibilityRole="button"
                  style={styles.documentRow}
                  disabled={typeof record.file !== 'string' || !record.file}
                  onPress={() => {
                    if (typeof record.file === 'string' && record.file) void openDocument(record.file);
                  }}>
                  <MaterialIcons name="badge" size={22} color={FORM_PRIMARY} />
                  <View style={styles.flex}>
                    <Text style={styles.documentLabel}>
                      {optionName(record.category) || `Eligibility #${record.id}`}
                    </Text>
                    {record.expiry_date ? <Text style={styles.muted}>Expires {record.expiry_date}</Text> : null}
                  </View>
                  <MaterialIcons name="open-in-new" size={18} color="#667085" />
                </Pressable>
              ))
            ) : (
              <Text style={styles.muted}>No eligibility documents on file.</Text>
            )}
            <Pressable
              accessibilityRole="button"
              style={[styles.primaryButton, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void openEevEditor()}>
              <MaterialIcons name="upload-file" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {extraAttachments.length ? 'Replace documents' : 'Upload documents'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <FormModal
        visible={employmentModalOpen}
        title={editingEmployment ? 'Edit employment' : 'Add employment'}
        onClose={() => setEmploymentModalOpen(false)}
        onSave={() => void saveEmployment()}
        saving={saving}>
        <IconTextInput {...fieldColors} icon="business" placeholder="Company *" value={empCompany} onChangeText={setEmpCompany} />
        <IconTextInput {...fieldColors} icon="work-outline" placeholder="Job title *" value={empJobTitle} onChangeText={setEmpJobTitle} />
        <IconTextInput {...fieldColors} icon="person-outline" placeholder="Supervisor *" value={empSupervisor} onChangeText={setEmpSupervisor} />
        <IconTextInput
          {...fieldColors}
          icon="phone"
          placeholder="Telephone *"
          value={formatPhoneNumber(empTelephone)}
          onChangeText={(value) => setEmpTelephone(normalizePhoneInput(value))}
          keyboardType="phone-pad"
          maxLength={US_PHONE_INPUT_MAX_LENGTH}
        />
        <IconTextInput {...fieldColors} icon="location-on" placeholder="Address *" value={empAddress} onChangeText={setEmpAddress} />
        <IconTextInput
          {...fieldColors}
          icon="timelapse"
          placeholder="Duration in years * (e.g. 3.5)"
          value={empDuration}
          onChangeText={setEmpDuration}
          keyboardType="decimal-pad"
        />
        <IconTextInput
          {...fieldColors}
          icon="notes"
          placeholder="Reason for leaving *"
          value={empLeaving}
          onChangeText={setEmpLeaving}
          multiline
        />
      </FormModal>

      <FormModal
        visible={educationModalOpen}
        title={editingEducation ? 'Edit education' : 'Add education'}
        onClose={() => setEducationModalOpen(false)}
        onSave={() => void saveEducation()}
        saving={saving}>
        <IconTextInput {...fieldColors} icon="school" placeholder="Degree *" value={eduDegree} onChangeText={setEduDegree} />
        <IconTextInput {...fieldColors} icon="account-balance" placeholder="Institute *" value={eduInstitute} onChangeText={setEduInstitute} />
        <IconTextInput {...fieldColors} icon="menu-book" placeholder="Majors *" value={eduMajors} onChangeText={setEduMajors} />
        <SelectField
          label={eduCountry?.name || 'Country *'}
          onPress={() => setEduCountryModal(true)}
        />
        <IconTextInput {...fieldColors} icon="map" placeholder="State *" value={eduState} onChangeText={setEduState} />
        <IconTextInput {...fieldColors} icon="location-city" placeholder="City *" value={eduCity} onChangeText={setEduCity} />
        <IconTextInput
          {...fieldColors}
          icon="timelapse"
          placeholder="Duration in years * (e.g. 4)"
          value={eduDuration}
          onChangeText={setEduDuration}
          keyboardType="decimal-pad"
        />
        <Text style={styles.helpText}>Did you graduate? *</Text>
        <View style={styles.choiceRow}>
          {([
            { value: 'true' as const, label: 'Yes' },
            { value: 'false' as const, label: 'No' },
          ]).map(({ value, label }) => {
            const selected = eduGraduated === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.choiceOption, selected && styles.choiceOptionSelected]}
                onPress={() => setEduGraduated(value)}>
                <MaterialIcons
                  name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={FORM_PRIMARY}
                />
                <Text style={styles.choiceOptionText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </FormModal>

      <ConfirmModal
        visible={pendingDelete != null}
        title={deleteCopy.title}
        message={deleteCopy.message}
        busy={saving}
        onCancel={() => {
          if (!saving) setPendingDelete(null);
        }}
        onConfirm={() => void runPendingDelete()}
      />

      <FormModal
        visible={otherDocModalOpen}
        title={editingOtherDoc ? 'Edit other document' : 'Add other document'}
        onClose={() => {
          setOtherDocModalOpen(false);
          setEditingOtherDoc(null);
          setOtherDocTitle('');
          setOtherDocFile(null);
        }}
        onSave={() => void saveOtherDoc()}
        saving={saving}>
        <IconTextInput
          {...fieldColors}
          icon="title"
          placeholder="Document title *"
          value={otherDocTitle}
          onChangeText={(value) => setOtherDocTitle(value.slice(0, 150))}
          maxLength={150}
        />
        <Pressable
          accessibilityRole="button"
          style={styles.documentRow}
          onPress={() => {
            void (async () => {
              const selected = await pickUpload('document');
              if (selected) setOtherDocFile(selected);
            })();
          }}>
          <MaterialIcons name={otherDocFile ? 'insert-drive-file' : 'file-upload'} size={22} color={FORM_PRIMARY} />
          <Text style={styles.documentLabel} numberOfLines={1}>
            {otherDocFile?.name
              || (editingOtherDoc?.file ? `Keep current: ${fileName(editingOtherDoc.file)}` : 'Upload file *')}
          </Text>
        </Pressable>
        {editingOtherDoc ? (
          <Text style={styles.helpText}>Leave the file empty to keep the current document and only update the title.</Text>
        ) : null}
      </FormModal>

      <FormModal
        visible={licenseModalOpen}
        title={editingLicense ? (isLicenseExpired(editingLicense.expiry_date) ? 'Renew license' : 'Edit license') : 'Add license'}
        onClose={() => setLicenseModalOpen(false)}
        onSave={() => void saveLicense()}
        saving={saving}>
        <SelectField
          label={selectedProfession?.name || 'Profession *'}
          onPress={() => setProfessionModal(true)}
        />
        <IconTextInput
          {...fieldColors}
          icon="confirmation-number"
          placeholder="License number *"
          value={licenseNumber}
          onChangeText={setLicenseNumber}
        />
        <SelectField
          label={primaryState?.name || 'Primary state *'}
          onPress={() => setPrimaryStateModal(true)}
        />
        <SelectField
          label={licenseStates.length ? licenseStates.map((item) => item.name).join(', ') : 'License state(s) *'}
          onPress={() => setLicenseStateModal(true)}
        />
        <IconDateField
          {...fieldColors}
          placeholder="Expiry date *"
          value={licenseExpiry}
          onChange={setLicenseExpiry}
          minimumDate={new Date()}
        />
      </FormModal>

      <Modal visible={uploadTypeModal} animationType="slide" transparent onRequestClose={closeUploadModal}>
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss upload credential"
            style={StyleSheet.absoluteFill}
            onPress={closeUploadModal}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>Upload credential</Text>
              <Pressable accessibilityRole="button" onPress={closeUploadModal} hitSlop={8} disabled={saving}>
                <MaterialIcons name="close" size={22} color="#667085" />
              </Pressable>
            </View>
            <Text style={styles.helpText}>Choose a document type to upload.</Text>
            <ScrollView
              style={styles.uploadTypeScroll}
              contentContainerStyle={styles.uploadTypeList}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled>
              {CREDENTIAL_UPLOAD_TYPES.map((item) => {
                const isCpr = item.key === 'cpr';
                return (
                  <View key={item.key} style={[styles.credentialOption, isCpr && styles.credentialOptionCpr]}>
                    <Pressable
                      accessibilityRole="button"
                      style={styles.credentialOptionRow}
                      disabled={saving}
                      onPress={() => void handleUploadCredential(item.key)}>
                      <Text style={styles.selectText}>{item.label}</Text>
                      {pendingCredentialKey === item.key && saving ? (
                        <ActivityIndicator color={FORM_PRIMARY} />
                      ) : (
                        <MaterialIcons name="upload-file" size={20} color={FORM_PRIMARY} />
                      )}
                    </Pressable>
                    {isCpr ? (
                      <View style={styles.cprExpiryBlock}>
                        <Text style={styles.cprExpiryLabel}>CPR expiry date *</Text>
                        <IconDateField
                          {...fieldColors}
                          placeholder="Select CPR expiry date"
                          value={cprExpiry}
                          onChange={setCprExpiry}
                          minimumDate={new Date()}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              style={styles.modalDismissButton}
              disabled={saving}
              onPress={closeUploadModal}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <OptionPickerModal
        visible={eduCountryModal}
        title="Select country"
        options={countries}
        selectedIds={eduCountry ? [eduCountry.id] : []}
        onClose={() => setEduCountryModal(false)}
        onSelect={(option) => {
          setEduCountry(option);
          setEduCountryModal(false);
        }}
      />
      <OptionPickerModal
        visible={professionModal}
        title="Select profession"
        options={professions}
        selectedIds={selectedProfession ? [selectedProfession.id] : []}
        onClose={() => setProfessionModal(false)}
        onSelect={(option) => {
          setSelectedProfession(option);
          setProfessionModal(false);
        }}
      />
      <OptionPickerModal
        visible={primaryStateModal}
        title="Select primary state"
        options={states}
        selectedIds={primaryState ? [primaryState.id] : []}
        onClose={() => setPrimaryStateModal(false)}
        onSelect={(option) => {
          setPrimaryState(option);
          setPrimaryStateModal(false);
        }}
      />
      <OptionPickerModal
        visible={licenseStateModal}
        title="Select license states"
        options={states}
        multi
        selectedIds={licenseStates.map((item) => item.id)}
        onClose={() => setLicenseStateModal(false)}
        onSelect={toggleLicenseState}
      />

      <FormModal
        visible={eevModalOpen}
        title="Employment eligibility documents"
        onClose={() => {
          if (!saving) {
            setEevModalOpen(false);
            resetEevForm();
          }
        }}
        onSave={() => void saveEevDocuments()}
        saving={saving}>
        <Text style={styles.helpText}>Acceptable documents — choose one option:</Text>
        <Pressable
          accessibilityRole="button"
          style={[styles.choiceOption, eevDocPath === 'IA' && styles.choiceOptionSelected]}
          onPress={() => selectEevDocPath('IA')}>
          <MaterialIcons
            name={eevDocPath === 'IA' ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={20}
            color={FORM_PRIMARY}
          />
          <Text style={[styles.choiceOptionText, { flex: 1 }]}>
            One document that establishes both identity and employment eligibility
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.choiceOption, eevDocPath === 'BC' && styles.choiceOptionSelected]}
          onPress={() => selectEevDocPath('BC')}>
          <MaterialIcons
            name={eevDocPath === 'BC' ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={20}
            color={FORM_PRIMARY}
          />
          <Text style={[styles.choiceOptionText, { flex: 1 }]}>
            One identity document and one employment authorization document
          </Text>
        </Pressable>

        {eevDocPath === 'IA' ? (
          <>
            <SelectField
              label={eevCategory?.name || 'Document (both identity & employment) *'}
              onPress={() => setEevCategoryPickerOpen(true)}
            />
            {eevCategory ? (
              <Pressable
                accessibilityRole="button"
                style={styles.documentRow}
                onPress={() => {
                  void (async () => {
                    const selected = await pickUpload('document');
                    if (selected) setEevFile(selected);
                  })();
                }}>
                <MaterialIcons name={eevFile ? 'insert-drive-file' : 'file-upload'} size={22} color={FORM_PRIMARY} />
                <Text style={styles.documentLabel} numberOfLines={1}>
                  {eevFile?.name || 'Upload document *'}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <SelectField
              label={eevCategory?.name || 'Identity document *'}
              onPress={() => setEevCategoryPickerOpen(true)}
            />
            {eevCategory ? (
              <Pressable
                accessibilityRole="button"
                style={styles.documentRow}
                onPress={() => {
                  void (async () => {
                    const selected = await pickUpload('document');
                    if (selected) setEevFile(selected);
                  })();
                }}>
                <MaterialIcons name={eevFile ? 'insert-drive-file' : 'file-upload'} size={22} color={FORM_PRIMARY} />
                <Text style={styles.documentLabel} numberOfLines={1}>
                  {eevFile?.name || 'Upload identity document *'}
                </Text>
              </Pressable>
            ) : null}

            <SelectField
              label={eevSecondCategory?.name || 'Employment authorization document *'}
              onPress={() => setEevSecondCategoryPickerOpen(true)}
            />
            {eevSecondCategory ? (
              <Pressable
                accessibilityRole="button"
                style={styles.documentRow}
                onPress={() => {
                  void (async () => {
                    const selected = await pickUpload('document');
                    if (selected) setEevSecondFile(selected);
                  })();
                }}>
                <MaterialIcons name={eevSecondFile ? 'insert-drive-file' : 'file-upload'} size={22} color={FORM_PRIMARY} />
                <Text style={styles.documentLabel} numberOfLines={1}>
                  {eevSecondFile?.name || 'Upload employment authorization document *'}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </FormModal>

      <OptionPickerModal
        visible={eevCategoryPickerOpen}
        title={eevDocPath === 'IA' ? 'Select document' : 'Select identity document'}
        options={eevCategories.filter((item) => item.category === (eevDocPath === 'IA' ? 'IA' : 'ID'))}
        selectedIds={eevCategory ? [eevCategory.id] : []}
        onClose={() => setEevCategoryPickerOpen(false)}
        onSelect={(option) => {
          setEevCategory({
            id: Number(option.id),
            name: option.name,
            category: eevDocPath === 'IA' ? 'IA' : 'ID',
          });
          setEevCategoryPickerOpen(false);
        }}
      />
      <OptionPickerModal
        visible={eevSecondCategoryPickerOpen}
        title="Select employment authorization document"
        options={eevCategories.filter((item) => item.category === 'AU')}
        selectedIds={eevSecondCategory ? [eevSecondCategory.id] : []}
        onClose={() => setEevSecondCategoryPickerOpen(false)}
        onSelect={(option) => {
          setEevSecondCategory({
            id: Number(option.id),
            name: option.name,
            category: 'AU',
          });
          setEevSecondCategoryPickerOpen(false);
        }}
      />
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.stateCard}>
      <MaterialIcons name="inbox" size={28} color="#98a2b3" />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function SelectField({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.selectField} onPress={onPress}>
      <Text style={styles.selectText}>{label}</Text>
      <MaterialIcons name="arrow-drop-down" size={22} color="#6b7280" />
    </Pressable>
  );
}

function FormModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color="#667085" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            style={[styles.primaryButton, saving && styles.disabled]}
            disabled={saving}
            onPress={onSave}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Save</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, width: '100%', maxWidth: '100%' },
  card: {
    width: '100%',
    maxWidth: '100%',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  cardTitle: { color: '#263341', fontSize: 16, fontWeight: '700' },
  muted: { color: '#667085', fontSize: 13 },
  helpText: { color: '#5e6875', fontSize: 13, lineHeight: 18 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceOption: {
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
  choiceOptionSelected: {
    borderColor: FORM_PRIMARY,
    backgroundColor: '#eaf3fb',
  },
  choiceOptionText: { color: '#344054', fontSize: 14, fontWeight: '700' },
  successText: { color: '#027a48', fontSize: 13, fontWeight: '600' },
  errorBanner: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#fef3f2',
    borderWidth: 1,
    borderColor: '#fecdca',
  },
  errorText: { color: '#b42318', fontSize: 13 },
  link: { color: FORM_PRIMARY, fontSize: 13, fontWeight: '700' },
  primaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: FORM_PRIMARY,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: FORM_PRIMARY, fontSize: 13, fontWeight: '700' },
  dangerButton: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#b42318',
    paddingHorizontal: 12,
  },
  dangerButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  documentRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  documentLabel: { flex: 1, color: '#344054', fontSize: 14, fontWeight: '500' },
  flex: { flex: 1, gap: 2 },
  loadingBlock: {
    width: '100%',
    gap: 12,
  },
  stateCard: {
    width: '100%',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e7edf3',
    backgroundColor: '#fff',
  },
  selectField: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8e0e8',
    backgroundColor: '#f5f8fb',
  },
  selectText: { flex: 1, color: '#263341', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalCard: {
    maxHeight: '88%',
    gap: 12,
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  uploadTypeScroll: {
    maxHeight: 420,
    flexGrow: 0,
  },
  uploadTypeList: {
    gap: 10,
    paddingBottom: 4,
  },
  credentialOption: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8e0e8',
    backgroundColor: '#f5f8fb',
    overflow: 'hidden',
  },
  credentialOptionCpr: {
    borderColor: FORM_PRIMARY,
    backgroundColor: '#f3f8fc',
  },
  credentialOptionRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  cprExpiryBlock: {
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#d8e0e8',
    backgroundColor: '#fff',
  },
  cprExpiryLabel: {
    marginTop: 10,
    color: '#344054',
    fontSize: 13,
    fontWeight: '600',
  },
  modalDismissButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: FORM_PRIMARY,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
  },
  formContent: { gap: 10, paddingBottom: 8 },
  disabled: { opacity: 0.6 },
});
