import { useEffect, useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
const { Asset, Horizon, Networks, TransactionBuilder, Operation } = StellarSdk;
const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");


declare global {
  interface Window {
    freighterApi?: {
      isConnected: () => Promise<boolean>;
      getPublicKey: () => Promise<string>;
      signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>;
    };
  }
}

function App() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");

  // Fetch balance when wallet connects
  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        setLoadingBalance(true);
        const account = await server.loadAccount(publicKey);
        const native = account.balances.find(
          (b) => b.asset_type === "native"
        ) as Horizon.BalanceLineNative | undefined;

        setBalance(native ? `${native.balance} XLM` : "0 XLM");
      } catch (e) {
        console.error(e);
        setBalance("Error loading balance");
      } finally {
        setLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [publicKey]);

  const connectWallet = async () => {
    try {
      if (!window.freighterApi) {
        alert("Freighter not found. Make sure the extension is installed and enabled in Chrome.");
        return;
      }

      const pk = await window.freighterApi.getPublicKey();
      setPublicKey(pk);
    } catch (e) {
      console.error(e);
      alert("Failed to connect wallet. Check Freighter is unlocked and on Testnet.");
    }
  };

  const disconnectWallet = () => {
    setPublicKey(null);
    setBalance(null);
    setTxStatus("idle");
    setTxHash(null);
    setTxError(null);
    setDest("");
    setAmount("");
  };

  const sendPayment = async () => {
    if (!publicKey) {
      alert("Connect wallet first");
      return;
    }
    if (!dest || !amount) {
      alert("Enter destination and amount");
      return;
    }

    try {
      if (!window.freighterApi) {
        alert("Freighter not available.");
        return;
      }

      setTxStatus("pending");
      setTxHash(null);
      setTxError(null);

      const account = await server.loadAccount(publicKey);

      const tx = new TransactionBuilder(account, {
        fee: "100", // base fee in stroops
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: dest,
            asset: Asset.native(),
            amount,
          })
        )
        .setTimeout(180)
        .build();

      const signedXdr = await window.freighterApi.signTransaction(tx.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      });

      const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
      const result = await server.submitTransaction(signedTx);

      setTxStatus("success");
      setTxHash(result.hash);

      // refresh balance
      const updated = await server.loadAccount(publicKey);
      const native = updated.balances.find(
        (b) => b.asset_type === "native"
      ) as Horizon.BalanceLineNative | undefined;
      setBalance(native ? `${native.balance} XLM` : "0 XLM");
    } catch (e: any) {
      console.error(e);
      setTxStatus("error");
      setTxError(
        e?.response?.data?.extras?.result_codes?.operations?.[0] ||
          e?.message ||
          "Transaction failed"
      );
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        background: "#050816",
        color: "white",
      }}
    >
      <h1>Twisha Shriyam Research Lab – Stellar White Belt</h1>

      {!publicKey ? (
        <button onClick={connectWallet} style={{ marginTop: "1rem" }}>
          Connect Freighter Wallet
        </button>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <p>
            Connected: <code>{publicKey}</code>
          </p>
          <button onClick={disconnectWallet}>Disconnect</button>
        </div>
      )}

      <div style={{ marginTop: "1.5rem" }}>
        <h2>Balance</h2>
        {publicKey ? (
          loadingBalance ? <p>Loading balance…</p> : <p>{balance}</p>
        ) : (
          <p>Connect wallet to see balance.</p>
        )}
      </div>

      <div style={{ marginTop: "2rem" }}>
        <h2>Send XLM (Testnet)</h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            maxWidth: "400px",
          }}
        >
          <input
            placeholder="Destination address (G...)"
            value={dest}
            onChange={(e) => setDest(e.target.value)}
          />
          <input
            placeholder="Amount (XLM)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button onClick={sendPayment} disabled={txStatus === "pending"}>
            {txStatus === "pending" ? "Sending…" : "Send XLM"}
          </button>
        </div>

        <div style={{ marginTop: "1rem" }}>
          {txStatus === "success" && txHash && (
            <p>
              Success! Tx hash:{" "}
              <a
                href={`https://horizon-testnet.stellar.org/transactions/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "#38bdf8" }}
              >
                {txHash}
              </a>
            </p>
          )}
          {txStatus === "error" && (
            <p style={{ color: "tomato" }}>Error: {txError}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
