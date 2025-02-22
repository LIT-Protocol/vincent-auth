import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useUrlAppId } from '../hooks/useUrlAppId';
import { useAppDatabase } from '../hooks/useAppDatabase';
import { AppInfo, ParameterConfig } from '../utils/db';
import { ethers } from 'ethers';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';
import { SELECTED_LIT_NETWORK } from '../utils/lit';
import { LIT_RPC } from '@lit-protocol/constants';
import { IRelayPKP } from '@lit-protocol/types';

export interface ConsentFormData {
  delegatees: string[];
  policies: string[];
  tools: string[];
  agentPKP: {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
  };
  parameters: {
    [key: string]: string[];  // Generic parameters map where key is parameter type and value is array of values
  };
}

interface ConsentFormProps {
  onSubmit: (data: ConsentFormData) => Promise<void>;
  onDisapprove: () => void;
  userAddress: string;
  agentAddress?: string;
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
  const [editingParameter, setEditingParameter] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch app info from database
  useEffect(() => {
    let mounted = true;

    async function fetchAppInfo() {
      if (!appId || !mounted) return;

      try {
        setIsLoading(true);
        const app = await getApplicationByAppId(appId);
        
        if (mounted && app) {
          setAppInfo(app);
          setFormData({
            delegatees: [app.appManagementAddress],
            policies: app.policies.map(p => p.id),
            tools: app.tools,
            parameters: {
              ...(app.defaultParameters || {})
            }
          } as ConsentFormData);
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
  }, [appId]); // Only depend on appId

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
        agentPKP: {
          tokenId: agentPKP.tokenId,
          publicKey: agentPKP.publicKey,
          ethAddress: agentPKP.ethAddress
        },
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

  const handleParameterChange = (parameterType: string, index: number, value: string) => {
    if (!formData) return;
    const newParams = { ...formData.parameters };
    if (!newParams[parameterType]) {
      newParams[parameterType] = [];
    }
    newParams[parameterType][index] = value;
    setFormData({
      ...formData,
      parameters: newParams
    });
  };

  const handleAddParameter = (parameterType: string, value: string) => {
    if (!formData || !value.trim()) return;
    const newParams = { ...formData.parameters };
    if (!newParams[parameterType]) {
      newParams[parameterType] = [];
    }
    newParams[parameterType] = [...newParams[parameterType], value.trim()];
    setFormData({
      ...formData,
      parameters: newParams
    });
  };

  const handleRemoveParameter = (parameterType: string, index: number) => {
    if (!formData) return;
    const newParams = { ...formData.parameters };
    if (newParams[parameterType]) {
      newParams[parameterType] = newParams[parameterType].filter((_, i) => i !== index);
    }
    setFormData({
      ...formData,
      parameters: newParams
    });
  };

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

  if (dbLoading && !appInfo) {
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

      <form onSubmit={handleSubmit}>
        {appInfo.appLogo && (
          <div className="app-logo">
            <img src={appInfo.appLogo} alt={`${appInfo.metadata.name} logo`} />
          </div>
        )}

        <div className="app-info">
          <div className="app-title">
            <h2>{appInfo.metadata.name}</h2>
            {appInfo.verified && (
              <div className="verified-icon" title="Verified App">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                </svg>
              </div>
            )}
          </div>
          {appInfo.verified && (
            <div className="verified-text">Verified</div>
          )}
          <p className="app-description">{appInfo.metadata.description}</p>
          <div className="address-info">
            <p className="address-item">
              <span className="address-label">My address:</span>
              <span className="address-value">{userAddress.toLowerCase()}</span>
            </p>
          </div>
        </div>

        <div className="permissions-section">
          <h3>This app would like to:</h3>
          <ul className="permissions-list">
            {appInfo.toolDescriptions.map((tool, index) => (
              <li key={`tool-${index}`}>{tool}</li>
            ))}
          </ul>
        </div>

        <div className="policies-section">
          <h3>Subject to these policies:</h3>
          <ul className="policies-list">
            {appInfo.policies.map((policy, index) => (
              <li key={`policy-${index}`}>{policy.description}</li>
            ))}
          </ul>
        </div>

        {/* Render parameter sections dynamically based on app configuration */}
        {appInfo.parameters && Object.entries(appInfo.parameters).map(([paramType, paramConfig]: [string, ParameterConfig]) => (
          <div key={paramType} className="parameters-section">
            <h3>{paramConfig.title}</h3>
            <p className="parameter-description">{paramConfig.description}</p>
            
            <div className="parameter-list">
              {formData?.parameters[paramType]?.map((param, index) => (
                <div key={`${paramType}-${index}`} className="parameter-item">
                  <input
                    type={paramConfig.type === 'number' ? 'number' : 'text'}
                    value={param}
                    onChange={(e) => handleParameterChange(paramType, index, e.target.value)}
                    className="parameter-input"
                    placeholder={`Enter ${paramConfig.itemLabel || 'value'}`}
                    min={paramConfig.validation?.min}
                    max={paramConfig.validation?.max}
                    pattern={paramConfig.validation?.pattern}
                  />
                  {/* Only show remove button for multiple values or non-first items */}
                  {paramConfig.isMultiple && (
                    <button
                      type="button"
                      onClick={() => handleRemoveParameter(paramType, index)}
                      className="btn btn--icon btn--error"
                      aria-label={`Remove ${paramConfig.itemLabel || 'parameter'}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Only show add section for multiple values */}
            {paramConfig.isMultiple && (
              <div className="parameter-add">
                <input
                  type={paramConfig.type === 'number' ? 'number' : 'text'}
                  value={editingParameter[paramType] || ''}
                  onChange={(e) => setEditingParameter({
                    ...editingParameter,
                    [paramType]: e.target.value
                  })}
                  className="parameter-input"
                  placeholder={`Add new ${paramConfig.itemLabel || 'value'}`}
                  min={paramConfig.validation?.min}
                  max={paramConfig.validation?.max}
                  pattern={paramConfig.validation?.pattern}
                />
                <button
                  type="button"
                  onClick={() => {
                    handleAddParameter(paramType, editingParameter[paramType] || '');
                    setEditingParameter({
                      ...editingParameter,
                      [paramType]: ''
                    });
                  }}
                  className="btn btn--primary"
                  disabled={!editingParameter[paramType]?.trim()}
                >
                  Add {paramConfig.itemLabel || 'Value'}
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="support-info">
          <p>Need help? Contact: <a href={`mailto:${appInfo.supportEmail}`}>{appInfo.supportEmail}</a></p>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className={`btn btn--primary ${submitting ? 'btn--loading' : ''}`}
            disabled={submitting || showSuccess || showDisapproval}
          >
            {submitting ? 'Approving...' : 'Approve'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleDisapprove}
            disabled={submitting || showSuccess || showDisapproval}
          >
            Disapprove
          </button>
        </div>
      </form>
    </div>
  );
} 