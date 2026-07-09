import assert from "node:assert";
import { enCalcType } from "./lib/projectUtils.ts";
import { createMockAdapter, drainMicrotasks, injectState } from "./lib/testHelpers.test.ts";
import { TibberCalculator } from "./lib/tibberCalculator.ts";

const HOME = "lifecycle-home-1";

// ── UseCalculator guard ────────────────────────────────────────────────────

describe("Lifecycle – UseCalculator=false", () => {
	it("startCalculatorTasks returns without touching any states", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: false,
			CalculatorList: [
				{
					chType: enCalcType.BestSingleHours,
					chActive: true,
					chHomeID: HOME,
					chName: "Should not run",
					chValueOn: "true",
					chValueOff: "false",
					chAmountHours: 2,
					chTargetState: "",
					chChannelID: "0",
					chStartTime: new Date(0),
					chStopTime: new Date(Date.now() + 86_400_000),
					chRepeatDays: 0,
				},
			],
		});
		injectState(store, `Homes.${HOME}.PricesToday.json`, JSON.stringify([]));
		injectState(store, `Homes.${HOME}.PricesTomorrow.json`, JSON.stringify([]));

		const calc = new TibberCalculator(adapter);
		await calc.startCalculatorTasks();

		assert.strictEqual(Object.keys(store.states).length, 2); // only the 2 injected states
	});
});

// ── setupCalculatorStates ──────────────────────────────────────────────────

describe("Lifecycle – setupCalculatorStates", () => {
	it("creates Output and OutputJSON states for a BestCost channel", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.BestCost,
					chActive: true,
					chHomeID: HOME,
					chName: "BestCost channel",
					chValueOn: "true",
					chValueOff: "false",
					chTriggerPrice: 0.2,
					chTargetState: "",
					chChannelID: "0",
					chStartTime: new Date(0),
					chStopTime: new Date(Date.now() + 86_400_000),
					chRepeatDays: 0,
				},
			],
		});

		const calc = new TibberCalculator(adapter);
		await calc.setupCalculatorStates(HOME, 0);
		await drainMicrotasks();

		// Output state should exist
		assert.ok(`Homes.${HOME}.Calculations.0.Output` in store.objects);
		// OutputJSON state should exist
		assert.ok(`Homes.${HOME}.Calculations.0.OutputJSON` in store.objects);
		// TriggerPrice state should exist
		assert.ok(`Homes.${HOME}.Calculations.0.TriggerPrice` in store.objects);
	});

	it("creates AmountHours and OutputJSON states for a BestSingleHours channel", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.BestSingleHours,
					chActive: true,
					chHomeID: HOME,
					chName: "BestSingleHours channel",
					chValueOn: "true",
					chValueOff: "false",
					chAmountHours: 2,
					chTargetState: "",
					chChannelID: "0",
					chStartTime: new Date(0),
					chStopTime: new Date(Date.now() + 86_400_000),
					chRepeatDays: 0,
				},
			],
		});

		const calc = new TibberCalculator(adapter);
		await calc.setupCalculatorStates(HOME, 0);
		await drainMicrotasks();

		assert.ok(`Homes.${HOME}.Calculations.0.AmountHours` in store.objects);
		assert.ok(`Homes.${HOME}.Calculations.0.OutputJSON` in store.objects);
	});

	it("creates Output2 and OutputJSON2 states for a SmartBatteryBuffer channel", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.SmartBatteryBuffer,
					chActive: true,
					chHomeID: HOME,
					chName: "SBB channel",
					chValueOn: "true",
					chValueOff: "false",
					chValueOn2: "true",
					chValueOff2: "false",
					chAmountHours: 2,
					chEfficiencyLoss: 0.1,
					chTargetState: "",
					chTargetState2: "",
					chChannelID: "0",
					chStartTime: new Date(0),
					chStopTime: new Date(Date.now() + 86_400_000),
					chRepeatDays: 0,
				},
			],
		});

		const calc = new TibberCalculator(adapter);
		await calc.setupCalculatorStates(HOME, 0);
		await drainMicrotasks();

		assert.ok(`Homes.${HOME}.Calculations.0.Output2` in store.objects);
		assert.ok(`Homes.${HOME}.Calculations.0.OutputJSON2` in store.objects);
		assert.ok(`Homes.${HOME}.Calculations.0.EfficiencyLoss` in store.objects);
	});
});
