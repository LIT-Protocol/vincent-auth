import { AppProps } from 'next/app';
import '../styles/globals.css';
import { WagmiConfig, createClient, configureChains } from 'wagmi';
import { goerli, mainnet, optimism } from 'wagmi/chains';
import { publicProvider } from 'wagmi/providers/public';
import { CoinbaseWalletConnector } from 'wagmi/connectors/coinbaseWallet';
import { MetaMaskConnector } from 'wagmi/connectors/metaMask';
import { StytchProvider } from '@stytch/nextjs';
import { createStytchUIClient } from '@stytch/nextjs/ui';
import { Albert_Sans } from 'next/font/google';

const { provider, chains } = configureChains(
  [mainnet, goerli, optimism],
  [publicProvider()]
);

const client = createClient({
  autoConnect: false,
  connectors: [
    new MetaMaskConnector({
      chains,
      options: {
        UNSTABLE_shimOnConnectSelectAccount: true,
      },
    }),
    new CoinbaseWalletConnector({
      chains,
      options: {
        appName: 'wagmi',
      },
    }),
  ],
  provider,
});

const stytch = createStytchUIClient(
  "public-token-test-a131d94f-c829-4421-8fe2-3820b462e71c"
);

const font = Albert_Sans({ subsets: ['latin'] });

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <StytchProvider stytch={stytch}>
      <WagmiConfig client={client}>
        <main className={font.className}>
          <Component {...pageProps} />
        </main>
      </WagmiConfig>
    </StytchProvider>
  );
}
