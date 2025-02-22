import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface AppMetadata {
  name: string;
  description: string;
}

export interface PolicyInfo {
  id: string;
  description: string;
}

export interface ParameterConfig {
  title: string;
  description: string;
  itemLabel?: string;
  defaultValues?: string[];
  type: 'number' | 'string' | 'array';
  isMultiple?: boolean;  // Whether multiple values are allowed
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface AppInfo {
  id: number;
  appId: string;
  appManagementAddress: string;
  verified: boolean;
  tools: string[];
  toolDescriptions: string[];
  policies: PolicyInfo[];
  metadata: AppMetadata;
  supportEmail: string;
  appLogo?: string;
  parameters: {
    [key: string]: ParameterConfig;
  };
  defaultParameters?: {
    [key: string]: string[];
  };
  toolId: string;
}

interface LitConsentDB extends DBSchema {
  apps: {
    key: number;
    value: AppInfo;
    indexes: {
      'by-app-id': string;
      'by-address': string;
    };
  };
}

const DB_NAME = 'lit-consent-db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<LitConsentDB>> | null = null;
let isInitialized = false;

async function createDatabase(): Promise<IDBPDatabase<LitConsentDB>> {
  return openDB<LitConsentDB>(DB_NAME, DB_VERSION, {
    upgrade(db: IDBPDatabase<LitConsentDB>, oldVersion, newVersion) {
      // Delete existing store if it exists
      if (db.objectStoreNames.contains('apps')) {
        db.deleteObjectStore('apps');
      }
      
      const store = db.createObjectStore('apps', {
        keyPath: 'id',
        autoIncrement: true,
      });
      
      // Create indexes for quick lookups
      store.createIndex('by-app-id', 'appId', { unique: true });
      store.createIndex('by-address', 'appManagementAddress', { unique: true });
    },
  });
}

export async function initDB(): Promise<IDBPDatabase<LitConsentDB>> {
  if (!dbPromise) {
    dbPromise = createDatabase();
    const db = await dbPromise;
    
    // Only load example apps during first initialization
    if (!isInitialized) {
      let counter = 1;
      for (const app of exampleApps) {
        try {
          await db.add('apps', { ...app, id: counter++ });
        } catch (err) {
          // If app already exists, update it
          const existingApp = await db.getFromIndex('apps', 'by-app-id', app.appId);
          if (existingApp) {
            await db.put('apps', { ...app, id: existingApp.id });
          }
        }
      }
      isInitialized = true;
    }
  }
  return dbPromise;
}

// For development/testing - reinitialize the database
export async function reinitializeDB(): Promise<void> {
  const db = await initDB();
  isInitialized = false; // Reset initialization flag
  
  // Clear all records
  const tx = db.transaction('apps', 'readwrite');
  await tx.store.clear();
  
  // Add example apps
  let counter = 1;
  for (const app of exampleApps) {
    await db.add('apps', { ...app, id: counter++ });
  }
  
  isInitialized = true;
  console.log('Database reinitialized with example apps');
}

// Debug function to verify database contents
export async function verifyDatabaseContents(): Promise<void> {
  const db = await initDB();
  const apps = await db.getAll('apps');
  console.log('Current database contents:', apps);
}

// Database operations
export async function addApp(app: Omit<AppInfo, 'id'>): Promise<number> {
  const db = await initDB();
  const id = await db.add('apps', app as AppInfo);
  return id;
}

export async function getAppByAppId(appId: string): Promise<AppInfo | undefined> {
  const db = await initDB();
  return db.getFromIndex('apps', 'by-app-id', appId);
}

export async function updateApp(id: number, app: Partial<AppInfo>): Promise<void> {
  const db = await initDB();
  const existingApp = await db.get('apps', id);
  if (!existingApp) {
    throw new Error('App not found');
  }
  await db.put('apps', { ...existingApp, ...app });
}

export async function getAppById(id: number): Promise<AppInfo | undefined> {
  const db = await initDB();
  return db.get('apps', id);
}

export async function getAppByAddress(address: string): Promise<AppInfo | undefined> {
  const db = await initDB();
  return db.getFromIndex('apps', 'by-address', address);
}

export async function getAllApps(): Promise<AppInfo[]> {
  const db = await initDB();
  return db.getAll('apps');
}

export async function deleteApp(id: number): Promise<void> {
  const db = await initDB();
  await db.delete('apps', id);
}

// Example app data for testing
export const exampleApps: Omit<AppInfo, 'id'>[] = [
  {
    appId: '123',
    appManagementAddress: '0x1582F4E36154f2EC442a2B3425d4C2520704096E',
    verified: true,
    tools: ['QmbsiG3mZmgcJteVx6w3dstCzgunxgMUpcic4kZCVgxAz8'],
    toolDescriptions: [
      'Execute automated trades to dollar-cost average into ETH.',
      'Monitor market conditions to find optimal trade timing.'
    ],
    policies: [
      {
        id: 'QmVCmseCqcfyH9inDHBLMvkqeGohH3U7i8swiVKcyRMGBC',
        description: 'Transaction Spending Limit: Maximum spend of $[spendingLimit] USD per transaction.'
      },
      {
        id: 'QmWCmseCqcfyH9inDHBLMvkqeGohH3U7i8swiVKcyRMGAB',
        description: 'DCA Frequency: Execute trades every [frequency] hours on Uniswap V3.'
      }
    ],
    metadata: {
      name: 'Lit DCA Agent',
      description: 'An automated agent that helps you dollar-cost average into ETH at optimal times.'
    },
    supportEmail: 'dca-support@lit.protocol',
    appLogo: 'https://i.imgur.com/sJAiBYQ.png',
    parameters: {
      spendingLimit: {
        title: 'Transaction Spending Limit',
        description: 'Maximum amount in USD that can be spent in a single transaction',
        itemLabel: 'USD amount',
        defaultValues: ['100'],
        type: 'number',
        isMultiple: false,
        validation: {
          min: 1,
          max: 10000
        }
      },
      frequency: {
        title: 'DCA Frequency',
        description: 'How often the agent executes trades (in hours)',
        itemLabel: 'hours',
        defaultValues: ['24'],
        type: 'number',
        isMultiple: false,
        validation: {
          min: 1,
          max: 168 // 1 week in hours
        }
      }
    },
    defaultParameters: {
      spendingLimit: ['100'],
      frequency: ['24']
    },
    toolId: 'QmbsiG3mZmgcJteVx6w3dstCzgunxgMUpcic4kZCVgxAz8'
  },
  {
    appId: '456',
    appManagementAddress: '0x2692f4e36154f2ec442a2b3425d4c2520704096f',
    verified: true,
    tools: ['QmcsiG3mZmgcJteVx6w3dstCzgunxgMUpcic4kZCVgxAz8'],
    toolDescriptions: [
      'Sign messages using your Agent Wallet',
      'Only sign messages that start with the allowed prefixes',
    ],
    policies: [
      {
        id: 'QmWDmseCqcfyH9inDHBLMvkqeGohH3U7i8swiVKcyRMGBC',
        description: 'Only sign messages with approved prefixes'
      }
    ],
    metadata: {
      name: 'Uniswap Agent',
      description: 'You are permitting Uniswap Agent to:'
    },
    supportEmail: 'support@uniswap.org',
    appLogo: 'https://i.imgur.com/pFnokNh.png',
    parameters: {
      prefixes: {
        title: 'Allowed Message Prefixes',
        description: 'Messages must start with one of these prefixes to be signed',
        itemLabel: 'prefix',
        defaultValues: ['start', 'begin'],
        type: 'string',
        isMultiple: true,
        validation: {
          pattern: '^[a-zA-Z0-9_-]+$'
        }
      }
    },
    defaultParameters: {
      prefixes: ['start', 'begin']
    },
    toolId: 'QmcsiG3mZmgcJteVx6w3dstCzgunxgMUpcic4kZCVgxAz8'
  }
]; 