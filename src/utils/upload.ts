import { Platform } from 'react-native';

export type SelectedUpload = {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  file?: Blob | null;
};

type NativeUpload = {
  uri: string;
  name: string;
  type: string;
};

/**
 * Ensure web picks have a real Blob/File before FormData append.
 * Expo DocumentPicker/ImagePicker expose `file` on web; otherwise we fetch the blob URI.
 */
export async function materializeUpload(upload: SelectedUpload): Promise<SelectedUpload> {
  if (upload.file) return upload;

  const needsBlob =
    Platform.OS === 'web'
    || upload.uri.startsWith('blob:')
    || upload.uri.startsWith('data:');

  if (!needsBlob) return upload;

  try {
    const response = await fetch(upload.uri);
    if (!response.ok) {
      throw new Error('Unable to read the selected file. Please choose it again.');
    }
    const blob = await response.blob();
    const file = upload.mimeType && !blob.type
      ? new Blob([blob], { type: upload.mimeType })
      : blob;
    return { ...upload, file };
  } catch (error) {
    // After a refresh, draft-restored blob: URIs are usually revoked / invalid.
    if (
      error instanceof TypeError
      || (error instanceof Error && /failed to fetch/i.test(error.message))
    ) {
      throw new Error(
        `Unable to read "${upload.name || 'the selected file'}". Re-select it and submit again.`,
      );
    }
    throw error;
  }
}

export function appendUpload(formData: FormData, key: string, upload: SelectedUpload) {
  if (upload.file) {
    formData.append(key, upload.file, upload.name);
    return;
  }

  if (Platform.OS === 'web') {
    throw new Error('Selected file is missing upload data. Please choose the file again.');
  }

  const nativeFormData = formData as FormData & {
    append(name: string, value: NativeUpload): void;
  };
  nativeFormData.append(key, {
    uri: upload.uri,
    name: upload.name,
    type: upload.mimeType || 'application/octet-stream',
  });
}

export async function appendUploadAsync(
  formData: FormData,
  key: string,
  upload: SelectedUpload,
) {
  appendUpload(formData, key, await materializeUpload(upload));
}

/**
 * Keep Accept, but do not set Content-Type.
 * Apisauce defaults to application/json; apiClient strips Content-Type for FormData
 * so the runtime can attach `multipart/form-data; boundary=...`.
 */
export const multipartRequestConfig = {
  headers: {
    Accept: 'application/json',
  },
};
