import assert from "node:assert";
import type { IConfig, ILiveMeasurement } from "tibber-api";
import { createMockAdapter, drainMicrotasks } from "./testHelpers.test.ts";
import { TibberPulse } from "./tibberPulse.ts";

const HOME = "home-1";

function makePulse(): { pulse: TibberPulse; store: ReturnType<typeof createMockAdapter>["store"] } {
	const { adapter, store } = createMockAdapter();
	const fakeConfig = {
		apiEndpoint: { apiKey: "test-key", queryUrl: "https://api.tibber.com/v1-beta/gql", userAgent: "test" },
		homeId: HOME,
	} as unknown as IConfig;
	const pulse = new TibberPulse(fakeConfig, adapter);
	return { pulse, store };
}

type Fetcher = { fetchLiveMeasurement(dest: string, lm: ILiveMeasurement | null): void };

// Regression guard for the Tibber feed occasionally delivering a null frame (#910).
// The old code read `liveMeasurement.powerProduction` unconditionally, which crashed the whole
// adapter with an unhandled `TypeError: Cannot read properties of null (reading 'powerProduction')`
// (Sentry TIBBERLINK6-3, ~23k events on pre-7.1.2 installs). Fixed by an early null guard in 7.1.2.
describe("TibberPulse – fetchLiveMeasurement null guard (#910)", () => {
	it("does not throw and writes no states when the feed delivers null", async () => {
		const { pulse, store } = makePulse();

		assert.doesNotThrow(() => (pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", null));
		await drainMicrotasks();

		// early return → nothing written
		assert.strictEqual(store.states[`Homes.${HOME}.LiveMeasurement.power`], undefined);
	});

	it("still processes a valid measurement (guard does not break normal flow)", async () => {
		const { pulse, store } = makePulse();

		(pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", { power: 100 } as ILiveMeasurement);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.LiveMeasurement.power`], 100);
	});

	it("tolerates a null powerProduction property on an otherwise valid frame", async () => {
		const { pulse, store } = makePulse();

		// Tibber sometimes sends powerProduction: null even on a non-null frame → `??= 0` handles it.
		assert.doesNotThrow(() =>
			(pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", { power: 0, powerProduction: null } as unknown as ILiveMeasurement),
		);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.LiveMeasurement.power`], 0);
	});
});

// tibber-api 6: on an invalid token the feed emits an "Unauthenticated" error and stops reconnecting
// until connect() is called again. The adapter's own reconnect loop must not keep calling connect()
// forever in that case.
describe("TibberPulse – invalid token handling (tibber-api 6)", () => {
	const UNAUTH_MSG = "Unauthenticated! Invalid token. Please provide a valid token and try again.";

	function makeFeedPulse(): {
		pulse: TibberPulse;
		store: ReturnType<typeof createMockAdapter>["store"];
		errors: string[];
		connectCalls: () => number;
	} {
		const { adapter, store } = createMockAdapter({ HomesList: [{ feedActive: true, homeID: HOME }] });
		const errors: string[] = [];
		(adapter.log as unknown as { error: (m: string) => void }).error = (m: string) => errors.push(m);
		(adapter as unknown as { delay: (ms: number) => Promise<void> }).delay = () => Promise.resolve();
		const fakeConfig = {
			apiEndpoint: { apiKey: "test-key", queryUrl: "https://api.tibber.com/v1-beta/gql", userAgent: "test" },
			homeId: HOME,
		} as unknown as IConfig;
		const pulse = new TibberPulse(fakeConfig, adapter);
		let calls = 0;
		// never open a real websocket in unit tests
		pulse.tibberFeed.connect = (): Promise<void> => {
			calls++;
			pulse.tibberFeed.emit("error", UNAUTH_MSG);
			return Promise.resolve();
		};
		pulse.tibberFeed.close = (): void => {};
		return { pulse, store, errors, connectCalls: () => calls };
	}

	it("detects unauthenticated errors in all known shapes", () => {
		assert.strictEqual(TibberPulse.isUnauthenticatedError(UNAUTH_MSG), true);
		assert.strictEqual(TibberPulse.isUnauthenticatedError(new Error(UNAUTH_MSG)), true);
		assert.strictEqual(TibberPulse.isUnauthenticatedError([{ message: "x", extensions: { code: "UNAUTHENTICATED" } }]), true);
		assert.strictEqual(TibberPulse.isUnauthenticatedError({ errors: [{ extensions: { code: "UNAUTHENTICATED" } }], httpCode: 200 }), true);
		assert.strictEqual(TibberPulse.isUnauthenticatedError("Connection timeout"), false);
		assert.strictEqual(TibberPulse.isUnauthenticatedError(new Error("socket hang up")), false);
		assert.strictEqual(TibberPulse.isUnauthenticatedError([{ message: "x", extensions: { code: "INTERNAL" } }]), false);
		assert.strictEqual(TibberPulse.isUnauthenticatedError(undefined), false);
	});

	it("logs a single error and stops reconnecting after the token was rejected", async () => {
		const { pulse, store, errors, connectCalls } = makeFeedPulse();

		pulse.tibberFeed.emit("error", UNAUTH_MSG);
		pulse.tibberFeed.emit("error", UNAUTH_MSG);
		pulse.tibberFeed.emit("disconnected", "Disconnected from Tibber feed.");
		await drainMicrotasks();

		assert.strictEqual(pulse.feedUnauthenticated, true);
		assert.strictEqual(errors.length, 1);
		assert.strictEqual(connectCalls(), 0, "no reconnect after unauthenticated");
		assert.strictEqual(store.states["info.connection"], false);

		await pulse.connectPulseStream();
		assert.strictEqual(connectCalls(), 0, "connectPulseStream is a no-op after unauthenticated");
	});

	it("ends a running reconnect loop when the token is rejected during reconnect", async () => {
		const { pulse, errors, connectCalls } = makeFeedPulse();

		// regular disconnect starts the reconnect loop; the first connect attempt is rejected as unauthenticated
		pulse.tibberFeed.emit("disconnected", "Disconnected from Tibber feed.");
		await drainMicrotasks();

		assert.strictEqual(connectCalls(), 1, "loop stops after the first rejected attempt");
		assert.strictEqual(pulse.feedUnauthenticated, true);
		assert.strictEqual(errors.length, 1);
	});

	it("keeps warning (not stopping) on other feed errors", async () => {
		const { pulse } = makeFeedPulse();
		pulse.tibberFeed.emit("error", "Connection timeout");
		pulse.tibberFeed.emit("error", [{ message: "some graphql error" }]);
		await drainMicrotasks();
		assert.strictEqual(pulse.feedUnauthenticated, false);
	});
});

describe("TibberPulse – reactive power states (tibber-api 6)", () => {
	function makeConfiguredPulse(config: Record<string, unknown>): { pulse: TibberPulse; store: ReturnType<typeof createMockAdapter>["store"] } {
		const { adapter, store } = createMockAdapter(config);
		const fakeConfig = {
			apiEndpoint: { apiKey: "test-key", queryUrl: "https://api.tibber.com/v1-beta/gql", userAgent: "test" },
			homeId: HOME,
		} as unknown as IConfig;
		return { pulse: new TibberPulse(fakeConfig, adapter), store };
	}
	const frame = { power: 500, powerProduction: 0, powerReactive: 0.12, powerProductionReactive: 0.03 } as ILiveMeasurement;

	it("writes powerReactive and powerProductionReactive when enabled", async () => {
		const { pulse, store } = makeConfiguredPulse({ FeedConfigPowerReactive: true, FeedConfigPowerProductionReactive: true });
		(pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", { ...frame });
		await drainMicrotasks();
		assert.strictEqual(store.states[`Homes.${HOME}.LiveMeasurement.powerReactive`], 0.12);
		assert.strictEqual(store.states[`Homes.${HOME}.LiveMeasurement.powerProductionReactive`], 0.03);
		const obj = store.objects[`Homes.${HOME}.LiveMeasurement.powerReactive`] as { common: { unit?: string } };
		assert.strictEqual(obj.common.unit, "kvar");
	});

	it("does not create reactive power states when disabled (default)", async () => {
		const { pulse, store } = makeConfiguredPulse({});
		(pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", { ...frame });
		await drainMicrotasks();
		assert.strictEqual(store.objects[`Homes.${HOME}.LiveMeasurement.powerReactive`], undefined);
		assert.strictEqual(store.objects[`Homes.${HOME}.LiveMeasurement.powerProductionReactive`], undefined);
	});

	it("skips a reactive value missing from a frame without throwing", async () => {
		const { pulse, store } = makeConfiguredPulse({ FeedConfigPowerReactive: true });
		(pulse as unknown as Fetcher).fetchLiveMeasurement("LiveMeasurement", { power: 100 } as ILiveMeasurement);
		await drainMicrotasks();
		assert.strictEqual(store.objects[`Homes.${HOME}.LiveMeasurement.powerReactive`], undefined);
	});
});
