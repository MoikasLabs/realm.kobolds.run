// ── $KOBLDS Underground Vault ────────────────────────────────
// Price data from DexScreener, swap quotes via Uniswap deep links,
// balance checks via raw RPC eth_call. No external deps.

const KOBLDS_TOKEN = "0x8a6d3bb6091ea0dd8b1b87c915041708d11f9d3a";
const WETH_TOKEN = "0x4200000000000000000000000000000000000006";
const USDC_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_CHAIN_ID = 8453;
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

const TOKENS: Record<string, { address: string; symbol: string; decimals: number }> = {
  WETH: { address: WETH_TOKEN, symbol: "WETH", decimals: 18 },
  USDC: { address: USDC_TOKEN, symbol: "USDC", decimals: 6 },
  KOBLDS: { address: KOBLDS_TOKEN, symbol: "$KOBLDS", decimals: 18 },
  "$KOBLDS": { address: KOBLDS_TOKEN, symbol: "$KOBLDS", decimals: 18 },
};

interface PriceData {
  priceUsd: string;
  priceEth: string;
  volume24h: string;
  liquidity: string;
  change24h: string;
}

interface CachedPrice {
  data: PriceData;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000; // 60s

export class KobldsVaultStore {
  private priceCache: CachedPrice | null = null;

  async getPrice(): Promise<{ ok: boolean; price?: PriceData; error?: string }> {
    // Return cached if fresh
    if (this.priceCache && Date.now() - this.priceCache.fetchedAt < CACHE_TTL_MS) {
      return { ok: true, price: this.priceCache.data };
    }

    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${KOBLDS_TOKEN}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!r.ok) return { ok: false, error: `DexScreener returned ${r.status}` };

      const json = (await r.json()) as {
        pairs?: Array<{
          priceUsd?: string;
          priceNative?: string;
          volume?: { h24?: number };
          liquidity?: { usd?: number };
          priceChange?: { h24?: number };
        }>;
      };

      const pair = json.pairs?.[0];
      if (!pair) return { ok: false, error: "No trading pair found on DexScreener" };

      const data: PriceData = {
        priceUsd: pair.priceUsd ?? "0",
        priceEth: pair.priceNative ?? "0",
        volume24h: String(pair.volume?.h24 ?? 0),
        liquidity: String(pair.liquidity?.usd ?? 0),
        change24h: String(pair.priceChange?.h24 ?? 0),
      };

      this.priceCache = { data, fetchedAt: Date.now() };
      return { ok: true, price: data };
    } catch (err) {
      return { ok: false, error: `DexScreener fetch failed: ${String(err)}` };
    }
  }

  async getQuote(
    inputToken: string,
    inputAmount: string,
    outputToken?: string,
  ): Promise<{ ok: boolean; quote?: { inputToken: string; outputToken: string; inputAmount: string; estimatedOutput: string; swapUrl: string }; error?: string }> {
    const inToken = TOKENS[inputToken.toUpperCase().replace("$", "")];
    if (!inToken) return { ok: false, error: `Invalid inputToken. Use WETH, USDC, or KOBLDS.` };

    const amount = Number(inputAmount);
    if (!isFinite(amount) || amount <= 0) return { ok: false, error: "inputAmount must be a positive number" };

    // Determine output token — default based on direction
    const isSellingKoblds = inToken.address.toLowerCase() === KOBLDS_TOKEN.toLowerCase();
    let outToken: { address: string; symbol: string; decimals: number };

    if (isSellingKoblds) {
      // Selling $KOBLDS → must specify WETH or USDC as output
      const outKey = (outputToken ?? "WETH").toUpperCase();
      const resolved = TOKENS[outKey];
      if (!resolved || resolved.address.toLowerCase() === KOBLDS_TOKEN.toLowerCase()) {
        return { ok: false, error: "outputToken must be WETH or USDC when selling $KOBLDS" };
      }
      outToken = resolved;
    } else {
      // Buying $KOBLDS with WETH/USDC
      outToken = TOKENS["KOBLDS"];
    }

    // Get current price to estimate output
    const priceResult = await this.getPrice();
    if (!priceResult.ok || !priceResult.price) {
      return { ok: false, error: priceResult.error ?? "Could not fetch price" };
    }

    let estimatedOutput: number;
    if (isSellingKoblds) {
      // Selling KOBLDS → get WETH or USDC
      if (outToken.symbol === "WETH") {
        const priceEth = Number(priceResult.price.priceEth);
        estimatedOutput = amount * priceEth;
      } else {
        const priceUsd = Number(priceResult.price.priceUsd);
        estimatedOutput = amount * priceUsd;
      }
    } else {
      // Buying KOBLDS with WETH or USDC
      if (inToken.symbol === "WETH") {
        const priceEth = Number(priceResult.price.priceEth);
        estimatedOutput = priceEth > 0 ? amount / priceEth : 0;
      } else {
        const priceUsd = Number(priceResult.price.priceUsd);
        estimatedOutput = priceUsd > 0 ? amount / priceUsd : 0;
      }
    }

    const swapUrl = `https://app.uniswap.org/swap?inputCurrency=${inToken.address}&outputCurrency=${outToken.address}&chain=base&exactAmount=${inputAmount}&exactField=input`;

    return {
      ok: true,
      quote: {
        inputToken: inToken.symbol,
        outputToken: outToken.symbol,
        inputAmount: String(amount),
        estimatedOutput: estimatedOutput.toFixed(4),
        swapUrl,
      },
    };
  }

  async getBalance(
    walletAddress: string,
  ): Promise<{ ok: boolean; balance?: { raw: string; formatted: string; wallet: string }; error?: string }> {
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
      return { ok: false, error: "Invalid wallet address" };
    }

    // balanceOf(address) selector = 0x70a08231
    const paddedAddr = walletAddress.slice(2).toLowerCase().padStart(64, "0");
    const data = `0x70a08231${paddedAddr}`;

    try {
      const r = await fetch(BASE_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: KOBLDS_TOKEN, data }, "latest"],
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const json = (await r.json()) as { result?: string; error?: { message?: string } };
      if (json.error) return { ok: false, error: json.error.message ?? "RPC error" };

      const rawHex = json.result ?? "0x0";
      const rawBigInt = BigInt(rawHex);
      const formatted = formatTokenAmount(rawBigInt, 18);

      return {
        ok: true,
        balance: {
          raw: rawBigInt.toString(),
          formatted: `${formatted} $KOBLDS`,
          wallet: walletAddress,
        },
      };
    } catch (err) {
      return { ok: false, error: `RPC call failed: ${String(err)}` };
    }
  }

  getTokenInfo(): {
    ok: boolean;
    token: { address: string; symbol: string; decimals: number; name: string; chainId: number; network: string; dexScreenerUrl: string; baseScanUrl: string; uniswapUrl: string };
  } {
    return {
      ok: true,
      token: {
        address: KOBLDS_TOKEN,
        symbol: "$KOBLDS",
        decimals: 18,
        name: "Kobolds",
        chainId: BASE_CHAIN_ID,
        network: "Base",
        dexScreenerUrl: `https://dexscreener.com/base/${KOBLDS_TOKEN}`,
        baseScanUrl: `https://basescan.org/token/${KOBLDS_TOKEN}`,
        uniswapUrl: `https://app.uniswap.org/swap?outputCurrency=${KOBLDS_TOKEN}&chain=base`,
      },
    };
  }
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const remainder = raw % divisor;
  if (remainder === 0n) return whole.toString();
  const fracStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${whole}.${fracStr}`;
}
