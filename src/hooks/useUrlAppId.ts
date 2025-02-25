import { useState, useEffect } from 'react';

interface UrlParamsResult {
  managementWallet: string | null;
  roleId: string | null;
  error: string | null;
}

// Function to validate Ethereum address
const isValidEthereumAddress = (address: string): boolean => {
  // Clean the address first
  const cleanAddress = address.split('?')[0].trim();
  return /^0x[a-fA-F0-9]{40}$/.test(cleanAddress);
};

export function useUrlParams(): UrlParamsResult {
  const [managementWallet, setManagementWallet] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Parse the full URL to handle all query parameters
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    
    const urlManagementWallet = params.get('managementWallet')?.split('?')[0].trim();
    const urlRoleId = params.get('roleId');
    
    if (!urlManagementWallet) {
      setError('No Ethereum address provided');
      setManagementWallet(null);
      setRoleId(null);
      return;
    }

    if (!isValidEthereumAddress(urlManagementWallet)) {
      setError('Invalid Ethereum address format');
      setManagementWallet(null);
      setRoleId(null);
      return;
    }

    if (!urlRoleId) {
      setError('No roleId provided');
      setManagementWallet(null);
      setRoleId(null);
      return;
    }

    setError(null);
    setManagementWallet(urlManagementWallet);
    setRoleId(urlRoleId);
  }, []);

  return { managementWallet, roleId, error };
} 