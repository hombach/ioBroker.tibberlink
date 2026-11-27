import assert from "node:assert";
import axios from "axios";
import { createMockAdapter } from "./testHelpers.test.ts";
import { ENCRYPTED_TOKEN_PREFIX, TibberDataAPI } from "./tibberDataAPI.ts";
import { BRIDGE_REQUEST_TIMEOUT_MS, TibberLocal } from "./tibberLocal.ts";

type LocalInternals = {
	meterModes: Map<number, number>;
	pollsInFlight: Set<string>;
	fetchPulseInfo(pulse: number, obj: unknown, prefix?: string, firstTime?: boolean): void;
	tryStartPoll(jobKey: string): boolean;
	axiosWithBridgeFallback(pulse: number, kind: "data" | "metrics", config: object): Promise<unknown>;
};

function makeLocal(): LocalInternals {
	const { adapter } = createMockAdapter({
		UseLocalPulseData: true,
		PulseList: [
			{ puName: "A", tibberBridgeUrl: "10.0.0.1", tibberBridgePassword: "pw", tibberPulseLocalNodeId: 1 },
			{ puName: "B", tibberBridgeUrl: "10.0.0.2", tibberBridgePassword: "pw", tibberPulseLocalNodeId: 2 },
		],
	});
	return new TibberLocal(adapter) as unknown as LocalInternals;
}

describe("TibberLocal – meter mode per Pulse", () => {
	it("keeps a separate meter mode for every Pulse", () => {
		const local = makeLocal();
		local.fetchPulseInfo(0, { meter_mode: 3 });
		local.fetchPulseInfo(1, { meter_mode: 1 });
		assert.strictEqual(local.meterModes.get(0), 3);
		assert.strictEqual(local.meterModes.get(1), 1);
	});
});

describe("TibberLocal – poll overlap guard", () => {
	it("skips a poll while the previous one of the same job is still running", () => {
		const local = makeLocal();
		assert.strictEqual(local.tryStartPoll("0.data"), true);
		assert.strictEqual(local.tryStartPoll("0.data"), false);
		assert.strictEqual(local.tryStartPoll("0.metrics"), true, "other jobs are independent");
		assert.strictEqual(local.tryStartPoll("1.data"), true, "other Pulses are independent");
		local.pollsInFlight.delete("0.data");
		assert.strictEqual(local.tryStartPoll("0.data"), true);
	});
});

describe("TibberLocal – Bridge request timeout", () => {
	it("sets a timeout on every Bridge request", async () => {
		const local = makeLocal();
		const seen: Array<number | undefined> = [];
		const original = axios.request;
		(axios as unknown as { request: (cfg: { timeout?: number }) => Promise<unknown> }).request = cfg => {
			seen.push(cfg.timeout);
			return Promise.resolve({ data: "OK", status: 200 });
		};
		try {
			await local.axiosWithBridgeFallback(0, "data", { method: "GET" });
		} finally {
			(axios as unknown as { request: typeof original }).request = original;
		}
		assert.deepStrictEqual(seen, [BRIDGE_REQUEST_TIMEOUT_MS]);
	});
});

describe("TibberDataAPI – refresh token storage", () => {
	type TokenApi = { saveRefreshToken(token: string): Promise<void>; loadRefreshToken(): Promise<string | null> };
	const STATE = "info.tibberDataApiRefreshToken";

	function makeApi(): { api: TokenApi; store: ReturnType<typeof createMockAdapter>["store"] } {
		const { adapter, store } = createMockAdapter();
		// simple reversible stand-in for the system-secret encryption of js-controller
		const a = adapter as unknown as { encrypt: (v: string) => string; decrypt: (v: string) => string };
		a.encrypt = v => Buffer.from(v).toString("base64");
		a.decrypt = v => Buffer.from(v, "base64").toString();
		return { api: new TibberDataAPI(adapter) as unknown as TokenApi, store };
	}

	it("stores the refresh token encrypted, never in plain text", async () => {
		const { api, store } = makeApi();
		await api.saveRefreshToken("secret-refresh-token");
		const stored = store.states[STATE] as string;
		assert.ok(stored.startsWith(ENCRYPTED_TOKEN_PREFIX));
		assert.ok(!stored.includes("secret-refresh-token"));
		assert.strictEqual(await api.loadRefreshToken(), "secret-refresh-token");
	});

	it("still reads a legacy plain-text token of older versions", async () => {
		const { api, store } = makeApi();
		store.states[STATE] = "legacy-token";
		assert.strictEqual(await api.loadRefreshToken(), "legacy-token");
	});

	it("returns null when no token is stored", async () => {
		const { api, store } = makeApi();
		store.states[STATE] = "";
		assert.strictEqual(await api.loadRefreshToken(), null);
	});
});
