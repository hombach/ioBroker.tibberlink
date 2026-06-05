import { expect } from "chai";
import type { IConfig } from "tibber-api";
import { TibberAPICaller } from "./tibberAPICaller.ts";
import { createMockAdapter, drainMicrotasks, TEST_PRICES, type MockStore } from "./testHelpers.ts";

const HOME = "test-home-1";

function makeCaller(): { caller: TibberAPICaller; store: MockStore } {
	const { adapter, store } = createMockAdapter();
	const fakeConfig = {
		apiEndpoint: { apiKey: "test-key", queryUrl: "https://api.tibber.com/v1-beta/gql", userAgent: "test" },
		homeId: HOME,
	} as unknown as IConfig;
	const caller = new TibberAPICaller(fakeConfig, adapter);
	return { caller, store };
}

// ── fetchPriceAverage ──────────────────────────────────────────────────────

describe("TibberAPICaller – fetchPriceAverage", () => {
	it("writes correct average total, energy, and tax", async () => {
		const { caller, store } = makeCaller();

		(caller as unknown as { fetchPriceAverage(h: string, d: string, p: unknown[]): void }).fetchPriceAverage(HOME, "PricesToday.average", TEST_PRICES);
		await drainMicrotasks();

		// Compute expected values the same way the implementation does to avoid floating-point surprises
		const n = TEST_PRICES.length;
		const sumOf = (key: "total" | "energy" | "tax"): number => TEST_PRICES.reduce((s, p) => s + (p[key] ?? 0), 0);
		const expectedTotal = Math.round((1000 * sumOf("total")) / n) / 1000;
		const expectedEnergy = Math.round((1000 * sumOf("energy")) / n) / 1000;
		const expectedTax = Math.round((1000 * sumOf("tax")) / n) / 1000;

		const total = store.states[`Homes.${HOME}.PricesToday.average.total`] as number;
		expect(total).to.equal(expectedTotal);

		const energy = store.states[`Homes.${HOME}.PricesToday.average.energy`] as number;
		expect(energy).to.equal(expectedEnergy);

		const tax = store.states[`Homes.${HOME}.PricesToday.average.tax`] as number;
		expect(tax).to.equal(expectedTax);
	});

	it("does nothing for an empty price array", async () => {
		const { caller, store } = makeCaller();

		(caller as unknown as { fetchPriceAverage(h: string, d: string, p: unknown[]): void }).fetchPriceAverage(HOME, "PricesToday.average", []);
		await drainMicrotasks();

		expect(store.states[`Homes.${HOME}.PricesToday.average.total`]).to.be.undefined;
	});
});

// ── fetchPriceMaximum ──────────────────────────────────────────────────────

describe("TibberAPICaller – fetchPriceMaximum", () => {
	it("writes the entry with the highest total price", async () => {
		const { caller, store } = makeCaller();

		(caller as unknown as { fetchPriceMaximum(h: string, d: string, p: unknown[]): void }).fetchPriceMaximum(HOME, "PricesToday.maximum", TEST_PRICES);
		await drainMicrotasks();

		// slot 0 has total=0.30 (maximum)
		const total = store.states[`Homes.${HOME}.PricesToday.maximum.total`] as number;
		expect(total).to.equal(0.3);

		const startsAt = store.states[`Homes.${HOME}.PricesToday.maximum.startsAt`] as string;
		expect(startsAt).to.equal("2023-01-01T00:00:00.000Z");
	});
});

// ── fetchPriceMinimum ──────────────────────────────────────────────────────

describe("TibberAPICaller – fetchPriceMinimum", () => {
	it("writes the entry with the lowest total price", async () => {
		const { caller, store } = makeCaller();

		(caller as unknown as { fetchPriceMinimum(h: string, d: string, p: unknown[]): void }).fetchPriceMinimum(HOME, "PricesToday.minimum", TEST_PRICES);
		await drainMicrotasks();

		// slot 1 has total=0.10 (minimum)
		const total = store.states[`Homes.${HOME}.PricesToday.minimum.total`] as number;
		expect(total).to.equal(0.1);

		const startsAt = store.states[`Homes.${HOME}.PricesToday.minimum.startsAt`] as string;
		expect(startsAt).to.equal("2023-01-01T00:15:00.000Z");
	});
});
