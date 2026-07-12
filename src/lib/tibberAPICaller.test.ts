import assert from "node:assert";
import type { IConfig } from "tibber-api";
import type { IConsumption } from "tibber-api/lib/src/models/IConsumption.js";
import { EnergyResolution } from "tibber-api/lib/src/models/enums/EnergyResolution.js";
import { createMockAdapter, drainMicrotasks, TEST_PRICES, type MockStore } from "./testHelpers.test.ts";
import { TibberAPICaller } from "./tibberAPICaller.ts";

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
		assert.strictEqual(total, expectedTotal);

		const energy = store.states[`Homes.${HOME}.PricesToday.average.energy`] as number;
		assert.strictEqual(energy, expectedEnergy);

		const tax = store.states[`Homes.${HOME}.PricesToday.average.tax`] as number;
		assert.strictEqual(tax, expectedTax);
	});

	it("does nothing for an empty price array", async () => {
		const { caller, store } = makeCaller();

		(caller as unknown as { fetchPriceAverage(h: string, d: string, p: unknown[]): void }).fetchPriceAverage(HOME, "PricesToday.average", []);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.PricesToday.average.total`], undefined);
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
		assert.strictEqual(total, 0.3);

		const startsAt = store.states[`Homes.${HOME}.PricesToday.maximum.startsAt`] as string;
		assert.strictEqual(startsAt, "2023-01-01T00:00:00.000Z");
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
		assert.strictEqual(total, 0.1);

		const startsAt = store.states[`Homes.${HOME}.PricesToday.minimum.startsAt`] as string;
		assert.strictEqual(startsAt, "2023-01-01T00:15:00.000Z");
	});
});

// ── fixConsumptionEndDates (issue #890) ────────────────────────────────────

type EndDateFixer = { fixConsumptionEndDates(c: IConsumption[], r: EnergyResolution): IConsumption[] };

/** Minimal weekly consumption entry with the Tibber `to === from` quirk from issue #890. */
function weeklyEntry(from: string): IConsumption {
	return {
		from,
		to: from, // Tibber server returns to === from for weekly buckets
		cost: 1,
		unitPrice: 0.2,
		unitPriceVAT: 0.03,
		consumption: 10,
		consumptionUnit: "kWh",
		totalCost: 1.2,
		unitCost: 1,
		currency: "EUR",
	};
}

describe("TibberAPICaller – fixConsumptionEndDates (#890)", () => {
	it("sets each weekly bucket's `to` to the next bucket's `from`", () => {
		const { caller } = makeCaller();
		// Real data shape from the issue: consecutive Mondays, to === from.
		const input = [weeklyEntry("2026-04-20T00:00:00.000+02:00"), weeklyEntry("2026-04-27T00:00:00.000+02:00")];

		const result = (caller as unknown as EndDateFixer).fixConsumptionEndDates(input, EnergyResolution.WEEKLY);

		// bucket 0 ends where bucket 1 starts
		assert.strictEqual(result[0].from, "2026-04-20T00:00:00.000+02:00");
		assert.strictEqual(result[0].to, "2026-04-27T00:00:00.000+02:00");
		// last bucket has no successor → from + 7 days, offset preserved
		assert.strictEqual(result[1].from, "2026-04-27T00:00:00.000+02:00");
		assert.strictEqual(result[1].to, "2026-05-04T00:00:00.000+02:00");
	});

	it("advances the last bucket across a month boundary correctly", () => {
		const { caller } = makeCaller();
		const input = [weeklyEntry("2026-12-28T00:00:00.000+01:00")];

		const result = (caller as unknown as EndDateFixer).fixConsumptionEndDates(input, EnergyResolution.WEEKLY);

		// 2026-12-28 + 7 days = 2027-01-04, offset kept
		assert.strictEqual(result[0].to, "2027-01-04T00:00:00.000+01:00");
	});

	it("leaves correctly-filled entries (to !== from) untouched", () => {
		const { caller } = makeCaller();
		const entry = weeklyEntry("2026-04-20T00:00:00.000+02:00");
		entry.to = "2026-04-27T00:00:00.000+02:00"; // already correct (e.g. daily/hourly case)

		const result = (caller as unknown as EndDateFixer).fixConsumptionEndDates([entry], EnergyResolution.WEEKLY);

		assert.strictEqual(result[0].to, "2026-04-27T00:00:00.000+02:00");
	});
});
