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
  verificationData: [
    string[],  // delegatees
    string[],  // registeredTools
    any[],     // toolsWithPolicies
    ...any[]   // policyParameters
  ];
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

      // Get the contract instance (provider-only).
      console.log('Fetching PKP Tool Registry contract instance...');
      const contract = await getPkpToolRegistryContract('datil-dev');
      console.log('Contract instance created at:', contract.address);

      // Validate delegatee addresses.
      const validDelegatees = formData.delegatees.map((d: string) => {
        const validAddress = ethers.utils.getAddress(d);
        console.log('Validated delegatee address:', validAddress);
        return validAddress;
      });

      // For calls requiring owner privileges (registerTools, addDelegatees, permitToolsForDelegatees),
      // connect the contract with the user PKP wallet.
      const contractWithOwnerSigner = contract.connect(userPkpWallet);
      
      // -------------------------------------------
      // Step 1: Check and register tools if needed.
      // -------------------------------------------
      console.log('Step 1: Checking tool registration status...');
      const toolRegistrationPromises = formData.tools.map(async tool => {
        console.log(`Checking registration for tool: ${tool} with tokenId: ${tokenId.toString()}`);
        const [isRegistered, isEnabled] = await contract.isToolRegistered(tokenId, tool);
        console.log(`Tool ${tool} - isRegistered: ${isRegistered}, isEnabled: ${isEnabled}`);
        return { tool, isRegistered, isEnabled } as ToolRegistrationStatus;
      });
      const toolRegistrationStatus = await Promise.all(toolRegistrationPromises);
      
      const unregisteredTools = toolRegistrationStatus
        .filter(status => !status.isRegistered || !status.isEnabled)
        .map(status => status.tool);
      console.log('Unregistered or disabled tools:', unregisteredTools);

      if (unregisteredTools.length > 0) {
        console.log('Step 1: Registering new tools:', unregisteredTools);
        console.log("Parameters: tokenId:", tokenId.toString(), "tools:", unregisteredTools, "enabled: true");

        const gasLimit = await estimateGasLimit(
          contractWithOwnerSigner.estimateGas.registerTools,
          tokenId,
          unregisteredTools,
          true
        );
        const tx = await contractWithOwnerSigner.registerTools(tokenId, unregisteredTools, true, { gasLimit });
        console.log('Tool registration transaction sent. Tx hash:', tx.hash);
        const receipt = await tx.wait();
        console.log('Tool registration receipt:', receipt);
      } else {
        console.log('Step 1: All tools are already registered and enabled');
      }

      // -----------------------------------------------
      // Step 2: Check and add delegatees if needed.
      // -----------------------------------------------
      console.log('Step 2: Checking delegatee status...');
      const currentDelegatees = await contract.getDelegatees(tokenId);
      console.log('Current delegatees on contract:', currentDelegatees);
      const newDelegatees = validDelegatees.filter(
        delegatee => !currentDelegatees.map((d: string) => d.toLowerCase()).includes(delegatee.toLowerCase())
      );
      console.log('Delegatees to be added:', newDelegatees);

      if (newDelegatees.length > 0) {
        console.log('Step 2: Adding new delegatees:', newDelegatees);
        console.log("Parameters: tokenId:", tokenId.toString(), "delegatees:", newDelegatees);

        const gasLimit = await estimateGasLimit(
          contractWithOwnerSigner.estimateGas.addDelegatees,
          tokenId,
          newDelegatees
        );
        const delegateeTx = await contractWithOwnerSigner.addDelegatees(tokenId, newDelegatees, { gasLimit });
        console.log('Delegatee addition transaction sent. Tx hash:', delegateeTx.hash);
        const delegateeReceipt = await delegateeTx.wait();
        console.log('Delegatee addition receipt:', delegateeReceipt);
      } else {
        console.log('Step 2: All delegatees are already added');
      }

      // -------------------------------------------------------
      // Step 3: Check and permit tools for delegatees if needed.
      // -------------------------------------------------------
      console.log('Step 3: Checking tool permissions for delegatees...');
      const permissionChecks = await Promise.all(
        validDelegatees.map(async (delegatee: string) => {
          console.log(`Fetching permitted tools for delegatee: ${delegatee} with tokenId: ${tokenId.toString()}`);
          const permittedTools = await contract.getPermittedToolsForDelegatee(tokenId, delegatee);
          const permittedToolCids = permittedTools.map((t: ToolWithPolicy) => t.toolIpfsCid);
          console.log(`Delegatee ${delegatee} has permitted tools:`, permittedToolCids);
          return {
            delegatee,
            toolsToPermit: formData.tools.filter((tool: string) => !permittedToolCids.includes(tool))
          } as PermissionCheck;
        })
      );
      console.log('Permission check results:', permissionChecks);

      for (const check of permissionChecks) {
        for (const tool of check.toolsToPermit) {
          console.log(`Step 3: Setting tool permission for delegatee ${check.delegatee} and tool ${tool}...`);
          console.log("Parameters: tokenId:", tokenId.toString(), "tool:", tool, "delegatee:", check.delegatee);
          const gasLimit = await estimateGasLimit(
            contractWithOwnerSigner.estimateGas.permitToolsForDelegatees,
            tokenId,
            [tool],
            [check.delegatee]
          );
          const tx = await contractWithOwnerSigner.permitToolsForDelegatees(tokenId, [tool], [check.delegatee], { gasLimit });
          console.log('Permission transaction sent. Tx hash:', tx.hash);
          const receipt = await tx.wait();
          console.log(`Permission receipt for delegatee ${check.delegatee} and tool ${tool}:`, receipt);
        }
      }

      // --------------------------------------------------------
      // Step 4: Check and set tool policies for delegatees if needed.
      // --------------------------------------------------------
      console.log('Step 4: Checking tool policies...');
      const toolsWithPolicies = await contract.getToolsWithPolicy(tokenId);
      console.log('Tools with policies currently:', toolsWithPolicies);
      const policyUpdatesNeeded = validDelegatees.some((delegatee: string) =>
        !toolsWithPolicies.some((tool: ToolWithPolicy) =>
          tool.delegatees.map((d: string) => d.toLowerCase()).includes(delegatee.toLowerCase()) &&
          formData.policies.every(policy => tool.delegateesPolicyIpfsCids.includes(policy))
        )
      );
      console.log('Policy updates needed:', policyUpdatesNeeded);

      if (policyUpdatesNeeded) {
        console.log('Step 4: Setting tool policies...');
        console.log("Parameters: tokenId:", tokenId.toString(), "tools:", formData.tools, "delegatees:", validDelegatees, "policies:", formData.policies);
        const gasLimit = await estimateGasLimit(
          contractWithOwnerSigner.estimateGas.setToolPoliciesForDelegatees,
          tokenId,
          formData.tools,
          validDelegatees,
          formData.policies,
          true
        );
        const policyTx = await contractWithOwnerSigner.setToolPoliciesForDelegatees(
          tokenId,
          formData.tools,
          validDelegatees,
          formData.policies,
          true,
          { gasLimit }
        );
        console.log('Policy setting transaction sent. Tx hash:', policyTx.hash);
        const policyReceipt = await policyTx.wait();
        console.log('Policy setting receipt:', policyReceipt);
      } else {
        console.log('Step 4: All policies are already set correctly');
      }

      // ----------------------------------------------------------------
      // Step 5: Check and set policy parameters for each delegatee if needed.
      // ----------------------------------------------------------------
      for (const delegatee of validDelegatees) {
        for (const [paramType, paramValues] of Object.entries(formData.parameters)) {
          console.log(`Step 5: Checking ${paramType} parameters for delegatee ${delegatee}...`);
          const parameterNames = paramValues.map((_, i) => `${paramType}${i + 1}`);
          console.log(`Parameter names for delegatee ${delegatee}:`, parameterNames);
          
          const currentParameters = await contract.getToolPolicyParameters(
            tokenId,
            formData.tools[0],
            delegatee,
            parameterNames
          );
          console.log(`Raw policy parameters for delegatee ${delegatee}:`, currentParameters);

          const currentValues = currentParameters.map((param: PolicyParameter) =>
            ethers.utils.defaultAbiCoder.decode(['string'], param.value)[0]
          );
          console.log(`Decoded current values for delegatee ${delegatee}:`, currentValues);
          
          const valuesMatch = paramValues.every(
            (value, i) => currentValues[i] === value
          );
          console.log(`Do current values match expected for delegatee ${delegatee}?`, valuesMatch);

          if (!valuesMatch) {
            console.log(`Step 5: Updating ${paramType} parameters for delegatee ${delegatee}...`);
            const encodedValues = paramValues.map(value => 
              ethers.utils.defaultAbiCoder.encode(['string'], [value])
            );
            console.log(`Encoded values for delegatee ${delegatee}:`, encodedValues);

            const gasLimit = await estimateGasLimit(
              contractWithOwnerSigner.estimateGas.setToolPolicyParametersForDelegatee,
              tokenId,
              formData.tools[0],
              delegatee,
              parameterNames,
              encodedValues
            );
            const paramTx = await contractWithOwnerSigner.setToolPolicyParametersForDelegatee(
              tokenId,
              formData.tools[0],
              delegatee,
              parameterNames,
              encodedValues,
              { gasLimit }
            );
            console.log(`${paramType} parameter update transaction sent. Tx hash:`, paramTx.hash);
            const paramReceipt = await paramTx.wait();
            console.log(`${paramType} parameters update receipt for delegatee ${delegatee}:`, paramReceipt);
          } else {
            console.log(`Step 5: ${paramType} parameters already correct for delegatee ${delegatee}`);
          }
        }
      }
      
      // ----------------------------
      // Final state verification.
      // ----------------------------
      console.log('Performing final state verification...');
      const verificationData = await Promise.all([
        contract.getDelegatees(tokenId),
        contract.getAllRegisteredTools(tokenId),
        contract.getToolsWithPolicy(tokenId),
        ...validDelegatees.flatMap(delegatee => 
          Object.entries(formData.parameters).map(([paramType, paramValues]) =>
            contract.getToolPolicyParameters(
              tokenId,
              formData.tools[0],
              delegatee,
              paramValues.map((_, i) => `${paramType}${i + 1}`)
            )
          )
        )
      ]);

      console.log('Final state verification data:', {
        delegatees: verificationData[0],
        registeredTools: verificationData[1],
        toolsWithPolicies: verificationData[2],
        policyParameters: verificationData.slice(3)
      });

      if (onSuccess) {
        console.log('Calling onSuccess callback...');
        await onSuccess();
      }

      return {
        success: true,
        verificationData: [
          verificationData[0],
          verificationData[1],
          verificationData[2],
          ...verificationData.slice(3)
        ]
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
