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

export function appendUpload(formData: FormData, key: string, upload: SelectedUpload) {
  if (upload.file) {
    formData.append(key, upload.file, upload.name);
    return;
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

export const multipartRequestConfig = {
  headers: { 'Content-Type': 'multipart/form-data' },
};
