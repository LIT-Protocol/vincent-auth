import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthenticate from '../hooks/useAuthenticate';
import useSession from '../hooks/useSession';
import useAccounts from '../hooks/useAccounts';
import { ORIGIN, registerWebAuthn } from '../utils/lit';
import { AUTH_METHOD_TYPE } from '@lit-protocol/constants';
import Dashboard from '../components/Dashboard';
import Loading from '../components/Loading';
import LoginMethods from '../components/LoginMethods';

export default function IndexView() {
  const router = useRouter();
  const { appId } = router.query;

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
  const {
    initSession,
    sessionSigs,
    loading: sessionLoading,
    error: sessionError,
  } = useSession();

  const error = authError || accountsError || sessionError;

  async function handleRegisterWithWebAuthn() {
    const newPKP = await registerWebAuthn();
    if (newPKP) {
      setCurrentAccount(newPKP);
    }
  }

  useEffect(() => {
    // If user is authenticated, fetch accounts
    if (authMethod) {
      // Preserve appId in the URL when replacing the pathname
      const query = appId ? { appId } : undefined;
      router.replace({ pathname: window.location.pathname, query }, undefined, { shallow: true });
      fetchAccounts(authMethod);
    }
  }, [authMethod, fetchAccounts, appId]);

  useEffect(() => {
    // If user is authenticated and has accounts, select the first one
    if (authMethod && accounts.length > 0 && !currentAccount) {
      setCurrentAccount(accounts[0]);
    }
  }, [authMethod, accounts, currentAccount, setCurrentAccount]);

  useEffect(() => {
    // If user is authenticated and has selected an account, initialize session
    if (authMethod && currentAccount) {
      initSession(authMethod, currentAccount);
    }
  }, [authMethod, currentAccount, initSession]);

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
    return <Dashboard currentAccount={currentAccount} sessionSigs={sessionSigs} />;
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