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
import USER_VIEW_FACET_ABI from '../utils/abis/VincentUserViewFacet.abi.json';
import USER_FACET_ABI from '../utils/abis/VincentUserFacet.abi.json';

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
  currentAccount,
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
  const [versionData, setVersionData] = useState<any>(null);

  // Get referrer URL from sessionStorage
  useEffect(() => {
    const storedReferrerUrl = sessionStorage.getItem('referrerUrl');
    if (storedReferrerUrl) {
      setReferrerUrl(storedReferrerUrl);
    }
  }, []);
  
  // Check if app is already permitted for this PKP and fetch all app data
  useEffect(() => {
    async function checkAppPermissionAndFetchData() {
      if (!appId || !agentPKP) {
        setCheckingPermissions(false);
        return;
      }

      try {
        const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
        const userViewRegistryContract = new ethers.Contract(
          process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!,
          USER_VIEW_FACET_ABI,
          provider
        );
        const userRegistryContract = new ethers.Contract(
          process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, 
          USER_FACET_ABI, 
          provider
        );
        const appRegistryContract = new ethers.Contract(
          process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, 
          APP_FACET_ABI, 
          provider
        );

        // Get all permitted app IDs for this PKP
        const permittedAppIds = await userViewRegistryContract.getAllPermittedAppIdsForPkp(agentPKP.tokenId);
        console.log('Permitted app IDs for this PKP:', permittedAppIds);
        console.log('Current app ID:', appId);

        // Fetch app info and version data
        const appInfo = await appRegistryContract.getAppById(Number(appId));
        console.log('App info:', appInfo);
        
        // Set the app info state
        setAppInfo(appInfo);
        
        // Initialize formData as soon as we have appInfo
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
        
        const versionNumber = Number(appInfo.latestVersion);
        console.log('Latest version:', versionNumber);
        
        const versionData = await appRegistryContract.getAppVersion(appId, versionNumber);
        console.log('Version data:', versionData);
        
        // Store the version data
        setVersionData({
          version: versionData.appVersion.version,
          toolIpfsCidHashes: versionData.appVersion.toolIpfsCidHashes
        });
        
        // Try to fetch tool data
        console.log("Version data hashes", versionData.appVersion.toolIpfsCidHashes);
        console.log("Agent PKP tokenId", agentPKP.tokenId);
        console.log("App ID", appId);
        console.log("App Info latestVersion", appInfo.latestVersion);
        /*
        for(const hash of versionData.appVersion.toolIpfsCidHashes || ['QmZ9mydsUQf3K7JvSDyZn7v9Fv5ZRzNrLMcuLCTdi4JE8h']) {
          try {
            const toolData = await userRegistryContract.getAllPoliciesWithParametersForTool(
              agentPKP.tokenId, 
              appId, 
              Number(appInfo.latestVersion), 
              hash
            );
            console.log('Tool data:', toolData);
          } catch (toolError) {
            console.error('Error fetching tool data:', toolError);
          }
        }*/

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
        console.error('Error checking app permissions or fetching app data:', err);
      } finally {
        setCheckingPermissions(false);
        // Always set isLoading to false when permissions check completes
        setIsLoading(false);
      }
    }

    checkAppPermissionAndFetchData();
  }, [appId, agentPKP, referrerUrl]);
  
  // Fetch app info from database
  useEffect(() => {
    let mounted = true;

    async function fetchAppInfo() {
      // Don't do anything if appId is missing, component is unmounted, or app is already permitted
      if (!appId || !mounted || isAppAlreadyPermitted) return;
      
      // Don't proceed if we're still checking permissions in the other effect
      if (checkingPermissions) return;

      try {
        // Only initialize formData when we have appInfo
        if (appInfo && !formData && mounted) {
          console.log('Setting up form data based on retrieved app info');
          
          // Initialize formData with values from appInfo and agentPKP
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
          
          // Only set loading to false when we have both appInfo and formData
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Error in fetchAppInfo:', err);
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
  }, [appId, agentPKP, router.query.roleId, isAppAlreadyPermitted, appInfo]);

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
      
      // Redirect to referrer URL if available
      if (referrerUrl) {
        window.location.href = referrerUrl;
      }
    } catch (err) {
      console.error('Error during logout:', err);
    }
  }, [disconnectAsync, referrerUrl]);

  const handleDisapprove = useCallback(async () => {
    setShowDisapproval(true);
    
    // Wait for animation to complete before redirecting
    setTimeout(() => {
      // Then wait a moment before redirecting
      setTimeout(() => {
        // Redirect to the referrer URL without the JWT
        if (referrerUrl) {
          window.location.href = referrerUrl;
        }
      }, 100); // Small delay to ensure callback completes
    }, 2000); // Animation display time
  }, [handleLogout, referrerUrl]);

  const approveConsent = async () => {
    // Add more detailed debugging
    console.log('approveConsent called with versionData:', versionData);
    console.log('versionData type:', typeof versionData);
    console.log('versionData keys:', versionData ? Object.keys(versionData) : 'null');
    
    // Check if required data is available
    if (!versionData || !versionData.toolIpfsCidHashes) {
      console.error('Missing version data or tool IPFS CID hashes');
      throw new Error('Missing version data or tool IPFS CID hashes');
    }

    if (!agentPKP || !appId || !appInfo) {
      console.error('Missing required data for consent approval');
      throw new Error('Missing required data for consent approval');
    }

    const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
    const userRegistryContract = new ethers.Contract(
      process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, 
      USER_FACET_ABI, 
      provider
    );
    const userPkpWallet = new PKPEthersWallet({
      controllerSessionSigs: sessionSigs,
      pkpPubKey: currentAccount.publicKey,
      litNodeClient: litNodeClient,
    });
    
    // Initialize the wallet
    await userPkpWallet.init();
    
    // Connect the wallet to the contract and assign it back to a variable
    const connectedContract = userRegistryContract.connect(userPkpWallet);

    console.log("Tool IPFS CID Hashes", versionData.toolIpfsCidHashes);
    console.log("Agent PKP tokenId", agentPKP.tokenId);
    console.log("App ID", appId);
    console.log("App Info latestVersion", appInfo.latestVersion);

    // Use the connected contract to send the transaction
    const txResponse = await connectedContract.permitAppVersion(
      agentPKP.tokenId, 
      appId, 
      Number(appInfo.latestVersion), 
      versionData.toolIpfsCidHashes, 
      [[]], 
      [[[]]], 
      [[[]]], 
      {
        gasLimit: 1000000
      }
    );
    
    console.log('Transaction response:', txResponse);
    
    // Wait for the transaction to be mined
    const receipt = await txResponse.wait();
    console.log('Transaction receipt:', receipt);
    
    return receipt;
  }
  
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
        pkpWallet: agentPkpWallet as any,
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
      // Debug log to check versionData before proceeding
      console.log('Version data before consent approval:', versionData);
      
      // First check if we have all required data
      if (!versionData || !versionData.toolIpfsCidHashes) {
        console.error('Missing version data or tool IPFS CID hashes in handleFormSubmission');
        setError('Missing version data. Please try again.');
        return { success: false };
      }

      if (!agentPKP || !appId || !appInfo) {
        console.error('Missing required data for consent approval in handleFormSubmission');
        setError('Missing required data. Please try again.');
        return { success: false };
      }
      
      // First approve the consent
      await approveConsent();
      
      // Then generate JWT after successful consent approval
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
    
    // Add debugging to check versionData
    console.log('handleApprove called with versionData:', versionData);
    
    if (!versionData || !versionData.toolIpfsCidHashes) {
      console.error('Missing version data in handleApprove');
      setError('Missing version data. Please refresh the page and try again.');
      setSubmitting(false);
      return;
    }
    
    setSubmitting(true);
    try {
      await handleFormSubmission();
    } catch (err) {
      console.error('Error submitting form:', err);
      setError('Failed to submit approval');
    } finally {
      setSubmitting(false);
    }
  }, [formData, versionData]);

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
      </div>
    );
  }

  // Show loading indicator while checking permissions or loading app info
  if (checkingPermissions || isLoading) {
    return (
      <div className="consent-form-container">
        <p>Loading app information...</p>
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

  // Only show this error if we're not loading and the data is still missing
  if (!formData || !appInfo || !versionData) {
    return (
      <div className="consent-form-container">
        <div className="alert alert--error">
          <p>Unable to load consent form data</p>
        </div>
      </div>
    );
  }

  return (
    <div className={isSessionValidation ? 'session-validator-consent' : 'container'}>
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
              {versionData && (
                <>
                  <p><strong>Version:</strong> {versionData.version ? versionData.version.toString() : '1'}</p>
                  <div className="tool-hash-info">
                    <p><strong>Tool IPFS Hash:</strong></p>
                    <p className="tool-hash">
                      {versionData.toolIpfsCidHashes}
                    </p>
                  </div>
                </>
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
    </div>
  );
} 