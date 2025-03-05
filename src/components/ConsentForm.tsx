import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useUrlParams } from '../hooks/useUrlAppId';
import { useAppDatabase } from '../hooks/useAppDatabase';
import { ethers } from 'ethers';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';
import { SELECTED_LIT_NETWORK } from '../utils/lit';
import { LIT_RPC } from '@lit-protocol/constants';
import { IRelayPKP } from '@lit-protocol/types';
import type { AppInfo, RoleInfo } from '../hooks/useAppDatabase';

interface PolicyVarSchema {
  defaultValue: any;
  paramName: string;
  valueType: string;
}

interface ToolPolicy {
  description?: string;
  policyVarsSchema: PolicyVarSchema[];
  toolIpfsCid: string;
}

export interface ConsentFormData {
  delegatees: string[];
  agentPKP: {
    tokenId: string;
    publicKey: string;
    ethAddress: string;
  };
  policyParams?: {
    [key: string]: string;
  };
  roleId?: string;
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
  const { managementWallet, roleId, error: urlError } = useUrlParams();
  const { getApplicationByManagementWallet, loading: dbLoading, error: dbError } = useAppDatabase();
  const [formData, setFormData] = useState<ConsentFormData | null>(null);
  const [policyInputs, setPolicyInputs] = useState<{[key: string]: string}>({});
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showDisapproval, setShowDisapproval] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch app info from database
  useEffect(() => {
    let mounted = true;

    async function fetchAppInfo() {
      if (!managementWallet || !roleId || !mounted) return;

      try {
        setIsLoading(true);
        const [app, role] = await getApplicationByManagementWallet(managementWallet, roleId);
        
        if (mounted && app?.success && role?.success) {
          setAppInfo(app);
          setRoleInfo(role);
          
          // Initialize form data with default policy parameters
          const defaultPolicyParams: { [key: string]: string } = {};
          role.data.toolPolicy?.forEach(policy => {
            policy.policyVarsSchema?.forEach((variable: PolicyVarSchema) => {
              defaultPolicyParams[variable.paramName] = variable.defaultValue?.toString() || '0';
            });
          });
          
          setFormData({
            delegatees: [app.data.managementWallet],
            agentPKP: {
              tokenId: '',
              publicKey: '',
              ethAddress: ''
            },
            policyParams: defaultPolicyParams
          });
          
          // Also set the policy inputs state
          setPolicyInputs(defaultPolicyParams);
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
  }, [managementWallet, roleId]);

  const handlePolicyInputChange = (paramName: string, value: string) => {
    setPolicyInputs(prev => ({
      ...prev,
      [paramName]: value
    }));
  };

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
        
        if (ethAddress.toLowerCase() === userAddress.toLowerCase()) {
          continue;
        }
        
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

      // Submit form data with agent PKP and policy parameters
      await onSubmit({
        ...formData,
        agentPKP,
        policyParams: policyInputs,
        ...(roleId ? { roleId } : {})
      });
      
      // We're keeping the state for tracking, but animation is handled by parent component
      setShowSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit form');
    } finally {
      setSubmitting(false);
    }
  }, [formData, policyInputs, onSubmit, userAddress, roleId]);

  const handleDisapprove = useCallback(async () => {
    setShowDisapproval(true);
    // Wait for animation to complete before calling onDisapprove
    setTimeout(onDisapprove, 2000);
  }, [onDisapprove]);

  // Show error message if there's no managementWallet or roleId or if there's an error
  if (!managementWallet || !roleId || urlError) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>{urlError || 'Missing required parameters'}</p>
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

  if (!formData || !appInfo || !roleInfo) {
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

      <div className="card app-info">
        <div className="card-header">
          <h2 className="card-title">{appInfo.data.name}</h2>
        </div>
        <div className="card-body">
          <p className="app-description">{appInfo.data.description}</p>
          <p className="contact-info">
            <span className="label">Contact: </span>
            <a href={`mailto:${appInfo.data.contactEmail}`} className="contact-link">
              {appInfo.data.contactEmail}
            </a>
          </p>
        </div>
      </div>

      <div className="card role-info">
        <div className="card-header">
          <h3 className="card-title">{roleInfo.data.roleName}</h3>
        </div>
        <div className="card-body">
          <div className="role-section">
            <h4 className="section-title">Description</h4>
            <p className="role-description">{roleInfo.data.roleDescription}</p>
          </div>
          
          {roleInfo.data.toolPolicy && roleInfo.data.toolPolicy.length > 0 && (
            <div className="policy-section">
              <h3 className="section-title">Capabilities & Restrictions</h3>
              {roleInfo.data.toolPolicy.map((policy, index) => (
                <div key={index} className="parameters-section">
                  <h4 className="parameter-title">Maximum Transaction Amount</h4>
                  {policy.description && (
                    <p className="parameter-description">{policy.description}</p>
                  )}

                  {policy.policyVarsSchema && policy.policyVarsSchema.length > 0 && (
                    <div className="parameter-list">
                      {policy.policyVarsSchema.map((variable: PolicyVarSchema, varIndex: number) => (
                        <div key={varIndex} className="parameter-item">
                          <input
                            id={`param-${variable.paramName}`}
                            type="number"
                            className="parameter-input"
                            value={policyInputs[variable.paramName] ?? variable.defaultValue ?? '0'}
                            onChange={(e) => handlePolicyInputChange(variable.paramName, e.target.value)}
                            min="0"
                            placeholder={`Enter ${variable.paramName}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="consent-form">
        <div className="form-actions">
          <button 
            type="submit" 
            className="btn btn--primary" 
            disabled={submitting}
          >
            {submitting ? 'Approving...' : 'Approve'}
          </button>
          <button 
            type="button" 
            className="btn btn--secondary" 
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