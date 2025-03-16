import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useAuthenticate from '../hooks/useAuthenticate';
import useAccounts from '../hooks/useAccounts';
import { registerWebAuthn, getSessionSigs, cleanupSession, litNodeClient } from '../utils/lit';
import { AUTH_METHOD_TYPE } from '@lit-protocol/constants';
import AuthenticatedConsentForm from '../components/AuthenticatedConsentForm';
import Loading from '../components/Loading';
import LoginMethods from '../components/LoginMethods';
import { SessionSigs, IRelayPKP } from '@lit-protocol/types';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { EthWalletProvider } from '@lit-protocol/lit-auth-client';
import { getAgentPKP } from '../utils/getAgentPKP';

export default function IndexView() {
  const router = useRouter();
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

        /*

        console.log('Getting session signatures for Agent PKP...');
        const agentPkpSessionSigs = await getSessionSigs({
          pkpPublicKey: agentPkpInfo.publicKey,
          authMethod: authMethodForAgent,
        });
        console.log('Agent PKP session sigs:', agentPkpSessionSigs);*/

        const agentPkpWallet = new PKPEthersWallet({
          controllerSessionSigs: sessionSigs,
          pkpPubKey: agentPkpInfo.publicKey,
          litNodeClient: litNodeClient,
        });
        await agentPkpWallet.init();

        const agentAuthMethod = await EthWalletProvider.authenticate({
          signer: agentPkpWallet,
          litNodeClient
        });
        console.log('Agent PKP authentication method:', agentAuthMethod);

        setAgentSessionSigs(sigs);
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
        authInfo.pkp = agentPKP;
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