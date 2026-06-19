import { expect } from "chai";
import { type IHomeInfo } from "./projectUtils.ts";
import { createMockAdapter, drainMicrotasks, injectState, TEST_PRICES, type MockStore } from "./testHelpers.test.ts";
import { TibberCharts } from "./tibberCharts.ts";

const HOME = "test-home-1";

const HOME_INFO: IHomeInfo = {
	ID: HOME,
	NameInApp: "Test Home",
	RealTime: false,
	FeedActive: false,
	PriceDataPollActive: true,
};

function makeCharts(extraConfig: Record<string, unknown> = {}): { charts: TibberCharts; store: MockStore } {
	const { adapter, store } = createMockAdapter({
		FlexGraphJSON: "%%seriesData%%",
		// FlexGraphPastCutOff and FlexGraphFutureCutOff intentionally omitted:
		// the filter only applies when both are numbers; omitting them prevents
		// TEST_PRICES (from 2023) from being filtered out as "too old".
		UseCalculator: false,
		CalculatorList: [],
		...extraConfig,
	});
	injectState(store, `Homes.${HOME}.PricesToday.json`, JSON.stringify(TEST_PRICES));
	injectState(store, `Homes.${HOME}.PricesTomorrow.json`, JSON.stringify([]));
	return { charts: new TibberCharts(adapter), store };
}

// ── seriesData placeholder ─────────────────────────────────────────────────

describe("TibberCharts – generateFlexChartJSON", () => {
	it("replaces %%seriesData%% with time-series price data", async () => {
		const { charts, store } = makeCharts();

		await charts.generateFlexChartJSONAllHomes([HOME_INFO]);
		await drainMicrotasks();

		const result = store.states[`Homes.${HOME}.PricesTotal.jsonFlexCharts`] as string;
		expect(result).to.be.a("string");
		// Must be valid JSON array (the series data)
		const parsed: unknown[][] = JSON.parse(result);
		expect(parsed).to.be.an("array");
		// 8 slots + 1 duplicated final slot = 9 entries
		expect(parsed).to.have.lengthOf(9);
		// Each entry is [timestamp_ms, total_price]
		expect(parsed[0]).to.have.lengthOf(2);
	});

	it("works with an empty tomorrow array", async () => {
		const { charts, store } = makeCharts();

		await charts.generateFlexChartJSONAllHomes([HOME_INFO]);
		await drainMicrotasks();

		const result = store.states[`Homes.${HOME}.PricesTotal.jsonFlexCharts`] as string;
		expect(result).to.be.a("string");
		expect(result.length).to.be.greaterThan(0);
	});

	it("replaces %%CalcChannelsData%% with empty marker when no active channels", async () => {
		const { charts, store } = makeCharts({
			FlexGraphJSON: "%%seriesData%%\n%%CalcChannelsData%%",
			UseCalculator: true,
			CalculatorList: [],
		});

		await charts.generateFlexChartJSONAllHomes([HOME_INFO]);
		await drainMicrotasks();

		const result = store.states[`Homes.${HOME}.PricesTotal.jsonFlexCharts`] as string;
		expect(result).to.include(`[{xAxis: ""}, {xAxis: ""}]`);
	});

	it("skips homes with PriceDataPollActive=false", async () => {
		const { charts, store } = makeCharts();
		const inactiveHome: IHomeInfo = { ...HOME_INFO, PriceDataPollActive: false };

		await charts.generateFlexChartJSONAllHomes([inactiveHome]);
		await drainMicrotasks();

		expect(store.states[`Homes.${HOME}.PricesTotal.jsonFlexCharts`]).to.be.undefined;
	});
});
