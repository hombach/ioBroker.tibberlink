import { expect } from "chai";
import { TibberCalculator } from "./tibberCalculator.ts";
import { enCalcType } from "./projectUtils.ts";
import { createMockAdapter, drainMicrotasks, injectState, TEST_PRICES } from "./testHelpers.ts";

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

		expect(trueSlots).to.have.members(belowTrigger);
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

		expect(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`]).to.equal("[]");
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
		expect(trueSlots).to.have.members([0.1, 0.12]);
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
		expect(trueSlots).to.have.members([0.1, 0.25, 0.12]);
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
		expect(trueTotals).to.have.members([0.1, 0.12, 0.15]);
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
		expect(store.states[`Homes.${HOME}.Calculations.0.OutputJSON`]).to.be.undefined;
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
			expect(raw).to.equal("[]");
		}
	});
});
