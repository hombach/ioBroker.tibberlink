import type * as utils from "@iobroker/adapter-core";
import type { IPrice } from "tibber-api/lib/src/models/IPrice";
import { PriceLevel } from "tibber-api/lib/src/models/enums/PriceLevel";

/** Minimal in-memory store used by the mock adapter. */
export type MockStore = {
	/** Adapter state values keyed by state id. */
	states: Record<string, unknown>;
	/** Adapter object definitions keyed by object id. */
	objects: Record<string, object>;
};

/**
 * Creates a mock ioBroker adapter backed by an in-memory store.
 *
 * @param config - Adapter config overrides merged into the default config.
 */
export function createMockAdapter(config: Record<string, unknown> = {}): {
	adapter: utils.AdapterInstance;
	store: MockStore;
} {
	const store: MockStore = { states: {}, objects: {} };

	function handleSetState(id: string, valOrState: unknown): void {
		const val = typeof valOrState === "object" && valOrState !== null && "val" in valOrState ? (valOrState as Record<string, unknown>).val : valOrState;
		store.states[id] = val;
		if (!store.objects[id]) {
			store.objects[id] = { type: "state", common: {}, native: {} };
		}
	}

	const adapter = {
		namespace: "tibberlink.0",
		config: {
			UseCalculator: true,
			CalculatorList: [] as unknown[],
			HomesList: [] as unknown[],
			...config,
		},
		log: {
			debug: (_msg: string) => {},
			info: (_msg: string) => {},
			warn: (_msg: string) => {},
			error: (_msg: string) => {},
		},
		getStateAsync: (id: string): Promise<ioBroker.State | null> => {
			if (id in store.states) {
				return Promise.resolve({
					val: store.states[id],
					ack: true,
					ts: Date.now(),
					lc: Date.now(),
					from: "",
				} as ioBroker.State);
			}
			return Promise.resolve(null);
		},
		getObjectAsync: (id: string): Promise<object | null> => Promise.resolve(store.objects[id] ?? null),
		getForeignObjectAsync: (_id: string): Promise<null> => Promise.resolve(null),
		getForeignStateAsync: (_id: string): Promise<null> => Promise.resolve(null),
		setState: (id: string, valOrState: unknown, _ack?: unknown): Promise<void> => {
			handleSetState(id, valOrState);
			return Promise.resolve();
		},
		setStateAsync: (id: string, valOrState: unknown): Promise<void> => {
			handleSetState(id, valOrState);
			return Promise.resolve();
		},
		setForeignStateAsync: (id: string, val: unknown): Promise<void> => {
			store.states[id] = val;
			return Promise.resolve();
		},
		setObjectNotExistsAsync: (id: string, obj: object): Promise<void> => {
			if (!store.objects[id]) {
				store.objects[id] = obj;
			}
			return Promise.resolve();
		},
		setObject: (id: string, obj: object, cb?: (err: Error | null) => void): void => {
			store.objects[id] = obj;
			cb?.(null);
		},
		extendObjectAsync: (id: string, obj: object): Promise<void> => {
			store.objects[id] = { ...(store.objects[id] ?? {}), ...obj };
			return Promise.resolve();
		},
		delObjectAsync: (id: string): Promise<void> => {
			delete store.objects[id];
			delete store.states[id];
			return Promise.resolve();
		},
		subscribeStates: (_pattern: string): void => {},
		delay: (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms)),
	} as unknown as utils.AdapterInstance;

	return { adapter, store };
}

/**
 * Injects a pre-existing state into the mock store.
 *
 * @param store - The mock store to write into.
 * @param id - The state id.
 * @param val - The state value.
 */
export function injectState(store: MockStore, id: string, val: unknown): void {
	store.states[id] = val;
	store.objects[id] = { type: "state", common: {}, native: {} };
}

/** Flushes all microtasks and short-delay timers to let async state writes settle. */
export function drainMicrotasks(): Promise<void> {
	return new Promise(r => setTimeout(r, 20));
}

// 8 price slots in the past (2023-01-01) so checkQuarterMatch always returns false
export const TEST_PRICES: IPrice[] = [
	{ startsAt: "2023-01-01T00:00:00.000Z", total: 0.3, energy: 0.24, tax: 0.06, level: PriceLevel.EXPENSIVE },
	{ startsAt: "2023-01-01T00:15:00.000Z", total: 0.1, energy: 0.08, tax: 0.02, level: PriceLevel.CHEAP },
	{ startsAt: "2023-01-01T00:30:00.000Z", total: 0.25, energy: 0.2, tax: 0.05, level: PriceLevel.NORMAL },
	{ startsAt: "2023-01-01T00:45:00.000Z", total: 0.12, energy: 0.1, tax: 0.02, level: PriceLevel.CHEAP },
	{ startsAt: "2023-01-01T01:00:00.000Z", total: 0.2, energy: 0.16, tax: 0.04, level: PriceLevel.NORMAL },
	{ startsAt: "2023-01-01T01:15:00.000Z", total: 0.15, energy: 0.12, tax: 0.03, level: PriceLevel.CHEAP },
	{ startsAt: "2023-01-01T01:30:00.000Z", total: 0.28, energy: 0.22, tax: 0.06, level: PriceLevel.EXPENSIVE },
	{ startsAt: "2023-01-01T01:45:00.000Z", total: 0.18, energy: 0.14, tax: 0.04, level: PriceLevel.NORMAL },
];
