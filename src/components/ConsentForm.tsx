import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useUrlAppId } from '../hooks/useUrlAppId';
import { useAppDatabase } from '../hooks/useAppDatabase';
import { ethers } from 'ethers';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';
import { SELECTED_LIT_NETWORK } from '../utils/lit';
import { LIT_RPC } from '@lit-protocol/constants';
import { IRelayPKP } from '@lit-protocol/types';
import type { AppInfo } from '../hooks/useAppDatabase';

export interface ConsentFormData {
  delegatees: string[];
  agentPKP: {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
  };
}

interface ConsentFormProps {
  onSubmit: (data: ConsentFormData) => Promise<void>;
  onDisapprove: () => void;
  userAddress: string;
}

export default function ConsentForm({ 
  onSubmit, 
  onDisapprove, 
  userAddress,
}: ConsentFormProps) {
  const { appId, error: appIdError } = useUrlAppId();
  const { getApplicationByAppId, loading: dbLoading, error: dbError } = useAppDatabase();
  const [formData, setFormData] = useState<ConsentFormData | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showDisapproval, setShowDisapproval] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch app info from database
  useEffect(() => {
    let mounted = true;

    async function fetchAppInfo() {
      if (!appId || !mounted) return;

      try {
        setIsLoading(true);
        const app = await getApplicationByAppId(appId);
        
        if (mounted && app && app.success) {
          setAppInfo(app);
          setFormData({
            delegatees: [app.data.managementWallet],
            agentPKP: {
              tokenId: '',
              publicKey: '',
              ethAddress: ''
            }
          });
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch app info');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    fetchAppInfo();

    return () => {
      mounted = false;
    };
  }, [appId]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;

    setSubmitting(true);
    setError(null);

    try {
      // Fetch agent PKP at submission time
      const pkpNftContract = getPkpNftContract(SELECTED_LIT_NETWORK);
      const balance = await pkpNftContract.balanceOf(userAddress);
      let agentPKP = null;

      // Fetch each PKP's details
      for (let i = 0; i < balance.toNumber(); i++) {
        const tokenId = await pkpNftContract.tokenOfOwnerByIndex(userAddress, i);
        const pubKey = await pkpNftContract.getPubkey(tokenId);
        const ethAddress = await pkpNftContract.getEthAddress(tokenId);
        
        // Skip if this PKP is the controller (user's address)
        if (ethAddress.toLowerCase() === userAddress.toLowerCase()) {
          continue;
        }
        
        // We found the agent PKP
        agentPKP = {
          tokenId: tokenId.toString(),
          publicKey: pubKey,
          ethAddress: ethAddress
        };
        break;
      }

      if (!agentPKP) {
        throw new Error('No agent PKP found for this user');
      }

      // Submit form data with agent PKP
      await onSubmit({
        ...formData,
        agentPKP
      });
      
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  }, [formData, onSubmit, userAddress]);

  const handleDisapprove = useCallback(async () => {
    setShowDisapproval(true);
    // Wait for animation to complete before calling onDisapprove
    setTimeout(onDisapprove, 2000);
  }, [onDisapprove]);

  // Show error message if there's no appId or if there's an error
  if (!appId || appIdError) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>{appIdError || 'No AppId provided'}</p>
        </div>
      </div>
    );
  }

  if (dbLoading || isLoading) {
    return (
      <div className="consent-form-container">
        <div className="loader">Loading app information...</div>
      </div>
    );
  }

  if (dbError || error) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>Error loading app information: {dbError?.message || error || 'Unknown error occurred'}</p>
        </div>
      </div>
    );
  }

  if (!formData || !appInfo) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>Unable to load consent form data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="consent-form-container">
      {showSuccess && (
        <div className="animation-overlay">
          <svg className="success-checkmark" viewBox="0 0 52 52">
            <circle className="success-checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
            <path className="success-checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
        </div>
      )}

      {showDisapproval && (
        <div className="animation-overlay">
          <svg className="error-x" viewBox="0 0 52 52">
            <circle className="error-x__circle" cx="26" cy="26" r="25" fill="none"/>
            <line className="error-x__line error-x__line--first" x1="16" y1="16" x2="36" y2="36"/>
            <line className="error-x__line error-x__line--second" x1="36" y1="16" x2="16" y2="36"/>
          </svg>
        </div>
      )}

      {error && (
        <div className="alert alert--error">
          <p>{error}</p>
        </div>
      )}

      <div className="app-info">
        <h2>{appInfo.data.name}</h2>
        <p className="description">{appInfo.data.description}</p>
        <p className="contact">Contact: {appInfo.data.contactEmail}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-actions">
          <button 
            type="submit" 
            className="button button--primary" 
            disabled={submitting}
          >
            {submitting ? 'Approving...' : 'Approve'}
          </button>
          <button 
            type="button" 
            className="button button--secondary" 
            onClick={handleDisapprove}
            disabled={submitting}
          >
            Disapprove
          </button>
        </div>
      </form>
    </div>
  );
} 