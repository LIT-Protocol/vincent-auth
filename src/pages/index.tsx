import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useAuthenticate from '../hooks/useAuthenticate';
import useAccounts from '../hooks/useAccounts';
import { registerWebAuthn, getSessionSigs, cleanupSession, SELECTED_LIT_NETWORK, litNodeClient } from '../utils/lit';
import { AUTH_METHOD_TYPE, LIT_RPC } from '@lit-protocol/constants';
import AuthenticatedConsentForm from '../components/AuthenticatedConsentForm';
import Loading from '../components/Loading';
import LoginMethods from '../components/LoginMethods';
import { SessionSigs, IRelayPKP } from '@lit-protocol/types';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { EthWalletProvider } from '@lit-protocol/lit-auth-client';
import { getAgentPKP } from '../utils/getAgentPKP';
import { VincentSDK } from '@lit-protocol/vincent-sdk';
import USER_FACET_ABI from '../utils/abis/VincentUserViewFacet.abi.json';
import APP_VIEW_FACET_ABI from '../utils/abis/VincentAppViewFacet.abi.json';
import * as ethers from 'ethers';
import { useUrlAppId } from '@/hooks/useUrlAppId';

export default function IndexView() {
  const router = useRouter();
  const { appId, version, error: urlError } = useUrlAppId();
  const { managementWallet, roleId } = router.query;
  const [sessionSigs, setSessionSigs] = useState<SessionSigs>();
  const [agentSessionSigs, setAgentSessionSigs] = useState<SessionSigs>();
  const [agentPKP, setAgentPKP] = useState<IRelayPKP>();
  const [sessionLoading, setSessionLoading] = useState<boolean>(false);
  const [sessionError, setSessionError] = useState<Error>();
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);

  const {
    authMethod,
    authWithEthWallet,
    authWithWebAuthn,
    authWithStytch,
    loading: authLoading,
    error: authError,
  } = useAuthenticate();
  const {
    fetchAccounts,
    setCurrentAccount,
    currentAccount,
    accounts,
    loading: accountsLoading,
    error: accountsError,
  } = useAccounts();

  const error = authError || accountsError || sessionError;

  // Store referrer URL when component mounts
  useEffect(() => {
    // Get the document referrer (the URL the user came from)
    const referrer = document.referrer;
    if (referrer && referrer !== '') {
      setReferrerUrl(referrer);
      // Also store in sessionStorage in case we need it elsewhere
      sessionStorage.setItem('referrerUrl', referrer);
    }
  }, []);

  // Function to generate session signatures on-demand
  async function generateSessionSigs() {
    if (!authMethod || !currentAccount) return;
    
    setSessionLoading(true);
    setSessionError(undefined);
    try {
      // Generate session signatures for the user PKP
      const sigs = await getSessionSigs({
        pkpPublicKey: currentAccount.publicKey,
        authMethod
      });
      setSessionSigs(sigs);
      
      // After getting user PKP session sigs, try to get the agent PKP
      try {
        const agentPkpInfo = await getAgentPKP(currentAccount.ethAddress);
        setAgentPKP(agentPkpInfo);
        
        // Initialize the user PKP wallet
        console.log('Generating new agent session signatures...');
        console.log('Initializing user PKP wallet...');
        const userPkpWallet = new PKPEthersWallet({
          controllerSessionSigs: sigs,
          pkpPubKey: currentAccount.publicKey,
          litNodeClient: litNodeClient,
        });
        await userPkpWallet.init();
        console.log('User PKP wallet initialized');
        console.log('User PKP details:', currentAccount);
        console.log('Agent PKP details:', agentPkpInfo);

        
        // Authenticate with EthWalletProvider
        console.log('Authenticating with EthWalletProvider...');
        const authMethodForAgent = await EthWalletProvider.authenticate({
          signer: userPkpWallet,
          litNodeClient
        });
        console.log('Authentication method:', authMethodForAgent);

        // Derive session signatures for the agent PKP
        
        console.log('Getting session signatures for Agent PKP...');
        const agentPkpSessionSigs = await getSessionSigs({
          pkpPublicKey: agentPkpInfo.publicKey,
          authMethod: authMethodForAgent,
        });
        console.log('Agent PKP session sigs:', agentPkpSessionSigs);

        const agentPkpWallet = new PKPEthersWallet({
          controllerSessionSigs: agentPkpSessionSigs,
          pkpPubKey: agentPkpInfo.publicKey,
          litNodeClient: litNodeClient,
        });
        await agentPkpWallet.init();

        const agentAuthMethod = await EthWalletProvider.authenticate({
          signer: agentPkpWallet,
          litNodeClient
        });
        console.log('Agent PKP authentication method:', agentAuthMethod);

        const vincent = new VincentSDK()

        if (referrerUrl) {
          try {
            // Removed JWT generation code since it will happen in AuthenticatedConsentForm
            // after user gives explicit consent
            
            const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
            const userRegistryContract = new ethers.Contract(process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, USER_FACET_ABI, provider);
            const appRegistryContract = new ethers.Contract(process.env.NEXT_PUBLIC_VINCENT_DATIL_CONTRACT!, APP_VIEW_FACET_ABI, provider);
            // Get app info using getAppById which only takes appId
            const appData = await userRegistryContract.getAllPermittedAppIdsForPkp(agentPkpInfo.tokenId);

            console.log('App data:', appData);

            console.log('App ID:', appId);
            const appInfo = await appRegistryContract.getAppById(Number(appId));
            console.log('App info:', appInfo);
            //const versionData = await appRegistryContract.getAppVersion(appId, "1");
            //console.log('Version data:', versionData);
          } catch (error) {
            console.error('Error fetching app data:', error);
          }
        } else {
          console.log('No referrer URL found, skipping app data lookup');
        }
        
        setAgentSessionSigs(agentPkpSessionSigs);
      } catch (agentError) {
        console.error('Error handling Agent PKP:', agentError);
        // Don't set session error - we can still proceed with just the user PKP
      }
    } catch (err) {
      setSessionError(err as Error);
    } finally {
      setSessionLoading(false);
    }
  }

  async function handleRegisterWithWebAuthn() {
    const newPKP = await registerWebAuthn();
    if (newPKP) {
      setCurrentAccount(newPKP);
    }
  }

  useEffect(() => {
    // Always preserve managementWallet and roleId in the URL
    if (managementWallet && roleId) {
      // Clean the managementWallet value
      const cleanManagementWallet = managementWallet.toString().split('?')[0];
      router.replace(
        { 
          pathname: window.location.pathname, 
          query: { 
            managementWallet: cleanManagementWallet, 
            roleId 
          } 
        }, 
        undefined, 
        { shallow: true }
      );
    }
  }, [managementWallet, roleId, router]);

  useEffect(() => {
    // If user is authenticated, fetch accounts
    if (authMethod) {
      fetchAccounts(authMethod);
    }
  }, [authMethod, fetchAccounts]);

  useEffect(() => {
    // If user is authenticated and has accounts, select the first one
    if (authMethod && accounts.length > 0 && !currentAccount) {
      setCurrentAccount(accounts[0]);
    }
  }, [authMethod, accounts, currentAccount, setCurrentAccount]);

  useEffect(() => {
    // If user is authenticated and has selected an account, generate session sigs
    if (authMethod && currentAccount) {
      generateSessionSigs();
    }
  }, [authMethod, currentAccount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup web3 connection when component unmounts
      if (sessionSigs) {
        cleanupSession();
      }
    };
  }, [sessionSigs]);

  // Loading states
  if (authLoading) {
    return <Loading copy={'Authenticating your credentials...'} error={error} />;
  }
  if (accountsLoading) {
    return <Loading copy={'Looking up your accounts...'} error={error} />;
  }
  if (sessionLoading) {
    return <Loading copy={'Securing your session...'} error={error} />;
  }

  // Authenticated states
  if (currentAccount && sessionSigs) {
    // Save the PKP info in localStorage for SessionValidator to use
    try {
      const storedAuthInfo = localStorage.getItem('lit-auth-info');
      if (storedAuthInfo) {
        const authInfo = JSON.parse(storedAuthInfo);
        
        // Add PKP info to the existing auth info
        authInfo.pkp = currentAccount;
        localStorage.setItem('lit-auth-info', JSON.stringify(authInfo));
        console.log('Updated auth info with PKP public keys:', authInfo);
      }
    } catch (error) {
      console.error('Error saving PKP info to localStorage:', error);
    }
    
    return (
      <div className="consent-form-overlay">
        <div className="consent-form-modal">
          <AuthenticatedConsentForm 
            currentAccount={currentAccount} 
            sessionSigs={sessionSigs}
            agentPKP={agentPKP}
            agentSessionSigs={agentSessionSigs}
          />
        </div>
        <style jsx>{`
          .consent-form-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .consent-form-modal {
            background-color: white;
            border-radius: 8px;
            border: 1px solid #e5e7eb;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            max-width: 48rem;
            max-height: calc(100vh - 2rem);
            overflow-y: auto;
            width: 100%;
            padding: 1.5rem;
            position: relative;
          }
        `}</style>
      </div>
    );
  }

  // No accounts found state
  if (authMethod && accounts.length === 0) {
    switch (authMethod.authMethodType) {
      case AUTH_METHOD_TYPE.WebAuthn:
        return (
          <div className="container">
            <div className="wrapper">
              <h1>No Accounts Found</h1>
              <p>You don&apos;t have any accounts associated with this WebAuthn credential.</p>
              <div className="auth-options">
                <div className="auth-option">
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={handleRegisterWithWebAuthn}
                  >
                    Create New Account
                  </button>
                </div>
                <div className="auth-option">
                  <button
                    type="button"
                    className="btn btn--outline"
                    onClick={() => authWithWebAuthn()}
                  >
                    Try Sign In Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case AUTH_METHOD_TYPE.StytchEmailFactorOtp:
      case AUTH_METHOD_TYPE.StytchSmsFactorOtp:
        return <Loading copy={'Creating your account...'} error={error} />;

      case AUTH_METHOD_TYPE.EthWallet:
        return (
          <div className="container">
            <div className="wrapper">
              <h1>No Accounts Found</h1>
              <p>No accounts were found for this wallet address.</p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => router.reload()}
              >
                Try Again
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="container">
            <div className="wrapper">
              <h1>Unsupported Authentication Method</h1>
              <p>The authentication method you&apos;re using is not supported.</p>
              <button
                type="button"
                className="btn btn--outline"
                onClick={() => router.reload()}
              >
                Start Over
              </button>
            </div>
          </div>
        );
    }
  }

  // Initial authentication state
  return (
    <LoginMethods
      authWithEthWallet={authWithEthWallet}
      authWithWebAuthn={authWithWebAuthn}
      authWithStytch={authWithStytch}
      registerWithWebAuthn={handleRegisterWithWebAuthn}
      error={error}
    />
  );
} 