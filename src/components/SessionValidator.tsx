import React, { useEffect, useState } from 'react';
import { litNodeClient } from '@/utils/lit';
import { LitActionResource } from '@lit-protocol/auth-helpers';
import { LitPKPResource } from '@lit-protocol/auth-helpers';
import { LIT_ABILITY } from '@lit-protocol/constants';
import { validateSessionSigs } from '@lit-protocol/misc';
import { disconnectWeb3 } from '@lit-protocol/auth-browser';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { SessionSigs, IRelayPKP } from '@lit-protocol/types';
import { ethers } from 'ethers';
import AuthenticatedConsentForm from './AuthenticatedConsentForm';
import { useRouter } from 'next/router';

// Define interfaces for the authentication info
interface AuthInfo {
  type: string;
  authenticatedAt: string;
  credentialId?: string;
  authMethodType?: number;
  pkp?: IRelayPKP;
  value?: string;
}

/**
 * A streamlined SessionValidator component that validates session signatures on mount
 */
const SessionValidator: React.FC = () => {
  const router = useRouter();
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [sessionSigs, setSessionSigs] = useState<SessionSigs | null>(null);
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [referrerUrl, setReferrerUrl] = useState<string | null>(null);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);

  // Check for auth info on mount
  useEffect(() => {
    // Try to get stored referrer URL from sessionStorage
    const storedReferrer = sessionStorage.getItem('referrerUrl');
    if (storedReferrer) {
      setReferrerUrl(storedReferrer);
    }
    
    // Get auth info from localStorage
    try {
      const storedAuthInfo = localStorage.getItem('lit-auth-info');
      if (storedAuthInfo) {
        const parsedAuthInfo = JSON.parse(storedAuthInfo);
        setAuthInfo(parsedAuthInfo);
        console.log('Retrieved auth info:', parsedAuthInfo);
        
        // If we have auth info with a PKP, show the popup
        if (parsedAuthInfo.pkp) {
          console.log('Found existing PKP in auth info, will check session validity');
        }
      }
    } catch (error) {
      console.error('Error retrieving auth info:', error);
    }
  }, []);

  // Validate session once we have auth info
  useEffect(() => {
    // Skip if we've already checked the session or don't have auth info
    if (hasCheckedSession || !authInfo || !authInfo.pkp) return;
    
    const validateSession = async () => {
      try {
        // Try to get a wallet signature using the session capability object
        try {
          // Check if lit-wallet-sig exists in localStorage first
          const litWalletSig = localStorage.getItem('lit-wallet-sig');
          if (!litWalletSig) {
            console.log('Storage key "lit-wallet-sig" is missing. Skipping session validation.');
            setHasCheckedSession(true);
            return; // Exit early if the key is missing
          }
          
          console.log('Generating wallet signature...');
          // Create lit resources for action execution and PKP signing
          const litResources = [
            new LitActionResource("*"),
            new LitPKPResource("*")
          ];
          
          // Generate session key
          const sessionKey = await litNodeClient.getSessionKey();
          
          // Generate session capability object with wildcards
          const sessionCapabilityObject = await litNodeClient.generateSessionCapabilityObjectWithWildcards(litResources);

          // Get wallet signature
          const walletSig = await litNodeClient.getWalletSig({
            chain: "ethereum",
            expiration: new Date(Date.now() + 1000 * 60 * 15).toISOString(),
            sessionKey,
            sessionKeyUri: `lit:session:${sessionKey.publicKey}`,
            sessionCapabilityObject,
            nonce: Date.now().toString(),
          });

          if (!walletSig) {
            setHasCheckedSession(true);
            return;
          }
          
          if (walletSig) {
            const ethersWallet = new ethers.Wallet("0x867266a73bfc47cf6d739d9732824441f060f042ea912f0043a87d28077193d2");
            const { capacityDelegationAuthSig } =
            await litNodeClient.createCapacityDelegationAuthSig({
              dAppOwnerWallet: ethersWallet,
              capacityTokenId: "142580",
            });

            const attemptedSessionSigs = await litNodeClient.getSessionSigs({
              capabilityAuthSigs: [walletSig, capacityDelegationAuthSig],
              resourceAbilityRequests: [
                {
                  resource: new LitActionResource('*'),
                  ability: LIT_ABILITY.LitActionExecution,
                },
                {
                  resource: new LitPKPResource('*'),
                  ability: LIT_ABILITY.PKPSigning,
                },
              ],
              authNeededCallback: () => {
                return Promise.resolve(walletSig);
              }
            });
            
            // Store session sigs in state for later use
            setSessionSigs(attemptedSessionSigs);
            
            const validationResult = await validateSessionSigs(attemptedSessionSigs);
            console.log('Validation result:', validationResult.isValid);
            
            // If validation is successful, show options (change from showing popup to showing consent form)
            if (validationResult.isValid) {
              console.log('Session is valid, showing popup to use existing account');
              setShowPopup(true);
            }
          }
        } catch (walletSigError) {
          console.error('Error generating wallet signature:', walletSigError);
        }
      } catch (error) {
        console.error('Error validating session:', error);
      } finally {
        setHasCheckedSession(true);
      }
    };
    
    validateSession();
  }, [authInfo, hasCheckedSession]);
  
  // Handle user's choice to use existing account
  const handleUseExistingAccount = async () => {
    if (sessionSigs && authInfo?.pkp) {
      // Instead of doing the JWT creation here, show the consent form
      setShowPopup(false);
      setShowConsentForm(true);
    } else {
      setShowPopup(false);
    }
  };
  
  // Handle user's choice to sign out
  const handleSignOut = async () => {
    // Clear auth info from localStorage
    try {
      localStorage.removeItem('lit-auth-info');
      console.log('Cleared authentication information from localStorage');
    } catch (error) {
      console.error('Error clearing auth info from localStorage:', error);
    }
    
    await disconnectWeb3()
    setShowPopup(false);
  };

  // Function to render auth method information
  const renderAuthMethodInfo = () => {
    if (!authInfo) return null;

    let methodName = '';
    let methodDetails = '';

    switch (authInfo.type) {
      case 'webauthn':
        methodName = 'WebAuthn Passkey';
        methodDetails = authInfo.credentialId ? `Credential ID: ${authInfo.credentialId.substring(0, 8)}...` : '';
        break;
      case 'email':
        methodName = 'Email OTP';
        methodDetails = authInfo.value ? `Email: ${authInfo.value}` : '';
        break;
      case 'phone':
        methodName = 'Phone OTP';
        methodDetails = authInfo.value ? `Phone: ${authInfo.value}` : '';
        break;
      default:
        methodName = authInfo.type;
    }

    const authTime = authInfo.authenticatedAt 
      ? new Date(authInfo.authenticatedAt).toLocaleString() 
      : 'Unknown time';

    // Get PKP Ethereum address for display
    const pkpEthAddress = authInfo.pkp?.ethAddress || 'Not available';

    return (
      <div className="auth-info">
        <h4>Authentication Method</h4>
        <p><strong>{methodName}</strong></p>
        {methodDetails && <p>{methodDetails}</p>}
        <p className="auth-time">Authenticated at: {authTime}</p>
        {authInfo.authMethodType !== undefined && (
          <p className="auth-method-type">Auth Method Type: {authInfo.authMethodType}</p>
        )}
        <div className="pkp-key">
          <p><strong>Account Ethereum Address:</strong></p>
          <p className="pkp-key-value">{pkpEthAddress}</p>
        </div>
      </div>
    );
  };
  
  // If showing consent form, render only that
  if (showConsentForm && sessionSigs && authInfo?.pkp) {
    return (
      <div className="consent-form-overlay">
        <div className="consent-form-modal">
          <button 
            className="close-button"
            onClick={() => setShowConsentForm(false)}
            aria-label="Close"
          >
            ✕
          </button>
          <AuthenticatedConsentForm 
            currentAccount={authInfo.pkp}
            sessionSigs={sessionSigs}
            agentPKP={authInfo.pkp}
            agentSessionSigs={sessionSigs}
            isSessionValidation={true}
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
          .close-button {
            position: absolute;
            top: 10px;
            right: 10px;
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: #666;
            z-index: 1;
          }
          .close-button:hover {
            color: #000;
          }
          .auth-info {
            margin: 20px 0;
            padding: 12px;
            background-color: #f3f4f6;
            border-radius: 6px;
            text-align: left;
          }
          .auth-info h4 {
            margin-top: 0;
            color: #4b5563;
          }
          .auth-time {
            font-size: 0.85rem;
            color: #6b7280;
            margin-top: 8px;
          }
          .auth-method-type {
            font-size: 0.85rem;
            color: #6b7280;
            margin-top: 4px;
          }
          .pkp-key {
            margin-top: 12px;
            border-top: 1px solid #e5e7eb;
            padding-top: 12px;
          }
          .pkp-key-value {
            font-family: monospace;
            font-size: 0.8rem;
            word-break: break-all;
            background-color: #e5e7eb;
            padding: 8px;
            border-radius: 4px;
            overflow-wrap: break-word;
          }
        `}</style>
      </div>
    );
  }
  
  // If not showing consent form, render popup or nothing
  return (
    <>
      {showPopup && (
        <div className="session-popup-overlay">
          <div className="session-popup">
            <h3>Use Existing Account?</h3>
            <p>Would you like to use your existing authentication for this session?</p>
            
            {renderAuthMethodInfo()}
            
            <div className="session-popup-buttons">
              <button onClick={handleUseExistingAccount} className="btn">
                Yes, Use Existing Account
              </button>
              <button onClick={handleSignOut} className="btn btn--outline">
                No, Sign Out
              </button>
            </div>
          </div>
          <style jsx>{`
            .session-popup-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background-color: rgba(0, 0, 0, 0.5);
              display: flex;
              justify-content: center;
              align-items: center;
              z-index: 1000;
            }
            .session-popup {
              background-color: white;
              padding: 24px;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              max-width: 480px;
              width: 100%;
              text-align: center;
            }
            .session-popup h3 {
              margin-top: 0;
              font-size: 20px;
            }
            .auth-info {
              margin: 20px 0;
              padding: 12px;
              background-color: #f3f4f6;
              border-radius: 6px;
              text-align: left;
            }
            .auth-info h4 {
              margin-top: 0;
              color: #4b5563;
            }
            .auth-time {
              font-size: 0.85rem;
              color: #6b7280;
              margin-top: 8px;
            }
            .auth-method-type {
              font-size: 0.85rem;
              color: #6b7280;
              margin-top: 4px;
            }
            .pkp-key {
              margin-top: 12px;
              border-top: 1px solid #e5e7eb;
              padding-top: 12px;
            }
            .pkp-key-value {
              font-family: monospace;
              font-size: 0.8rem;
              word-break: break-all;
              background-color: #e5e7eb;
              padding: 8px;
              border-radius: 4px;
              overflow-wrap: break-word;
            }
            .session-popup-buttons {
              display: flex;
              justify-content: center;
              gap: 12px;
              margin-top: 20px;
            }
            .btn {
              padding: 10px 16px;
              border-radius: 4px;
              font-weight: 500;
              cursor: pointer;
              border: none;
              transition: all 0.2s;
              background-color: #000;
              color: white;
            }
            .btn:hover {
              background-color: #333;
            }
            .btn--outline {
              background-color: transparent;
              border: 1px solid #000;
              color: #000;
            }
            .btn--outline:hover {
              background-color: rgba(0, 0, 0, 0.05);
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default SessionValidator; 