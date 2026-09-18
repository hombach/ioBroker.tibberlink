import assert from "node:assert";
import { enCalcType } from "./projectUtils.ts";
import { createMockAdapter, drainMicrotasks, injectState, TEST_PRICES } from "./testHelpers.test.ts";
import { checkQuarterMatch, TibberCalculator } from "./tibberCalculator.ts";

/** Order-independent array equality (replacement for chai's `to.have.members`). */
function sameMembers<T>(actual: T[], expected: T[], msg?: string): void {
	const cmp = (a: T, b: T): number => (a > b ? 1 : a < b ? -1 : 0);
	assert.deepStrictEqual([...actual].sort(cmp), [...expected].sort(cmp), msg);
}

// ── helpers ────────────────────────────────────────────────────────────────

const HOME = "test-home-1";

function makeChannelConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		chType: enCalcType.BestCost,
		chActive: true,
		chHomeID: HOME,
		chName: "Test",
		chValueOn: "true",
		chValueOff: "false",
		chValueOn2: "true",
		chValueOff2: "false",
		chTargetState: "",
		chTargetState2: "",
		chChannelID: "0",
		chTriggerPrice: 0.2,
		chAmountHours: 2,
		chPercentage: 50,
		chEfficiencyLoss: 0,
		chGraphEnabled: false,
		chStartTime: new Date(0),
		chStopTime: new Date(Date.now() + 86_400_000),
		chRepeatDays: 0,
		...overrides,
	};
}

function injectPrices(store: ReturnType<typeof createMockAdapter>["store"], home: string, today = TEST_PRICES, tomorrow: unknown[] = []): void {
	injectState(store, `Homes.${home}.PricesToday.json`, JSON.stringify(today));
	injectState(store, `Homes.${home}.PricesTomorrow.json`, JSON.stringify(tomorrow));
	injectState(store, `Homes.${home}.PricesYesterday.json`, JSON.stringify([]));
}

// ── BestCost OutputJSON ────────────────────────────────────────────────────

