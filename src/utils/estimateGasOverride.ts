import { ethers } from "ethers";

export async function prepareTxnForSimulation(
	txn: ethers.providers.TransactionRequest,
) {
	// console.log("txn", txn);
	if (
		txn.gasPrice === undefined ||
		txn.nonce === undefined ||
		txn.chainId === undefined
	) {
		throw new Error("Txn is missing gasPrice, nonce, or chainId");
	}
	return {
		...txn,
		gasPrice: ethers.utils.hexValue(txn.gasPrice),
		nonce: ethers.utils.hexValue(txn.nonce),
		chainId: ethers.utils.hexValue(txn.chainId),
		value:
			txn.value === undefined
				? undefined
				: ethers.utils.hexValue(txn.value),
	};
}

export async function estimateGasWithBalanceOverride({
	provider,
	txn,
	walletAddress,
	balance = ethers.utils.parseEther("1"), // default to 1 eth
}: {
	provider: ethers.providers.JsonRpcProvider;
	txn: ethers.providers.TransactionRequest;
	walletAddress: string;
	balance?: ethers.BigNumber;
}) {
	const stateOverrides = {
		[walletAddress]: {
			balance: ethers.utils.hexValue(balance),
		},
	};

	const txnForSimulation = await prepareTxnForSimulation(txn);

	const gasLimit = await provider.send("eth_estimateGas", [
		txnForSimulation,
		"latest",
		stateOverrides,
	]);

	return gasLimit;
}