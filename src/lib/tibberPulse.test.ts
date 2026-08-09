import assert from "node:assert";
import type { IConfig } from "tibber-api";
import type { ILiveMeasurement } from "tibber-api/lib/src/models/ILiveMeasurement.js";
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
