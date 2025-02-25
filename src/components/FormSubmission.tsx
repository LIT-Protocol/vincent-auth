import { IRelayPKP, SessionSigs } from '@lit-protocol/types';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { litNodeClient, mintPKPToExistingPKP, getSessionSigs, SELECTED_LIT_NETWORK } from '../utils/lit';
import type { ConsentFormData } from './ConsentForm';
import { ethers } from 'ethers';
import { getPkpToolRegistryContract } from '../utils/get-pkp-tool-registry-contract';
import { LIT_RPC } from "@lit-protocol/constants";
import { EthWalletProvider } from '@lit-protocol/lit-auth-client';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';

interface FormSubmissionProps {
  currentAccount: IRelayPKP;
  sessionSigs: SessionSigs;
  formData: ConsentFormData;
  onSuccess?: () => void | Promise<void>;
}

interface ToolRegistrationStatus {
  tool: string;
  isRegistered: boolean;
  isEnabled: boolean;
}

interface PermissionCheck {
  delegatee: string;
  toolsToPermit: string[];
}

interface VerificationData {
  success: boolean;
}

interface ToolWithPolicy {
  delegatees: string[];
  delegateesPolicyIpfsCids: string[];
  toolIpfsCid: string;
}

interface PolicyParameter {
  name: string;
  value: string;
}

export default function FormSubmission({
  currentAccount,
  sessionSigs,
  formData,
  onSuccess,
}: FormSubmissionProps) {
  // Helper function to estimate gas with a 20% buffer.
  async function estimateGasLimit(method: (...args: any[]) => Promise<any>, ...args: any[]) {
    const gasEstimate = await method(...args);
    // Add 20% buffer to the gas estimate.
    return gasEstimate.mul(120).div(100);
  }

  const handleFormSubmission = async (): Promise<VerificationData> => {
    try {
      // Use the agent PKP tokenId (from formData.agentPKP) for contract calls.
      const tokenId = ethers.BigNumber.from(formData.agentPKP.tokenId);
      console.log("Original tokenId value:", formData.agentPKP.tokenId);
      console.log("Converted tokenId (BigNumber):", tokenId.toString());
      
      // Connect to the Lit Node.
      console.log('Connecting to Lit Node...');
      await litNodeClient.connect();
      console.log('Connected to Lit Node');

      // Initialize the user PKP wallet (used for authentication and for owner-only calls).
      console.log('Initializing user PKP wallet...');
      const userPkpWallet = new PKPEthersWallet({
        controllerSessionSigs: sessionSigs,
        pkpPubKey: currentAccount.publicKey,
        litNodeClient,
      });
      await userPkpWallet.init();
      console.log('User PKP wallet initialized');
      console.log('User PKP details:', currentAccount);
      console.log('Agent PKP details:', formData.agentPKP);

      // Authenticate with EthWalletProvider using the user PKP.
      console.log('Authenticating with EthWalletProvider...');
      const authMethod = await EthWalletProvider.authenticate({
        signer: userPkpWallet,
        litNodeClient
      });
      console.log('Authentication method:', authMethod);

      // Derive session signatures for the agent PKP.
      console.log('Getting session signatures for Agent PKP...');
      const agentPkpSessionSigs = await getSessionSigs({
        pkpPublicKey: formData.agentPKP.publicKey,
        authMethod
      });
      console.log('Agent PKP session sigs:', agentPkpSessionSigs);
      
      // (Optional) Initialize the agent PKP wallet if needed for other operations.
      console.log('Initializing Agent PKP wallet...');
      const agentPkpWallet = new PKPEthersWallet({
        controllerSessionSigs: agentPkpSessionSigs,
        pkpPubKey: formData.agentPKP.publicKey,
        litNodeClient,
      });
      await agentPkpWallet.init();
      console.log('Agent PKP wallet initialized');
      console.log('Agent PKP wallet address:', agentPkpWallet.address);

      // Assign a provider so that the wallets can send transactions.
      const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      userPkpWallet.provider = provider;
      agentPkpWallet.provider = provider;
      console.log('Provider assigned to wallets:', provider.connection.url);

      if (onSuccess) {
        console.log('Calling onSuccess callback...');
        await onSuccess();
      }

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
        tokenId: formData.agentPKP.tokenId,
        delegatees: formData.delegatees
      });
      throw error;
    }
  };

  return handleFormSubmission;
}
