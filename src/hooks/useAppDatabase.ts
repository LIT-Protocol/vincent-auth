import { useState } from 'react';

interface AppData {
  _id: string;
  contactEmail: string;
  description: string;
  managementWallet: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface AppInfo {
  data: AppData;
  success: boolean;
}

export function useAppDatabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const getApplicationByAppId = async (appId: string): Promise<AppInfo | undefined> => {
    try {
      setLoading(true);
      const getAppResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/appMetadata/${appId}`);
      const data = await getAppResponse.json();
      return data;
    } catch (err) {
      console.error('Error fetching app:', err);
      setError(err as Error);
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  return {
    getApplicationByAppId,
    loading,
    error
  };
} 