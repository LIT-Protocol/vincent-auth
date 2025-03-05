import { IRelayPKP, SessionSigs } from '@lit-protocol/types';
import { PKPEthersWallet } from '@lit-protocol/pkp-ethers';
import { litNodeClient, mintPKPToExistingPKP, getSessionSigs, SELECTED_LIT_NETWORK, cleanupSession } from '../utils/lit';
import { LitContracts } from '@lit-protocol/contracts-sdk';
import type { ConsentFormData } from './ConsentForm';
import { ethers } from 'ethers';
import { getAgentRegistryContract } from '../utils/get-agent-registry-contract';
import { getAppDelegationRegistryContract } from '../utils/get-app-delegation-registry';
import { LIT_RPC, AUTH_METHOD_SCOPE } from "@lit-protocol/constants";
import { EthWalletProvider } from '@lit-protocol/lit-auth-client';
import { getPkpNftContract } from '../utils/get-pkp-nft-contract';

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

      // Assign a provider so that the wallets can send transactions.
      const provider = new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE);
      userPkpWallet.provider = provider;
      console.log('Provider assigned to wallets:', provider.connection.url);

      const agentRegistryContract = await getAgentRegistryContract();
      // Connect the contract with the wallet as signer
      const connectedContract = agentRegistryContract.connect(userPkpWallet);
      console.log('Contract connected with signer:', userPkpWallet.address);

      // Hardcode both management wallet and roleId
      const managementWallet = '0xD4383c15158B11a4Fa51F489ABCB3D4E43511b0a';
      // Convert roleId to bytes32
      const roleIdBytes32 = ethers.utils.formatBytes32String('a5b83467-4ac9-49b6-b45c-28552f51b026'.slice(0, 31));
      
      console.log('Using form data:', {
        managementWallet,
        roleId: roleIdBytes32,
        policyParams: formData.policyParams
      });

      // Prepare policy parameters from form data - needs to be string[][] and bytes[][]
      const policyParamNames = Object.keys(formData.policyParams || {}).map(key => [key]);
      
      const policyValues = Object.entries(formData.policyParams || {}).map(([_, value]: [string, string | number]) => [
        ethers.utils.defaultAbiCoder.encode(
          ['uint256'],
          [ethers.utils.parseEther(typeof value === 'string' ? value : value.toString())]
        )
      ]);

      // Use hardcoded values for contract call
/*
      const ownerOf = await PKP_NFT_FACET.ownerOf(tokenId);
      console.log("ownerOf", ownerOf);
      console.log("tokenId", tokenId);
      console.log("managementWallet", managementWallet);
      console.log("roleIdBytes32", roleIdBytes32);
      console.log("policyParamNames", policyParamNames);
      console.log("policyValues", policyValues);
      console.log("PKPEthersWallet", userPkpWallet.address);
      const gasLimit = await estimateGasLimit(
        agentRegistryContract.estimateGas.addRole,
        tokenId.toString(),
        managementWallet,
        roleIdBytes32,
        '1',
        ['Qmap3Qadj4FBPhSEor1rbnNdbZSE56ptFS7KH4XS716oJg'],
        policyParamNames,
        policyValues
      );
*/
      //console.log("gasLimit", gasLimit);

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

      if (onSuccess) {
        console.log('Calling onSuccess callback...');
        await onSuccess();
      }

      // Cleanup web3 connection after successful transaction
      await cleanupSession();

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
      
      // Cleanup web3 connection even on error
      try {
        await cleanupSession();
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError);
      }
      
      throw error;
    }
  };

  return handleFormSubmission;
}
