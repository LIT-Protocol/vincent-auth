import React, { useEffect } from 'react';
import { validateSessionSig } from '@lit-protocol/misc';

/**
 * A streamlined SessionValidator component that validates session signatures on mount
 */
const SessionValidator: React.FC = () => {
  useEffect(() => {
    const validateSession = async () => {
      try {
        const storedSessionSig = localStorage.getItem('lit-wallet-sig');
        
        if (!storedSessionSig) {
          console.log('No session signature found');
          return;
        }

        const validationResult = await validateSessionSig(JSON.parse(storedSessionSig));
        console.log('Validation result:', validationResult);
        
        if (validationResult && validationResult.isValid) {
          console.log('Session signature validated successfully');
        }
      } catch (error) {
        console.error('Error validating session:', error);
      }
    };
    
    validateSession();
  }, []);
  
  // This component doesn't render anything visible
  return null;
};

export default SessionValidator; 