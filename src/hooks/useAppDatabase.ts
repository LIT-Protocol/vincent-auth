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

interface RoleData {
  roleName: string;
  roleDescription: string;
  roleId: string;
  toolPolicy: any[];
}

export interface AppInfo {
  data: AppData;
  success: boolean;
}

export interface RoleInfo {
  data: RoleData;
  success: boolean;
}

export function useAppDatabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const getApplicationByManagementWallet = async (managementWallet: string, roleId: string): Promise<[AppInfo | undefined, RoleInfo | undefined]> => {
    try {
      setLoading(true);
      
      // Fetch both app metadata and role data in parallel
      const [appResponse, roleResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/appMetadata/${managementWallet}?roleId=${roleId}`),
        fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/role/${managementWallet}/${roleId}`)
      ]);

      const [appData, roleData] = await Promise.all([
        appResponse.json(),
        roleResponse.json()
      ]);

      return [appData, roleData];
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err as Error);
      return [undefined, undefined];
    } finally {
      setLoading(false);
    }
  };

  return {
    getApplicationByManagementWallet,
    loading,
    error
  };
} 