import { useState, useEffect } from 'react';

interface UrlAppIdResult {
  appId: string | null;
  error: string | null;
}

// Function to validate Ethereum address
const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export function useUrlAppId(): UrlAppIdResult {
  const [appId, setAppId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAppId = params.get('appId');
    
    if (!urlAppId) {
      setError('No Ethereum address provided');
      setAppId(null);
      return;
    }

    if (!isValidEthereumAddress(urlAppId)) {
      setError('Invalid Ethereum address format');
      setAppId(null);
      return;
    }

    setError(null);
    setAppId(urlAppId);
  }, []);

  return { appId, error };
} 