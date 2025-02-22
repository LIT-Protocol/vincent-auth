import { useState, useEffect } from 'react';
import { AppInfo, initDB, getAppByAppId } from '../utils/db';

let isDbInitialized = false;

export function useAppDatabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    // Only initialize database once across all hook instances
    if (!isDbInitialized) {
      isDbInitialized = true;
      initDB().catch(err => {
        console.error('Failed to initialize database:', err);
        setError(err);
      });
    }
  }, []);

  const getApplicationByAppId = async (appId: string): Promise<AppInfo | undefined> => {
    try {
      setLoading(true);
      return await getAppByAppId(appId);
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