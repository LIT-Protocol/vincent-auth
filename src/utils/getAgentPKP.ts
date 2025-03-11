import { ethers } from 'ethers';
import { IRelayPKP } from '@lit-protocol/types';
import { getPkpNftContract } from './get-pkp-nft-contract';
import { SELECTED_LIT_NETWORK } from './lit';

/**
 * Get Agent PKP for a user address
 * 
 * Finds an Agent PKP owned by the user that is different from their current PKP.
 * This is used for consent delegation and other agent-related operations.
 * 
 * @param userAddress The ETH address of the user's current PKP
 * @returns Promise<IRelayPKP> The Agent PKP details, or null if none found
 * @throws Error if no Agent PKP is found or if there's an issue with the contract calls
 */
export async function getAgentPKP(userAddress: string): Promise<IRelayPKP> {
  try {
    // Get the PKP NFT contract instance
    const pkpNftContract = getPkpNftContract(SELECTED_LIT_NETWORK);
    
    // Get the balance of PKPs owned by this address
    const balance = await pkpNftContract.balanceOf(userAddress);
    
    // Check if the user owns any PKPs
    if (balance.toNumber() === 0) {
      throw new Error('No PKPs found for this user');
    }
    
    // Iterate through each PKP owned by the user
    for (let i = 0; i < balance.toNumber(); i++) {
      // Get the token ID at the current index
      const tokenId = await pkpNftContract.tokenOfOwnerByIndex(userAddress, i);
      
      // Get the public key for this token
      const publicKey = await pkpNftContract.getPubkey(tokenId);
      
      // Get the ETH address for this token
      const ethAddress = await pkpNftContract.getEthAddress(tokenId);
      
      // Skip if this is the user's current PKP (same ETH address)
      if (ethAddress.toLowerCase() === userAddress.toLowerCase()) {
        continue;
      }
      
      // Return the first PKP that's not the user's current PKP
      return {
        tokenId: tokenId.toString(),
        publicKey,
        ethAddress
      };
    }
    
    // If we've gone through all PKPs and haven't found an Agent PKP
    throw new Error('No Agent PKP found for this user. The user needs a second PKP to act as an agent.');
  } catch (error) {
    // Rethrow with a more descriptive message if it's not already an Error
    if (error instanceof Error) {
      throw error;
    } else {
      throw new Error(`Failed to get Agent PKP: ${error}`);
    }
  }
}

/**
 * Checks if a user has an available Agent PKP
 * 
 * @param userAddress The ETH address of the user's current PKP
 * @returns Promise<boolean> True if the user has an Agent PKP, false otherwise
 */
export async function hasAgentPKP(userAddress: string): Promise<boolean> {
  try {
    await getAgentPKP(userAddress);
    return true;
  } catch (error) {
    return false;
  }
} 