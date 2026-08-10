import assert from "node:assert";
import { createMockAdapter, drainMicrotasks } from "./testHelpers.test.ts";
import { TibberDataAPI } from "./tibberDataAPI.ts";

// Real capability payload of a go-e charger ("go-e Garage Ost") from issue #925 debug output.
const GOE_CHARGER = {
	id: "device-goe-1",
	externalId: "goe:0123456",
	info: { name: "go-e Garage Ost", brand: "go-e", model: "Charger" },
	status: { lastSeen: "2026-07-30T06:25:23.770Z" },
	capabilities: [
		{ id: "grid.phaseCount", description: "number of phases being used for charging", value: 1, unit: "" },
		{ id: "connector.status", description: "charger connector status", value: "connected", availableValues: ["connected", "disconnected", "unknown"] },
		{ id: "charging.status", description: "charger charging status", value: "idle", availableValues: ["charging", "idle", "unknown"] },
		{ id: "charging.current.max", description: "maximum allowed charge current", value: 8, unit: "A" },
		{ id: "charging.current.offlineFallback", description: "fallback current if charger goes offline", value: 0, unit: "A" },
	],
};

type ChargerWriter = { writeChargerStates(d: unknown, homeId: string): Promise<void> };
type Detector = { isVehicle(d: unknown): boolean; isCharger(d: unknown): boolean };

function makeDataApi(): ReturnType<typeof createMockAdapter> {
	return createMockAdapter();
}

describe("TibberDataAPI – writeChargerStates (#925)", () => {
	it("writes every go-e charger capability as a typed state", async () => {
		const { adapter, store } = makeDataApi();
		const api = new TibberDataAPI(adapter);

		await (api as unknown as ChargerWriter).writeChargerStates(GOE_CHARGER, "home-1");
		await drainMicrotasks();

		const base = "Chargers.0123456";
		// numeric capabilities (dots sanitized to underscores)
		assert.strictEqual(store.states[`${base}.grid_phaseCount`], 1);
		assert.strictEqual(store.states[`${base}.charging_current_max`], 8);
		assert.strictEqual(store.states[`${base}.charging_current_offlineFallback`], 0);
		// enum/string capabilities
		assert.strictEqual(store.states[`${base}.connector_status`], "connected");
		assert.strictEqual(store.states[`${base}.charging_status`], "idle");
		// metadata
		assert.strictEqual(store.states[`${base}.HomeId`], "home-1");
		assert.strictEqual(store.states[`${base}.Brand`], "go-e");
		assert.strictEqual(store.states[`${base}.Model`], "Charger");
		// device-reported last-seen timestamp (status.lastSeen)
		assert.strictEqual(store.states[`${base}.LastSeen`], "2026-07-30T06:25:23.770Z");
	});

	it("types numeric capabilities as number and string enums as string", async () => {
		const { adapter, store } = makeDataApi();
		const api = new TibberDataAPI(adapter);

		await (api as unknown as ChargerWriter).writeChargerStates(GOE_CHARGER, "home-1");
		await drainMicrotasks();

		const base = "Chargers.0123456";
		assert.strictEqual(typeof store.states[`${base}.charging_current_max`], "number");
		assert.strictEqual(typeof store.states[`${base}.connector_status`], "string");
		// the state object for a numeric capability must be typed "number"
		assert.strictEqual((store.objects[`${base}.charging_current_max`] as { common?: { type?: string } })?.common?.type, "number");
	});

	it("classifies the go-e as a charger, not a vehicle", () => {
		const { adapter } = makeDataApi();
		const api = new TibberDataAPI(adapter);
		// charger has charging.current.* but no range.remaining
		assert.strictEqual((api as unknown as Detector).isCharger(GOE_CHARGER), true);
		assert.strictEqual((api as unknown as Detector).isVehicle(GOE_CHARGER), false);
	});

	// Wallbox Pulsar Plus reports an EMPTY externalId (#925 tester feedback) → must fall back to the
	// device id instead of producing an invalid state path "Chargers." (id ending in ".").
	it("falls back to the device id when externalId is empty", async () => {
		const { adapter, store } = makeDataApi();
		const api = new TibberDataAPI(adapter);
		const pulsar = {
			id: "wallbox-abc-123",
			externalId: "",
			info: { name: "PulsarPlus SN 161722" },
			capabilities: [
				{ id: "connector.status", description: "charger connector status", value: "connected", availableValues: ["connected", "disconnected", "unknown"] },
				{ id: "charging.status", description: "charger charging status", value: "idle", availableValues: ["charging", "idle", "unknown"] },
				{ id: "charging.current.max", description: "maximum allowed charge current", value: 16, unit: "A" },
				{ id: "charging.current.offlineFallback", description: "fallback current if charger goes offline", value: 0, unit: "A" },
			],
		};

		await (api as unknown as ChargerWriter).writeChargerStates(pulsar, "home-1");
		await drainMicrotasks();

		const base = "Chargers.wallbox-abc-123";
		assert.strictEqual(store.states[`${base}.charging_current_max`], 16);
		assert.strictEqual(store.states[`${base}.connector_status`], "connected");
		assert.strictEqual(store.states[`${base}.HomeId`], "home-1");
		// no invalid "Chargers." channel must be created
		assert.strictEqual(store.objects["Chargers."], undefined);
	});
});
