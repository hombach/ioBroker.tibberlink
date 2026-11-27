import assert from "node:assert";
import { enCalcType, isIso8601WithOffset, toBoolean } from "./projectUtils.ts";
import { createMockAdapter, drainMicrotasks, injectState, TEST_PRICES } from "./testHelpers.test.ts";
import { convertValue, parsePriceArray, TibberCalculator } from "./tibberCalculator.ts";

const HOME = "test-home-1";

describe("projectUtils – toBoolean", () => {
	it("passes real booleans through", () => {
		assert.strictEqual(toBoolean(true), true);
		assert.strictEqual(toBoolean(false), false);
	});
	it("accepts 'true'/'false' strings (case-insensitive, trimmed)", () => {
		assert.strictEqual(toBoolean("false"), false);
		assert.strictEqual(toBoolean(" TRUE "), true);
	});
	it("returns undefined for anything else", () => {
		assert.strictEqual(toBoolean("yes"), undefined);
		assert.strictEqual(toBoolean(1), undefined);
		assert.strictEqual(toBoolean(null), undefined);
	});
});

describe("tibberCalculator – convertValue", () => {
	it("converts booleans and plain numbers", () => {
		assert.strictEqual(convertValue("true"), true);
		assert.strictEqual(convertValue("False"), false);
		assert.strictEqual(convertValue("42"), 42);
		assert.strictEqual(convertValue("-0.5"), -0.5);
	});
	it("keeps strings that only start with a number", () => {
		assert.strictEqual(convertValue("12abc"), "12abc");
		assert.strictEqual(convertValue("12:00"), "12:00");
	});
	it("does not turn blank strings into 0", () => {
		assert.strictEqual(convertValue(""), "");
		assert.strictEqual(convertValue(" "), " ");
	});
});

describe("tibberCalculator – parsePriceArray", () => {
	it("returns [] for missing, empty or invalid values", () => {
		assert.deepStrictEqual(parsePriceArray(null), []);
		assert.deepStrictEqual(parsePriceArray(""), []);
		assert.deepStrictEqual(parsePriceArray("not json"), []);
		assert.deepStrictEqual(parsePriceArray("{}"), []);
	});
	it("reports why a value was rejected", () => {
		const reasons: string[] = [];
		parsePriceArray("not json", r => reasons.push(r));
		parsePriceArray("{}", r => reasons.push(r));
		parsePriceArray(null, r => reasons.push(r));
		assert.strictEqual(reasons.length, 2, "missing values are not reported, invalid ones are");
		assert.ok(reasons[0].startsWith("invalid JSON"));
		assert.strictEqual(reasons[1], "JSON is not an array");
	});
	it("returns the parsed array", () => {
		assert.deepStrictEqual(parsePriceArray('[{"total":0.1}]'), [{ total: 0.1 }]);
	});
});

describe("TibberCalculator – BestCost without current price (fail-safe)", () => {
	it("keeps the output OFF when CurrentPrice.total is missing", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.BestCost,
					chActive: true,
					chHomeID: HOME,
					chName: "Test",
					chValueOn: "true",
					chValueOff: "false",
					chTargetState: "",
					chTriggerPrice: 0.2,
					chStartTime: new Date(0),
					chStopTime: new Date(Date.now() + 86_400_000),
					chRepeatDays: 0,
				},
			],
		});
		injectState(store, `Homes.${HOME}.PricesToday.json`, JSON.stringify(TEST_PRICES));
		injectState(store, `Homes.${HOME}.PricesTomorrow.json`, JSON.stringify([]));

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestCost(ch: number): Promise<void> }).executeCalculatorBestCost(0);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.Calculations.0.Output`], false);
	});

	it("still switches ON when the current price is below the trigger", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.BestCost,
					chActive: true,
					chHomeID: HOME,
					chName: "Test",
					chValueOn: "true",
					chValueOff: "false",
					chTargetState: "",
					chTriggerPrice: 0.2,
				},
			],
		});
		injectState(store, `Homes.${HOME}.PricesToday.json`, JSON.stringify(TEST_PRICES));
		injectState(store, `Homes.${HOME}.PricesTomorrow.json`, JSON.stringify([]));
		injectState(store, `Homes.${HOME}.CurrentPrice.total`, 0.1);

		const calc = new TibberCalculator(adapter);
		await (calc as unknown as { executeCalculatorBestCost(ch: number): Promise<void> }).executeCalculatorBestCost(0);
		await drainMicrotasks();

		assert.strictEqual(store.states[`Homes.${HOME}.Calculations.0.Output`], true);
	});
});

describe("projectUtils – isIso8601WithOffset", () => {
	it("accepts timestamps with offset or Z", () => {
		assert.strictEqual(isIso8601WithOffset("2023-11-17T21:00:00.000+01:00"), true);
		assert.strictEqual(isIso8601WithOffset("2023-11-17T20:00:00.000Z"), true);
	});
	it("rejects timestamps without time zone", () => {
		assert.strictEqual(isIso8601WithOffset("2023-11-17T21:00:00.000"), false);
	});
	it("rejects malformed values", () => {
		assert.strictEqual(isIso8601WithOffset("2023-11-17T21:00:00.000Z+01:00"), false);
		assert.strictEqual(isIso8601WithOffset("2023-13-45T21:00:00.000Z"), false);
		assert.strictEqual(isIso8601WithOffset("tomorrow"), false);
	});
});