describe("TibberCalculator – BestCost OutputJSON", () => {
	it("marks slots below trigger price as output:true", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chTriggerPrice: 0.2 })],
		});
		injectPrices(store, HOME);
		injectState(store, `Homes.${HOME}.CurrentPrice.total`, 0.1);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestCost(ch: number): Promise<void> }).executeCalculatorBestCost(0);
		await drainMicrotasks();

		const raw = store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string;
		const json: Array<{ startsAt: string; output: boolean }> = JSON.parse(raw);

		const belowTrigger = TEST_PRICES.filter(p => (p.total ?? 0) < 0.2).map(p => p.startsAt);
		const trueSlots = json.filter(e => e.output).map(e => e.startsAt);

		sameMembers(trueSlots, belowTrigger);
	});

	it("sets OutputJSON to [] when channel is inactive", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chActive: false })],
		});
		injectPrices(store, HOME);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestCost(ch: number): Promise<void> }).executeCalculatorBestCost(0);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`], "[]");
	});
});

// ── BestSingleHours OutputJSON ─────────────────────────────────────────────

describe("TibberCalculator – BestSingleHours OutputJSON", () => {
	it("marks the N cheapest individual slots as output:true", async () => {
		// chAmountHours=2 → cheapest 2 slots (0.10, 0.12) get output:true
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestSingleHours, chAmountHours: 2 })],
		});
		injectPrices(store, HOME);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestSingleHours(ch: number): Promise<void> }).executeCalculatorBestSingleHours(0);
		await drainMicrotasks();

		const raw = store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string;
		const json: Array<{ startsAt: string; total: number; output: boolean }> = JSON.parse(raw);

		const trueSlots = json.filter(e => e.output).map(e => e.total);
		// The 2 cheapest are 0.10 and 0.12
		sameMembers(trueSlots, [0.1, 0.12]);
	});
});

// ── BestSingleHours plateau extension (#945) ───────────────────────────────

describe("TibberCalculator – BestSingleHours plateau extension (#945)", () => {
	// 4 slots share the cheapest price (0.00 = a zero-cost plateau), then rising prices.
	const PLATEAU_PRICES = [
		{ startsAt: "2023-01-01T00:00:00.000Z", total: 0.0 },
		{ startsAt: "2023-01-01T00:15:00.000Z", total: 0.0 },
		{ startsAt: "2023-01-01T00:30:00.000Z", total: 0.0 },
		{ startsAt: "2023-01-01T00:45:00.000Z", total: 0.0 },
		{ startsAt: "2023-01-01T01:00:00.000Z", total: 0.2 },
		{ startsAt: "2023-01-01T01:15:00.000Z", total: 0.3 },
	];

	async function runBSH(
		store: ReturnType<typeof createMockAdapter>["store"],
		adapter: ReturnType<typeof createMockAdapter>["adapter"],
	): Promise<Array<{ total: number; output: boolean }>> {
		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestSingleHours(ch: number): Promise<void> }).executeCalculatorBestSingleHours(0);
		await drainMicrotasks();
		return JSON.parse(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string);
	}

	it("cuts off at chAmountHours when the flag is off (default behaviour unchanged)", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestSingleHours, chAmountHours: 2, chExtendPlateau: false })],
		});
		injectPrices(store, HOME, PLATEAU_PRICES);

		const json = await runBSH(store, adapter);
		// only 2 of the 4 equally-cheap slots are marked ON
		assert.strictEqual(json.filter(e => e.output).length, 2);
	});

	it("extends over the whole plateau when the flag is on", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestSingleHours, chAmountHours: 2, chExtendPlateau: true })],
		});
		injectPrices(store, HOME, PLATEAU_PRICES);

		const json = await runBSH(store, adapter);
		const on = json.filter(e => e.output);
		// all 4 slots tied at the boundary price (0.00) are marked ON, not just 2
		assert.strictEqual(on.length, 4);
		assert.ok(
			on.every(e => e.total === 0),
			"all switched-on slots share the boundary price",
		);
	});

	it("does not over-extend when the boundary price is unique", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestSingleHours, chAmountHours: 2, chExtendPlateau: true })],
		});
		injectPrices(store, HOME); // TEST_PRICES – all totals distinct, so no tie at the boundary

		const json = await runBSH(store, adapter);
		assert.strictEqual(json.filter(e => e.output).length, 2);
	});
});

// ── BestHoursBlock OutputJSON ──────────────────────────────────────────────

describe("TibberCalculator – BestHoursBlock OutputJSON", () => {
	it("marks the cheapest contiguous block as output:true", async () => {
		// Prices in time order: 0.30,0.10,0.25,0.12,0.20,0.15,0.28,0.18
		// Block sums for n=3: min at i=1 (0.10+0.25+0.12=0.47) → slots 1,2,3 get output:true
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestHoursBlock, chAmountHours: 3 })],
		});
		injectPrices(store, HOME);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestHoursBlock(ch: number): Promise<void> }).executeCalculatorBestHoursBlock(0);
		await drainMicrotasks();

		const raw = store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string;
		const json: Array<{ startsAt: string; total: number; output: boolean }> = JSON.parse(raw);

		const trueSlots = json.filter(e => e.output).map(e => e.total);
		// Block i=1: slots with total 0.10, 0.25, 0.12
		sameMembers(trueSlots, [0.1, 0.25, 0.12]);
	});
});

// ── BestPercentage OutputJSON ──────────────────────────────────────────────

describe("TibberCalculator – BestPercentage OutputJSON", () => {
	it("marks slots within percentage% of cheapest as output:true", async () => {
		// cheapest=0.10, 50% → allow ≤ 0.15: slots 0.10, 0.12, 0.15
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.BestPercentage, chPercentage: 50 })],
		});
		injectPrices(store, HOME);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestPercentage(ch: number): Promise<void> }).executeCalculatorBestPercentage(0);
		await drainMicrotasks();

		const raw = store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string;
		const json: Array<{ total: number; output: boolean }> = JSON.parse(raw);

		const trueTotals = json.filter(e => e.output).map(e => e.total);
		sameMembers(trueTotals, [0.1, 0.12, 0.15]);
	});
});

// ── SmartBatteryBuffer EfficiencyLoss (issue #918 regression) ──────────────

// Real 2-day Tibber price series (192 quarter-hour slots) supplied for #918.
// Each entry is [epochMillis, total €/kWh]; only startsAt + total matter for SBB.
// prettier-ignore
const SBB_DEMO_PRICES: Array<[number, number]> = [
	[1783548000000,1.1322],[1783548900000,1.1354],[1783549800000,1.1267],[1783550700000,1.093],[1783551600000,1.1271],[1783552500000,1.0925],[1783553400000,1.0914],[1783554300000,1.0871],[1783555200000,1.0764],[1783556100000,1.0564],[1783557000000,1.0755],[1783557900000,1.0609],[1783558800000,1.0562],[1783559700000,1.0525],[1783560600000,1.0524],[1783561500000,1.0713],[1783562400000,1.0407],[1783563300000,1.0544],[1783564200000,1.0814],[1783565100000,1.0961],[1783566000000,1.0792],[1783566900000,1.1134],[1783567800000,1.137],[1783568700000,1.1491],[1783569600000,1.1294],[1783570500000,1.1552],[1783571400000,1.1776],[1783572300000,1.2348],[1783573200000,1.1501],[1783574100000,1.1582],[1783575000000,1.1901],[1783575900000,1.2222],[1783576800000,1.1788],[1783577700000,1.2121],[1783578600000,1.2262],[1783579500000,1.2454],[1783580400000,1.1856],[1783581300000,1.1566],[1783582200000,1.0947],[1783583100000,1.0607],[1783584000000,1.0764],[1783584900000,1.0241],[1783585800000,0.9739],[1783586700000,0.8733],[1783587600000,0.9976],[1783588500000,0.9226],[1783589400000,0.8852],[1783590300000,0.8468],[1783591200000,0.8877],[1783592100000,0.7595],[1783593000000,0.7054],[1783593900000,0.6579],[1783594800000,0.7097],[1783595700000,0.6463],[1783596600000,0.5601],[1783597500000,0.4606],[1783598400000,0.524],[1783599300000,0.5349],[1783600200000,0.5618],[1783601100000,0.6034],[1783602000000,0.4973],[1783602900000,0.6008],[1783603800000,0.7143],[1783604700000,0.841],[1783605600000,0.6982],[1783606500000,0.8164],[1783607400000,0.9106],[1783608300000,1.0233],[1783609200000,0.8596],[1783610100000,1.0394],[1783611000000,1.1276],[1783611900000,1.226],[1783612800000,1.1573],[1783613700000,1.2112],[1783614600000,1.2231],[1783615500000,1.2328],[1783616400000,1.2981],[1783617300000,1.3506],[1783618200000,1.4295],[1783619100000,1.5853],[1783620000000,1.5849],[1783620900000,1.6286],[1783621800000,1.7007],[1783622700000,1.7528],[1783623600000,1.8012],[1783624500000,1.7511],[1783625400000,1.6397],[1783626300000,1.52],[1783627200000,1.7188],[1783628100000,1.5616],[1783629000000,1.4356],[1783629900000,1.3106],[1783630800000,1.4602],[1783631700000,1.3714],[1783632600000,1.2896],[1783633500000,1.2515],[1783634400000,1.4204],[1783635300000,1.3023],[1783636200000,1.2415],[1783637100000,1.2264],[1783638000000,1.2596],[1783638900000,1.2569],[1783639800000,1.2555],[1783640700000,1.2412],[1783641600000,1.2482],[1783642500000,1.2392],[1783643400000,1.239],[1783644300000,1.2403],[1783645200000,1.2104],[1783646100000,1.2213],[1783647000000,1.2357],[1783647900000,1.268],[1783648800000,1.204],[1783649700000,1.2206],[1783650600000,1.2594],[1783651500000,1.301],[1783652400000,1.1923],[1783653300000,1.2291],[1783654200000,1.3147],[1783655100000,1.3508],[1783656000000,1.2062],[1783656900000,1.2689],[1783657800000,1.3255],[1783658700000,1.3785],[1783659600000,1.2657],[1783660500000,1.3165],[1783661400000,1.3309],[1783662300000,1.3237],[1783663200000,1.2977],[1783664100000,1.2895],[1783665000000,1.271],[1783665900000,1.2606],[1783666800000,1.2839],[1783667700000,1.2496],[1783668600000,1.1621],[1783669500000,1.0719],[1783670400000,1.1726],[1783671300000,1.1333],[1783672200000,1.017],[1783673100000,0.9236],[1783674000000,1.028],[1783674900000,0.9324],[1783675800000,0.8718],[1783676700000,0.8227],[1783677600000,0.8977],[1783678500000,0.8326],[1783679400000,0.7938],[1783680300000,0.6695],[1783681200000,0.7085],[1783682100000,0.6516],[1783683000000,0.6166],[1783683900000,0.529],[1783684800000,0.6129],[1783685700000,0.6132],[1783686600000,0.6601],[1783687500000,0.69],[1783688400000,0.6364],[1783689300000,0.7543],[1783690200000,0.8373],[1783691100000,0.9622],[1783692000000,0.794],[1783692900000,0.9372],[1783693800000,1.0507],[1783694700000,1.1567],[1783695600000,1.1379],[1783696500000,1.1678],[1783697400000,1.2213],[1783698300000,1.2533],[1783699200000,1.2364],[1783700100000,1.2602],[1783701000000,1.2969],[1783701900000,1.3374],[1783702800000,1.352],[1783703700000,1.3892],[1783704600000,1.3968],[1783705500000,1.5017],[1783706400000,1.5042],[1783707300000,1.5328],[1783708200000,1.5742],[1783709100000,1.5639],[1783710000000,1.5657],[1783710900000,1.5108],[1783711800000,1.3919],[1783712700000,1.3192],[1783713600000,1.3323],[1783714500000,1.3093],[1783715400000,1.2673],[1783716300000,1.2526],[1783717200000,1.3053],[1783718100000,1.2855],[1783719000000,1.2586],[1783719900000,1.2397],[1783720800000,1.2397],
];

/** Builds an IPrice-shaped array (startsAt + total) from the demo series. */
function demoPrices(): Array<{ startsAt: string; total: number }> {
	return SBB_DEMO_PRICES.map(([ts, total]) => ({ startsAt: new Date(ts).toISOString(), total }));
}

/**
 * Runs the SBB calculator for one efficiencyLoss and returns the three-way slot classification
 * (charge / idle / feed-in) as sorted price arrays.
 *
 * @param efficiencyLoss - Battery round-trip efficiency loss (0..1).
 * @param prices - Price slots to feed in; defaults to the real 2-day demo series.
 * @param amountHours - AmountHours state value (maxCheapCount = amountHours * 4).
 */
async function runSbb(
	efficiencyLoss: number,
	prices: Parameters<typeof injectPrices>[2] = demoPrices(),
	amountHours = 5,
): Promise<{ cheapTotals: number[]; normalTotals: number[]; expensiveTotals: number[] }> {
	const { adapter, store } = createMockAdapter({
		UseCalculator: true,
		CalculatorList: [makeChannelConfig({ chType: enCalcType.SmartBatteryBuffer, chAmountHours: amountHours })],
	});
	injectPrices(store, HOME, prices);
	injectState(store, `Homes.${HOME}.Calculations.0.AmountHours`, amountHours);
	injectState(store, `Homes.${HOME}.Calculations.0.EfficiencyLoss`, efficiencyLoss);

	const calc = new TibberCalculator(adapter);
	await (calc as unknown as { executeCalculatorSmartBatteryBuffer(ch: number): Promise<void> }).executeCalculatorSmartBatteryBuffer(0);
	await drainMicrotasks();

	// OutputJSON and OutputJSON2 both contain every slot; a slot is "cheap" when flagged
	// in OutputJSON (charge), "expensive" when flagged in OutputJSON2 (feed-in), and
	// "normal" (idle) when flagged in neither.
	const cheap: Array<{ startsAt: string; total: number; output: boolean }> = JSON.parse(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string);
	const expensive: Array<{ startsAt: string; total: number; output: boolean }> = JSON.parse(store.states[`Homes.${HOME}.Calculations.0.OutputJSON2`] as string);
	const expensiveKeys = new Set(expensive.filter(e => e.output).map(e => e.startsAt));
	const cheapKeys = new Set(cheap.filter(e => e.output).map(e => e.startsAt));
	const asc = (a: number, b: number): number => a - b;
	return {
		cheapTotals: cheap.filter(e => e.output).map(e => e.total).sort(asc),
		expensiveTotals: expensive.filter(e => e.output).map(e => e.total).sort(asc),
		// idle slots: neither charge nor feed-in
		normalTotals: cheap.filter(e => !cheapKeys.has(e.startsAt) && !expensiveKeys.has(e.startsAt)).map(e => e.total).sort(asc),
	};
}

describe("TibberCalculator – SmartBatteryBuffer EfficiencyLoss with real price data (#918)", () => {
	it("creates a normal (idle) band between cheap and expensive when efficiencyLoss is applied", async () => {
		// This is the core #918 symptom: the operator-precedence bug collapsed the normal
		// band to zero, so every slot was either charge or feed-in. The efficiency loss must
		// carve out an idle band where the price spread does not justify the round-trip loss.
		const low = await runSbb(0.25);
		const high = await runSbb(0.4);

		// AmountHours=5 → maxCheapCount=20; the cheap cap is reached in both runs.
		assert.strictEqual(low.cheapTotals.length, 20);
		assert.strictEqual(high.cheapTotals.length, 20);

		// The three categories must all be populated (bug → normal was empty).
		assert.strictEqual(low.normalTotals.length, 14, "eff 0.25 normal band");
		assert.strictEqual(low.expensiveTotals.length, 159, "eff 0.25 expensive band");
		assert.strictEqual(high.normalTotals.length, 25, "eff 0.4 normal band");
		assert.strictEqual(high.expensiveTotals.length, 148, "eff 0.4 expensive band");

		// A higher efficiency loss widens the idle band and shrinks the feed-in band.
		assert.ok(high.normalTotals.length > low.normalTotals.length);
		assert.ok(high.expensiveTotals.length < low.expensiveTotals.length);

		// Concrete boundary example: 0.8733 (visible price dip) is "feed-in" at 0.25 but
		// falls into the idle band at 0.4.
		assert.ok(low.expensiveTotals.includes(0.8733));
		assert.ok(high.normalTotals.includes(0.8733));
	});

	it("never collapses the normal band to zero (guards the #918 regression)", async () => {
		// The operator-precedence bug left the normal band empty for every efficiencyLoss.
		assert.ok((await runSbb(0.25)).normalTotals.length > 0, "eff 0.25");
		assert.ok((await runSbb(0.4)).normalTotals.length > 0, "eff 0.4");
	});
});

describe("TibberCalculator – SmartBatteryBuffer EfficiencyLoss exact slot split", () => {
	// TEST_PRICES totals sorted: 0.10 0.12 0.15 0.18 0.20 0.25 0.28 0.30.
	// AmountHours=8 → maxCheapCount=32 → the cheap cap never binds, so the whole
	// three-way split (charge / idle / feed-in) is governed purely by efficiencyLoss.
	// This is the branch that exercises the cheap-side delta gate (the real-data test
	// with AmountHours=5 hits the cap and only exercises the feed-in gate).
	it("splits the slots exactly as expected for efficiencyLoss 0.25", async () => {
		const r = await runSbb(0.25, TEST_PRICES, 8);
		assert.deepStrictEqual(r.cheapTotals, [0.1, 0.12, 0.15, 0.18, 0.2, 0.25], "charge");
		assert.deepStrictEqual(r.normalTotals, [0.28], "idle");
		assert.deepStrictEqual(r.expensiveTotals, [0.3], "feed-in");
	});

	it("splits the slots exactly as expected for efficiencyLoss 0.4", async () => {
		const r = await runSbb(0.4, TEST_PRICES, 8);
		assert.deepStrictEqual(r.cheapTotals, [0.1, 0.12, 0.15, 0.18, 0.2], "charge");
		assert.deepStrictEqual(r.normalTotals, [0.25], "idle");
		assert.deepStrictEqual(r.expensiveTotals, [0.28, 0.3], "feed-in");
	});

	it("shifts slots from charge to idle/feed-in as efficiencyLoss grows", async () => {
		const low = await runSbb(0.25, TEST_PRICES, 8);
		const high = await runSbb(0.4, TEST_PRICES, 8);

		// Both runs keep a populated idle band (bug → idle band was empty).
		assert.ok(low.normalTotals.length > 0);
		assert.ok(high.normalTotals.length > 0);

		// Higher loss → fewer charge slots, more feed-in slots (0.25 moves out of charge).
		assert.ok(high.cheapTotals.length < low.cheapTotals.length);
		assert.ok(high.expensiveTotals.length > low.expensiveTotals.length);
	});
});

// ── SmartBatteryBuffer EfficiencyLoss range validation (issue #934) ─────────

describe("TibberCalculator – EfficiencyLoss range validation (#934)", () => {
	// Directly exercises the validation helper with a warn-spy.
	async function validate(efficiencyLoss: unknown): Promise<{ result: number; warnings: string[] }> {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chType: enCalcType.SmartBatteryBuffer })],
		});
		injectState(store, `Homes.${HOME}.Calculations.0.EfficiencyLoss`, efficiencyLoss);
		const warnings: string[] = [];
		(adapter.log as unknown as { warn: (m: string) => void }).warn = (m: string): void => {
			warnings.push(m);
		};
		const calc = new TibberCalculator(adapter);
		const result = await (calc as unknown as { getValidatedEfficiencyLoss(h: string, c: number): Promise<number> }).getValidatedEfficiencyLoss(HOME, 0);
		return { result, warnings };
	}

	it("passes valid values in 0…1 through unchanged and silently", async () => {
		for (const v of [0, 0.25, 0.4, 1]) {
			const { result, warnings } = await validate(v);
			assert.strictEqual(result, v, `value ${v}`);
			assert.strictEqual(warnings.length, 0, `no warning for ${v}`);
		}
	});

	it("clamps values > 1 to 1 and warns (the 25-instead-of-0.25 typo)", async () => {
		const { result, warnings } = await validate(25);
		assert.strictEqual(result, 1);
		assert.strictEqual(warnings.length, 1);
		assert.ok(warnings[0].includes("outside the valid range"), "warning mentions the range");
	});

	it("clamps values < 0 to 0 and warns", async () => {
		const { result, warnings } = await validate(-5);
		assert.strictEqual(result, 0);
		assert.strictEqual(warnings.length, 1);
	});

	it("never rescales — 25 is clamped to 1, not converted to 0.25", async () => {
		const { result } = await validate(25);
		assert.notStrictEqual(result, 0.25);
	});

	// Behavioural proof: a typo like 25 must not blow up minDelta. Clamped to 1, the SBB
	// classification equals the eff=1 run; a negative value equals the eff=0 run.
	it("SBB output for an out-of-range value equals the clamped-boundary run", async () => {
		assert.deepStrictEqual(await runSbb(25, TEST_PRICES, 8), await runSbb(1, TEST_PRICES, 8), "25 ≡ 1");
		assert.deepStrictEqual(await runSbb(-5, TEST_PRICES, 8), await runSbb(0, TEST_PRICES, 8), "-5 ≡ 0");
	});
});

// ── startCalculatorTasks: UseCalculator guard ──────────────────────────────

describe("TibberCalculator – startCalculatorTasks", () => {
	it("returns immediately when UseCalculator is false", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: false,
			CalculatorList: [makeChannelConfig()],
		});
		injectPrices(store, HOME);
		injectState(store, `Homes.${HOME}.CurrentPrice.total`, 0.1);

		const calc = new TibberCalculator(adapter);
		await calc.startCalculatorTasks();

		// No OutputJSON state should have been written
		assert.strictEqual(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`], undefined);
	});

	it("skips inactive channels and does not write OutputJSON", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [makeChannelConfig({ chActive: false, chType: enCalcType.BestSingleHours, chAmountHours: 2 })],
		});
		injectPrices(store, HOME);

		const calc = new TibberCalculator(adapter);
		await calc.startCalculatorTasks();
		await drainMicrotasks();

		const raw = store.states[`Homes.${HOME}.Calculations.0.OutputJSON`] as string | undefined;
		// Inactive channel writes [] to OutputJSON
		if (raw !== undefined) {
			assert.strictEqual(raw, "[]");
		}
	});
});

