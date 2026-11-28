import assert from "node:assert";
import { enCalcType } from "./projectUtils.ts";
import { createMockAdapter } from "./testHelpers.test.ts";
import { TibberCalculator } from "./tibberCalculator.ts";

const HOME = "test-home-1";

describe("TibberCalculator – setupCalculatorStates is complete when it resolves", () => {
	it("creates the channel states before the promise resolves", async () => {
		const { adapter, store } = createMockAdapter({
			UseCalculator: true,
			CalculatorList: [
				{
					chType: enCalcType.BestCost,
					chActive: false,
					chHomeID: HOME,
					chName: "Test",
					chValueOn: "true",
					chValueOff: "false",
					chTargetState: "",
					chTriggerPrice: 0.2,
				},
			],
		});
		// simulate a real object DB: object creation takes a moment
		const a = adapter as unknown as { setObjectNotExistsAsync: (id: string, obj: object) => Promise<void> };
		const original = a.setObjectNotExistsAsync.bind(adapter);
		a.setObjectNotExistsAsync = (id, obj) => new Promise(resolve => setTimeout(() => void original(id, obj).then(resolve), 5));
		const calc = new TibberCalculator(adapter);

		await calc.setupCalculatorStates(HOME, 0);

		// no drainMicrotasks() on purpose: everything the first calculator run needs must exist now
		for (const state of ["Active", "Output", "TriggerPrice"]) {
			assert.ok(store.objects[`Homes.${HOME}.Calculations.0.${state}`], `${state} object missing after setup`);
		}
	});
});
