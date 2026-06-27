import api from './client';

export async function uploadBackupFile(file: File): Promise<{ detail: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const { data } = await api.post<{ detail: string }>('/system/restore-backup/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
}
