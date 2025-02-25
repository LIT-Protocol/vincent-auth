import { IRelayPKP, SessionSigs } from '@lit-protocol/types';
import { useRouter } from 'next/router';
import { useDisconnect } from 'wagmi';
import ConsentForm, { ConsentFormData } from './ConsentForm';
import FormSubmission from './FormSubmission';
import { useState } from 'react';

interface DashboardProps {
  currentAccount: IRelayPKP;
  sessionSigs: SessionSigs;
}

export default function Dashboard({
  currentAccount,
  sessionSigs,
}: DashboardProps) {
  const { disconnectAsync } = useDisconnect();
  const router = useRouter();
  const [showSuccess, setShowSuccess] = useState(false);

  const handleRedirect = (agentPkpAddress: string) => {
    const returnUrl = router.query.returnUrl as string;
    // Add pkpEthAddress to the returnUrl if it exists
    if (returnUrl) {
      const url = new URL(returnUrl);
      url.searchParams.append('pkpEthAddress', agentPkpAddress);
      window.location.href = url.toString();
    } else {
      // If no returnUrl, use document.referrer or fallback to '/'
      const fallbackUrl = document.referrer || '/';
      const url = new URL(fallbackUrl);
      url.searchParams.append('pkpEthAddress', agentPkpAddress);
      window.location.href = url.toString();
    }
  };

  async function handleLogout() {
    try {
      await disconnectAsync();
    } catch (err) { }
    localStorage.removeItem('lit-wallet-sig');
    handleRedirect(currentAccount.ethAddress);
  }

  const handleFormSubmit = async (formData: ConsentFormData) => {
    const submitForm = FormSubmission({
      currentAccount,
      sessionSigs,
      formData,
      onSuccess: () => {
        // Show success animation
        setShowSuccess(true);
        // Wait for the animation to play before redirecting
        return new Promise<void>(resolve => {
          // Give time for the checkmark animation to complete
          setTimeout(() => {
            handleRedirect(formData.agentPKP.ethAddress);
            resolve();
          }, 2000); // Increased time to ensure animation is visible
        });
      },
    });
    await submitForm();
  };

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
        <div className="logout-container">
          <button className="btn btn--link" onClick={handleLogout}>
            Logout
          </button>
        </div>
        <h1>Agent Consent Notice</h1>
        <ConsentForm 
          onSubmit={handleFormSubmit} 
          onDisapprove={handleLogout}
          userAddress={currentAccount.ethAddress}
        />
      </div>
    </div>
  );
}
