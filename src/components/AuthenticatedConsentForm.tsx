import { IRelayPKP, SessionSigs } from '@lit-protocol/types';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { cleanupSession } from '../utils/lit';
import { useDisconnect } from 'wagmi';
import { useUrlAppId } from '../hooks/useUrlAppId';
import { VincentSDK } from '@lit-protocol/vincent-sdk';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { litNodeClient } from '../utils/lit';
import * as ethers from 'ethers';
import { LIT_RPC } from '@lit-protocol/constants';
import APP_FACET_ABI from '../utils/abis/VincentAppViewFacet.abi.json';
import USER_FACET_ABI from '../utils/abis/VincentUserViewFacet.abi.json';

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

interface AuthenticatedConsentFormProps {
  currentAccount: IRelayPKP;
  sessionSigs: SessionSigs;
  agentPKP?: IRelayPKP;
  agentSessionSigs?: SessionSigs;
  isSessionValidation?: boolean;
}

interface AppView {
  name: string;
  description: string;
  manager: string;
  latestVersion: ethers.BigNumber;
  delegatees: string[];
  authorizedDomains: string[];
  authorizedRedirectUris: string[];
}

export default function AuthenticatedConsentForm({
  sessionSigs,
  agentPKP,
  isSessionValidation,
}: AuthenticatedConsentFormProps) {
  const router = useRouter();
  const { disconnectAsync } = useDisconnect();
  const { appId, version, error: urlError } = useUrlAppId();
  const [formData, setFormData] = useState<ConsentFormData | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSuccess, setShowSuccess] = useState<boolean>(false);
  const [showDisapproval, setShowDisapproval] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [appInfo, setAppInfo] = useState<AppView | null>(null);
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);
  const [generatedJwt, setGeneratedJwt] = useState<string | null>(null);
  const [isAppAlreadyPermitted, setIsAppAlreadyPermitted] = useState<boolean>(false);
  const [checkingPermissions, setCheckingPermissions] = useState<boolean>(true);

  // Get referrer URL from sessionStorage
  useEffect(() => {
    const storedReferrerUrl = sessionStorage.getItem('referrerUrl');
    if (storedReferrerUrl) {
      setReferrerUrl(storedReferrerUrl);
    }
  }, []);
  
  // Check if app is already permitted for this PKP
  useEffect(() => {
    async function checkAppPermission() {
      if (!appId || !agentPKP) {
        setCheckingPermissions(false);
        return;
      }

      try {
        const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
        const userRegistryContract = new ethers.Contract(
          process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!,
          USER_FACET_ABI,
          provider
        );

        // Get all permitted app IDs for this PKP
        const permittedAppIds = await userRegistryContract.getAllPermittedAppIdsForPkp(agentPKP.tokenId);
        console.log('Permitted app IDs for this PKP:', permittedAppIds);
        console.log('Current app ID:', appId);

        // Check if the current app ID is in the permitted list
        const appIdNum = Number(appId);
        const isPermitted = permittedAppIds.some((id: ethers.BigNumber) => id.toNumber() === appIdNum);
        
        console.log('Is app already permitted?', isPermitted);
        setIsAppAlreadyPermitted(isPermitted);
        
        // If app is already permitted, generate JWT and redirect immediately
        if (isPermitted && referrerUrl) {
          console.log('App is already permitted. Generating JWT and redirecting...');
          // Show success animation briefly
          setShowSuccess(true);
          const jwt = await generateJWT();
          
          // Short delay to allow the success animation to be seen
          setTimeout(() => {
            redirectWithJWT(jwt);
          }, 1500);
        }
      } catch (err) {
        console.error('Error checking app permissions:', err);
      } finally {
        setCheckingPermissions(false);
      }
    }

    checkAppPermission();
  }, [appId, agentPKP, referrerUrl]);
  
  // Fetch app info from database
  useEffect(() => {
    let mounted = true;

    async function fetchAppInfo() {
      if (!appId || !mounted || isAppAlreadyPermitted) return;

      try {
        const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
        const registryContract = new ethers.Contract(process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, APP_FACET_ABI, provider);

        // Log the appId being used (for debugging)
        console.log('Fetching app info for appId:', appId);

        // Get app info using getAppById which only takes appId
        const appData = await registryContract.getAppById(Number(appId));
        let pkp;
        const storedAuthInfo = localStorage.getItem('lit-auth-info');
        if (storedAuthInfo) {
          const parsedAuthInfo = JSON.parse(storedAuthInfo);
          pkp = parsedAuthInfo.pkp;
          console.log('Retrieved auth info:', parsedAuthInfo);
        }
        console.log('✅ App info:', appData);
        
        if (mounted) {
          setAppInfo(appData);
          // Initialize formData with default values and add the agentPKP data if available
          setFormData({
            delegatees: [],
            agentPKP: agentPKP ? {
              tokenId: agentPKP.tokenId,
              publicKey: agentPKP.publicKey,
              ethAddress: agentPKP.ethAddress
            } : {
              tokenId: '',
              publicKey: '',
              ethAddress: ''
            },
            roleId: router.query.roleId as string
          });
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error fetching app info:', err);
        if (mounted) {
          setError('Failed to load app information');
          setIsLoading(false);
        }
      }
    }

    fetchAppInfo();
    
    return () => {
      mounted = false;
    };
  }, [appId, agentPKP, router.query.roleId, isAppAlreadyPermitted]);

  const handleLogout = useCallback(async () => {
    try {
      await disconnectAsync();
      await cleanupSession();
      
      // Clear stored auth info from localStorage
      try {
        localStorage.removeItem('lit-auth-info');
        console.log('Cleared authentication information from localStorage');
      } catch (storageError) {
        console.error('Error clearing auth info from localStorage:', storageError);
      }
    } catch (err) {
      console.error('Error during logout:', err);
    }
  }, [disconnectAsync]);

  const handleDisapprove = useCallback(async () => {
    setShowDisapproval(true);
    
    // Wait for animation to complete before redirecting
    setTimeout(() => {
      // First call the handleLogout callback
      handleLogout();
      
      // Then wait a moment before redirecting
      setTimeout(() => {
        // Redirect to the referrer URL without the JWT
        if (referrerUrl) {
          window.location.href = referrerUrl;
        }
      }, 100); // Small delay to ensure callback completes
    }, 2000); // Animation display time
  }, [handleLogout, referrerUrl]);
  
  // Generate JWT for redirection
  const generateJWT = async (): Promise<string | null> => {
    if (!agentPKP || !referrerUrl) {
      console.log('Cannot generate JWT: missing agentPKP or referrerUrl');
      return null;
    }
    
    try {
      console.log('Initializing agent PKP wallet for JWT creation...');
      const agentPkpWallet = new PKPEthersWallet({
        controllerSessionSigs: sessionSigs,
        pkpPubKey: agentPKP.publicKey,
        litNodeClient: litNodeClient,
      });
      await agentPkpWallet.init();

      const vincent = new VincentSDK();
      const jwt = await vincent.createSignedJWT({
        pkpWallet: agentPkpWallet,
        pkp: agentPKP,
        payload: { name: "User Name", customClaim: "value" },
        expiresInMinutes: 30,
        audience: referrerUrl
      });
      
      if (jwt) {
        console.log('JWT created successfully:', jwt);
        // Store the JWT in state for reuse if needed
        setGeneratedJwt(jwt);
        return jwt;
      }
    } catch (error) {
      console.error('Error creating JWT:', error);
    }
    
    return null;
  };
  
  // Redirect with JWT
  const redirectWithJWT = async (jwt: string | null) => {
    if (!referrerUrl) {
      console.error('No referrer URL available for redirect');
      return;
    }
    
    // Use the provided JWT or the one stored in state
    const jwtToUse = jwt || generatedJwt;
    
    if (jwtToUse) {
      console.log('Redirecting with JWT:', jwtToUse);
      try {
        const redirectUrl = new URL(referrerUrl);
        redirectUrl.searchParams.set('jwt', jwtToUse);
        window.location.href = redirectUrl.toString();
      } catch (error) {
        console.error('Error creating redirect URL:', error);
        window.location.href = referrerUrl;
      }
    } else {
      console.log('No JWT available, redirecting without JWT');
      window.location.href = referrerUrl;
    }
  };
  
  // Form submission logic extracted from FormSubmission component
  const handleFormSubmission = async (): Promise<{success: boolean}> => {
    try {
      // Generate JWT - this is now the only place JWT generation happens in the app
      const jwt = await generateJWT();

      // Show success animation
      setShowSuccess(true);
      
      // Wait for the animation to play before redirecting
      setTimeout(() => {
        redirectWithJWT(jwt);
      }, 2000); // Animation display time

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error processing transaction:', {
        error,
        errorCode: (error as any).code,
        errorMessage: (error as any).message,
        errorReason: (error as any).reason,
        errorData: (error as any).data,
      });
      setError('An error occurred while processing your request');
      throw error;
    }
  };

  const handleApprove = useCallback(async () => {
    if (!formData) return;
    setSubmitting(true);
    try {
      await handleFormSubmission();
    } catch (err) {
      console.error('Error submitting form:', err);
      setError('Failed to submit approval');
    } finally {
      setSubmitting(false);
    }
  }, [formData]);

  // If the app is already permitted, show a brief loading spinner or success animation
  if (isAppAlreadyPermitted || (showSuccess && checkingPermissions)) {
    return (
      <div className="container">
        <div className="consent-form-container">
          <div className="animation-overlay">
            <svg className="success-checkmark" viewBox="0 0 52 52">
              <circle className="success-checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
              <path className="success-checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
          </div>
          <p className="auto-redirect-message">
            This app is already authorized. Redirecting...
          </p>
        </div>
        <style jsx>{`
          .auto-redirect-message {
            text-align: center;
            margin-top: 20px;
            font-size: 1.2rem;
          }
        `}</style>
      </div>
    );
  }

  // Show loading indicator while checking permissions
  if (checkingPermissions) {
    return (
      <div className="consent-form-container">
        <p>Checking app permissions...</p>
      </div>
    );
  }

  // Show error message if there's no appId or if there's an error
  if (!appId) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>Missing appId parameter</p>
        </div>
      </div>
    );
  }

  if (urlError) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>{urlError}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="consent-form-container">
        <p>Loading app information...</p>
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
    <div className="container">
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

        <div className="logout-container">
          <button className="btn btn--link" onClick={handleLogout}>
            Logout
          </button>
        </div>
        
        <h1>Agent Consent Notice</h1>
        
        {error && (
          <div className="alert alert--error">
            <p>{error}</p>
          </div>
        )}

        {appInfo && (
          <div className="app-info">
            <h2>App Information</h2>
            <div className="app-info-details">
              <p><strong>Name:</strong> {appInfo.name}</p>
              <p><strong>Description:</strong> {appInfo.description}</p>
              {agentPKP && (
                <p><strong>PKP Address:</strong> {agentPKP.ethAddress}</p>
              )}
            </div>
            
            <div className="consent-actions">
              <button 
                className="btn btn--primary"
                onClick={handleApprove}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Approve'}
              </button>
              <button 
                className="btn btn--outline"
                onClick={handleDisapprove}
                disabled={submitting}
              >
                Disapprove
              </button>
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .session-validator-consent {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          background-color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 2rem;
          overflow-y: auto;
          width: 100vw;
          height: 100vh;
          max-width: 100%;
          max-height: 100%;
          box-sizing: border-box;
          margin: 0;
          padding: 20px;
        }
        
        /* When shown from session validator, add extra spacing and styling */
        .session-validator-consent .consent-form-container {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          background-color: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
} 