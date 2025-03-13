import { IRelayPKP, SessionSigs } from '@lit-protocol/types';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { litNodeClient, mintPKPToExistingPKP, getSessionSigs, SELECTED_LIT_NETWORK } from '../utils/lit';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import type { ConsentFormData } from './ConsentForm';
import { ethers } from 'ethers';
import { LIT_RPC, AUTH_METHOD_SCOPE } from "@lit-protocol/constants";
import { EthWalletProvider } from '@lit-protocol/lit-auth-client';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';
import { validateSessionSigs } from '@lit-protocol/misc';

interface FormSubmissionProps {
  currentAccount: IRelayPKP;
  sessionSigs: SessionSigs;
  formData: ConsentFormData;
  roleId: string;
  onSuccess?: () => void | Promise<void>;
}

interface VerificationData {
  success: boolean;
}

export default function FormSubmission({
  currentAccount,
  sessionSigs,
  formData,
  roleId,
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
        authMethod,
      });
      console.log('Agent PKP session sigs:', agentPkpSessionSigs);
      
      // Assign a provider so that the wallets can send transactions.
      const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      userPkpWallet.provider = provider;
      console.log('Provider assigned to wallets:', provider.connection.url);

      /*
      const agentRegistryContract = await getAgentRegistryContract();
      // Connect the contract with the wallet as signer
      const connectedContract = agentRegistryContract.connect(userPkpWallet);
      console.log('Contract connected with signer:', userPkpWallet.address);
      */

      // Prepare policy parameters from form data - needs to be string[][] and bytes[][]
      const policyParamNames = Object.keys(formData.policyParams || {}).map(key => [key]);
      
      const policyValues = Object.entries(formData.policyParams || {}).map(([_, value]: [string, string | number]) => [
        ethers.utils.defaultAbiCoder.encode(
          ['uint256'],
          [ethers.utils.parseEther(typeof value === 'string' ? value : value.toString())]
        )
      ]);


      /*
      const tx = await connectedContract.addRole(
        tokenId,
        managementWallet,
        roleIdBytes32,
        '1',
        ['Qmap3Qadj4FBPhSEor1rbnNdbZSE56ptFS7KH4XS716oJg'],
        policyParamNames,
        policyValues,
        { gasLimit: 1000000 }
      );

      console.log("tx", tx);

      const litContracts = new LitContracts({
        network: SELECTED_LIT_NETWORK,
        signer: userPkpWallet,
      });
      await litContracts.connect();


      // forEach here on the toolCids
      const actionTx = await litContracts.addPermittedAction({
        authMethodScopes: [AUTH_METHOD_SCOPE.SignAnything],
        ipfsId: "Qmap3Qadj4FBPhSEor1rbnNdbZSE56ptFS7KH4XS716oJg",//
        pkpTokenId: tokenId.toString()
      })

      console.log("actionTx", actionTx);
      */

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
      });
      throw error;
    }
  };

  return handleFormSubmission;
}
