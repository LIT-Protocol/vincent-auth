import { ethers } from 'ethers';
import { LIT_RPC } from '@lit-protocol/constants';

const APP_DELEGATION_REGISTRY_ADDRESS = '0x9B9cfE712a738BC8885a16F63240cCfE17959aF3';

export const getAppDelegationRegistryContract = async () => {
  const VINCENT_APP_DELEGATION_REGISTRY_ABI = [
    // Constructor - Initializes the contract with PKP NFT contract
    'constructor(address pkpNftFacet)',
    // Delegatee Management Functions
    // Functions to manage delegatees who can act on behalf of app managers
    'function addDelegatee(address delegatee)',
    'function removeDelegatee(address delegatee)',
    'function isDelegatee(address appManager, address delegatee) view returns (bool)',
    'function getDelegatees(address appManager) view returns (address[])',
    'function getAppManagerByDelegatee(address delegatee) view returns (address)',
    // Events
    // Events emitted when delegatee relationships change
    'event DelegateeAdded(address indexed appManager, address indexed delegatee)',
    'event DelegateeRemoved(address indexed appManager, address indexed delegatee)',
    // App Permission Events
    // Events emitted when app permissions are modified
    'event AppPermitted(address indexed appManager, uint256 indexed agentPkpTokenId)',
    'event AppUnpermitted(address indexed appManager, uint256 indexed agentPkpTokenId)',
  ];

  return new ethers.Contract(
    APP_DELEGATION_REGISTRY_ADDRESS,
    VINCENT_APP_DELEGATION_REGISTRY_ABI,
    new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
  );
};