// ── checkQuarterMatch: current-slot detection (issue #631) ─────────────────

describe("TibberCalculator – checkQuarterMatch (#631 wrong-day regression)", () => {
	// #631: the output variable switched at e.g. 23:00 on the CURRENT day although the
	// selected cheapest slot was 23:00 on the NEXT day. Root cause was the old checkHourMatch,
	// which compared only the hour-of-day (getHours()) and ignored the date. checkQuarterMatch
	// must compare the full timestamp, so a same-hour slot on another day must NOT match now.
	const iso = (d: Date): string => d.toISOString();

	it("matches a slot whose 15-minute window contains now", () => {
		const now = new Date();
		assert.strictEqual(checkQuarterMatch({ startsAt: iso(now) } as never), true);
	});

	it("does NOT match a slot at the same hour-of-day on the next day", () => {
		const now = new Date();
		const sameHourTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
		// Old buggy checkHourMatch (getHours() only) would have returned true here.
		assert.strictEqual(checkQuarterMatch({ startsAt: iso(sameHourTomorrow) } as never), false);
	});

	it("does NOT match a slot two hours later on the same day", () => {
		const now = new Date();
		const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
		assert.strictEqual(checkQuarterMatch({ startsAt: iso(twoHoursLater) } as never), false);
	});
});
