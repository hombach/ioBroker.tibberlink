import assert from "node:assert";
import axios from "axios";
import { createMockAdapter, drainMicrotasks } from "./testHelpers.test.ts";
import { TibberLocal, bridgeEndpointPath } from "./tibberLocal.ts";

// ── Meter telegrams ────────────────────────────────────────────────────────

// EMH meter (firmware 1235-57a088d2) binary SML telegram from issue #912.
// This meter reports meter_mode=4 but sends binary SML (starts with 1b1b1b1b).
// Meter serial redacted (replaced with 0xabcdef).
const EMH_ISSUE_912_HEX =
	"1b1b1b1b0101010176051035997f6200620072630101760107ffffffffffff050567332b" +
	"0b0a01454d480000abcdef7262016505e28f5f620163e99b00" +
	"76051035998062006200726307017707ffffffffffff" +
	"0b0a01454d480000abcdef070100620affff7262016505e28f5f" +
	"7977070100603201010101010104454d48" +
	"0177070100600100ff010101010b0a01454d480000abcdef" +
	"0177070100010800ff641c59047262016505e28f5f621e52ff6900000000030200210177" +
	"070100010801ff017262016505e28f5f621e52ff69000000000301ffb90177" +
	"070100010802ff017262016505e28f5f621e52ff6900000000000000670177" +
	"070100020800ff017262016505e28f5f621e52ff690000000004c461f30177" +
	"070100020801ff017262016505e28f5f621e52ff690000000004c461e10177" +
	"070100020802ff017262016505e28f5f621e52ff6900000000000000120177" +
	"070100100700ff017262016505e28f5f621b520055ffffffff010101638a7f00" +
	"76051035998162006200726302017101638ec100000000" +
	"1b1b1b1b1a03af75";

// ISKRA ISK00 7034 — mode 3, standard negative-power (feed-in) case
const ISKRA_ISK00_HEX =
	"1b1b1b1b01010101760512923b426200620072630101760101050630be6c0b090149534b0004316b61010163a9b600" +
	"760512923b43620062007263070177010b090149534b0004316b61070100620affff726201650b7415f27a" +
	"77078181c78203ff010101010449534b0177070100000009ff010101010b090149534b0004316b61" +
	"0177070100010800ff65000101a001621e52ff59000000000ee32fcb0177" +
	"070100010801ff0101621e52ff59000000000ee32fcb0177" +
	"070100010802ff0101621e52ff5900000000000000000177" +
	"070100020800ff0101621e52ff590000000007318ead0177" +
	"070100020801ff0101621e52ff590000000007318ead0177" +
	"070100020802ff0101621e52ff5900000000000000000177" +
	"070100100700ff0101621b520055fffffff10177" +
	"078181c78205ff010101018302268dd6b5bfb5760a1b2c763b034bd3af9863ea9000593a8da767ec1ba01e9b6e8d52fa200e7ec7517fc100295699650b01010163d03800" +
	"760512923b4462006200726302017101630a84001b1b1b1b1a00a9f2";

// EasyMeter Q3AA2064 — mode 3, tests scaler 0xfc (÷10000)
const EASYMETER_Q3AA_HEX =
	"1b1b1b1b01010101760b455359416ebd0ac96831620062007263010176010445535908455359781168310b09014553591103bf6ebd0101638b0d00" +
	"760b455359416ebd0ac96832620062007263070177010b09014553591103bf6ebd080100620affff" +
	"0072620165039878117677078181c78203ff01010101044553590177070100000009ff010101010b09014553591103bf6ebd" +
	"0177070100010800ff6400008001621e52fc5900000007fdd4f5c60177" +
	"070100020800ff6400008001621e52fc5900000000002009db0177" +
	"070100100700ff0101621b52fe5900000000000028d60177" +
	"078181c7f006ff010101010401003e0101016305d800" +
	"760b455359416ebd0ac968336200620072630201710163c13b000000001b1b1b1b1a032b3e";

// EFR meter — mode 3, regression for issue #704 (Export_total 0x2.8.0 must be unsigned)
const EFR_ISSUE_704_HEX =
	"1b1b1b1b010101017605032ec3db6200620072630101760107ffffffffffff05010f969f0b0a014546522102cf806f72620165055c5cfb016334b600" +
	"7605032ec3dc62006200726307017707ffffffffffff0b0a014546522102cf806f070100620affff72620165055c5cfb" +
	"f106770701006032010101010101044546520177070100600100ff010101010b0a014546522102cf806f" +
	"0177070100010800ff641c780472620165055c5cfb621e52ff650425f6160177" +
	"070100020800ff0172620165055c5cfb621e52ff649174630177" +
	"070100100700ff0101621b520053f9eb0177" +
	"070100200700ff0101622352ff6308ca0177070100340700ff0101622352ff6308fc0177070100480700ff0101622352ff6308fb01770701001f0700ff0101622152fe62db0177070100330700ff0101622152fe62c30177070100470700ff0101622152fe6301570177070100510701ff01016208520052770177070100510702ff0101620852005300ee0177070100510704ff0101620852005300d6017707010051070fff0101620852005300c0017707010051071aff0101620852005300bc01770701000e0700ff0101622c52ff6301f301770701000002000001010101" +
	"0630332e30300177070100605a0201010101010342bd01770701006161000001010101030000017707010060320104010101010850312e322e3132017707010060320404010101010304220101016350e500" +
	"7605032ec3dd620062007263020171016378f9001b1b1b1b1a00b129";

// EMH eHZB-W24E8-0LHP0-D6-A5Q2 — mode 3, near-new meter (no Power OBIS present)
const EMH_EHZB_HEX =
	"1b1b1b1b0101010176050001b85c6200620072630101760107ffffffffffff05000092ca0b0a01454d480000a9476d726201650000a401620163f617" +
	"0076050001b85d62006200726307017707ffffffffffff0b0a01454d480000a9476d070100620affff726201650000a401" +
	"7477070100603201010101010104454d480177070100600100ff010101010b0a01454d480000a9476d" +
	"0177070100010800ff641c6d04726201650000a401621e52036900000000000000020177" +
	"070100020800ff01726201650000a401621e520369000000000000002e01010163ddea00" +
	"76050001b85e62006200726302017101636f720000001b1b1b1b1a020b62";

// eBZ DD3 (EBZ5DD32R06DTA_107) — plain OBIS text telegram (IEC 62056-21).
// Same meter family reports meter_mode=5 in issue #931; the ASCII parser must
// extract states from it (before the fix, mode 5 fell through to the SML parser).
const EBZ_MODE5_HEX =
	"2f45425a35444433325230364454415f3130370d0a312d303a302e302e302a323535283145425a30313031303033313331290d0a" +
	"312d303a39362e312e302a323535283145425a30313031303033313331290d0a" +
	"312d303a312e382e302a323535283030373435392e37383437313635322a6b5768290d0a" +
	"312d303a312e382e312a323535283030303030312e3030332a6b5768290d0a" +
	"312d303a312e382e322a323535283030373435382e3738312a6b5768290d0a" +
	"312d303a322e382e302a323535283032373532312e33393931323739342a6b5768290d0a" +
	"312d303a31362e372e302a323535283030303030322e36392a57290d0a" +
	"312d303a33362e372e302a323535283030303133352e39352a57290d0a" +
	"312d303a35362e372e302a323535283030303233392e39312a57290d0a" +
	"312d303a37362e372e302a323535282d3030303337332e31372a57290d0a" +
	"312d303a33322e372e302a323535283233362e312a56290d0a" +
	"312d303a35322e372e302a323535283233352e372a56290d0a" +
	"312d303a37322e372e302a323535283233392e312a56290d0a" +
	"312d303a39362e352e302a323535283030314334313034290d0a" +
	"302d303a39362e382e302a323535283036344641453235290d0a210d0a";

function makePulseAdapter(): ReturnType<typeof createMockAdapter> {
	return createMockAdapter({ PulseList: [{ puName: "Test Pulse" }] });
}

type SmlParser = { extractAndParseSMLMessages(p: number, t: string, f: boolean): void };
type AsciiParser = { extractAndParseAsciiMessages(p: number, t: string, f: boolean): void };
type InfoParser = { fetchPulseInfo(p: number, obj: unknown, prefix: string, firstTime: boolean): void };

function parseSml(hex: string): ReturnType<typeof createMockAdapter>["store"] {
	const { adapter, store } = makePulseAdapter();
	const local = new TibberLocal(adapter);
	(local as unknown as SmlParser).extractAndParseSMLMessages(0, hex, true);
	return store;
}

// ── fetchPulseInfo ─────────────────────────────────────────────────────────


describe("bridgeEndpointPath (#947 FW endpoint rename)", () => {
	it("maps data/metrics to new and legacy Bridge paths", () => {
		assert.strictEqual(bridgeEndpointPath("data", "new", 1), "/node_data.json?node_id=1");
		assert.strictEqual(bridgeEndpointPath("data", "legacy", 1), "/data.json?node_id=1");
		assert.strictEqual(bridgeEndpointPath("metrics", "new", 3), "/node_metrics.json?node_id=3");
		assert.strictEqual(bridgeEndpointPath("metrics", "legacy", 3), "/metrics.json?node_id=3");
	});
});

// ── axiosWithBridgeFallback (#947 endpoint fallback logic) ──────────────────

type FallbackApi = {
	axiosWithBridgeFallback<T>(pulse: number, kind: "data" | "metrics", config: object): Promise<{ data: T; status: number }>;
};

/** Builds an error shaped like an axios HTTP error (has `response.status`). */
function httpError(status: number): Error {
	const err = new Error(`Request failed with status code ${status}`) as Error & { response?: { status: number } };
	err.response = { status };
	return err;
}

/**
 * Creates a TibberLocal with a stubbed `axios.request` that answers only for the paths the given
 * `responder` accepts. Records every requested URL so tests can assert the fallback order and that a
 * remembered mode skips the failing path.
 *
 * @param responder - Returns a fake axios response for a known url, or throws to simulate a failure.
 */
function makeLocalWithBridge(responder: (url: string) => unknown): {
	local: TibberLocal;
	tried: string[];
	restore: () => void;
} {
	const { adapter } = createMockAdapter({
		UseLocalPulseData: true,
		PulseList: [{ puName: "P", tibberBridgeUrl: "10.0.0.1", tibberBridgePassword: "pw", tibberPulseLocalNodeId: 3 }],
	});
	const local = new TibberLocal(adapter);
	const tried: string[] = [];
	const original = axios.request;
	(axios as unknown as { request: (cfg: { url?: string }) => Promise<unknown> }).request = (cfg): Promise<unknown> => {
		const url = cfg.url ?? "";
		tried.push(url);
		try {
			return Promise.resolve(responder(url));
		} catch (error) {
			return Promise.reject(error);
		}
	};
	return {
		local,
		tried,
		restore: () => {
			(axios as unknown as { request: typeof original }).request = original;
		},
	};
}

/** Answers only for the listed paths with a 200; everything else 404s (simulates one firmware generation). */
function onlyServes(...paths: string[]): (url: string) => unknown {
	return (url: string): unknown => {
		if (paths.includes(url)) {
			return { data: "OK", status: 200 };
		}
		throw httpError(404);
	};
}

describe("TibberLocal – axiosWithBridgeFallback (#947 endpoint fallback)", () => {
	const NEW = bridgeEndpointPath("metrics", "new", 3);
	const LEG = bridgeEndpointPath("metrics", "legacy", 3);

	it("uses the new endpoint on new firmware with a single request", async () => {
		const { local, tried, restore } = makeLocalWithBridge(onlyServes(NEW));
		try {
			const res = await (local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" });
			assert.strictEqual(res.data, "OK");
			assert.deepStrictEqual(tried, [NEW]);
		} finally {
			restore();
		}
	});

	it("falls back to the legacy endpoint on 404 and remembers it for later polls", async () => {
		const { local, tried, restore } = makeLocalWithBridge(onlyServes(LEG));
		try {
			await (local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" });
			// first poll probes new (404) then succeeds on legacy
			assert.deepStrictEqual(tried, [NEW, LEG]);
			await (local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" });
			// second poll goes straight to the remembered legacy endpoint — no wasted probe
			assert.deepStrictEqual(tried, [NEW, LEG, LEG]);
		} finally {
			restore();
		}
	});

	it("does NOT switch endpoints on a non-404 fault once a mode is established", async () => {
		let calls = 0;
		const { local, tried, restore } = makeLocalWithBridge(url => {
			if (url !== NEW) {
				throw httpError(404);
			}
			calls++;
			if (calls === 1) {
				return { data: "OK", status: 200 }; // first call establishes 'new'
			}
			throw httpError(500); // later the established endpoint faults
		});
		try {
			await (local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" });
			await assert.rejects((local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" }), /500/);
			assert.ok(!tried.includes(LEG), "a 500 on the established endpoint must not silently fall back to legacy");
		} finally {
			restore();
		}
	});

	it("falls back on ANY error during the first probe, not only 404 (point 2)", async () => {
		// new endpoint faults with a non-404 while no mode is established yet; legacy works
		const { local, tried, restore } = makeLocalWithBridge(url => {
			if (url === NEW) {
				throw httpError(500);
			}
			if (url === LEG) {
				return { data: "OK", status: 200 };
			}
			throw httpError(404);
		});
		try {
			const res = await (local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" });
			assert.strictEqual(res.data, "OK");
			assert.deepStrictEqual(tried, [NEW, LEG]);
		} finally {
			restore();
		}
	});

	it("throws when both endpoints fail", async () => {
		const { local, tried, restore } = makeLocalWithBridge(() => {
			throw httpError(404);
		});
		try {
			await assert.rejects((local as unknown as FallbackApi).axiosWithBridgeFallback(0, "metrics", { method: "GET" }));
			assert.deepStrictEqual(tried, [NEW, LEG]);
		} finally {
			restore();
		}
	});
});

describe("TibberLocal – fetchPulseInfo (issue #935 boolean states)", () => {
	// Realistic node_status excerpt: usb_power and the nested autolevel_enable are booleans,
	// meter_mode/rssi are numbers, product a string.
	const NODE_STATUS = {
		node_status: {
			product_id: "49344",
			meter_mode: 5,
			node_avg_rssi: -31.75,
			usb_power: true,
			baud_9600: { autolevel: { autolevel_enable: false } },
		},
	};

	it("creates boolean-typed states for boolean values (usb_power, autolevel_enable)", async () => {
		const { adapter, store } = makePulseAdapter();
		const local = new TibberLocal(adapter);
		(local as unknown as InfoParser).fetchPulseInfo(0, NODE_STATUS, "", true);
		await drainMicrotasks();

		const usbId = "LocalPulse.0.PulseInfo.node_status.usb_power";
		const autoId = "LocalPulse.0.PulseInfo.node_status.baud_9600.autolevel.autolevel_enable";

		// Values written correctly …
		assert.strictEqual(store.states[usbId], true);
		assert.strictEqual(store.states[autoId], false);
		// … and — the actual bug — the object type must be boolean, not number
		assert.strictEqual((store.objects[usbId] as ioBroker.StateObject).common.type, "boolean");
		assert.strictEqual((store.objects[autoId] as ioBroker.StateObject).common.type, "boolean");
	});

	it("still creates number-typed states for numeric values", async () => {
		const { adapter, store } = makePulseAdapter();
		const local = new TibberLocal(adapter);
		(local as unknown as InfoParser).fetchPulseInfo(0, NODE_STATUS, "", true);
		await drainMicrotasks();

		const rssiId = "LocalPulse.0.PulseInfo.node_status.node_avg_rssi";
		assert.strictEqual(store.states[rssiId], -31.75);
		assert.strictEqual((store.objects[rssiId] as ioBroker.StateObject).common.type, "number");
	});
});

// ── extractAndParseSMLMessages ─────────────────────────────────────────────

describe("TibberLocal – extractAndParseSMLMessages (issue #912 EMH regression)", () => {
	it("extracts Power, Import_total and Export_total from binary SML telegram", async () => {
		const store = parseSml(EMH_ISSUE_912_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — instantaneous power, int32 0xffffffff = -1 W
		assert.strictEqual(store.states["LocalPulse.0.Power"], -1);
		// OBIS 1-0:1.8.0 — import energy, int64 0x3020021 dWh ÷10 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 5046.275);
		// OBIS 1-0:2.8.0 — export energy, int64 0x4c461f3 dWh ÷10 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 7997.9);
	});

	it("ASCII/OBIS parser yields no states for binary SML data (root cause of #912)", async () => {
		// Confirms the bug: routing binary SML to the ASCII parser silently produces nothing
		const { adapter, store } = makePulseAdapter();
		const local = new TibberLocal(adapter);
		(local as unknown as AsciiParser).extractAndParseAsciiMessages(0, EMH_ISSUE_912_HEX, true);
		await drainMicrotasks();

		assert.strictEqual(store.states["LocalPulse.0.Power"], undefined);
	});
});

describe("TibberLocal – extractAndParseAsciiMessages (eBZ plain OBIS, issue #931 mode 5)", () => {
	it("extracts Power, Import_total and Export_total from plain OBIS text telegram", async () => {
		const { adapter, store } = makePulseAdapter();
		const local = new TibberLocal(adapter);
		(local as unknown as AsciiParser).extractAndParseAsciiMessages(0, EBZ_MODE5_HEX, true);
		await drainMicrotasks();

		// 1-0:16.7.0(000002.69*W) — instantaneous power, rounded to 1 decimal
		assert.strictEqual(store.states["LocalPulse.0.Power"], 2.7);
		// 1-0:1.8.0(007459.78471652*kWh) — import energy
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 7459.8);
		// 1-0:2.8.0(027521.39912794*kWh) — export energy
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 27521.4);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (ISKRA ISK00 7034)", () => {
	it("extracts negative power and energy counters", async () => {
		const store = parseSml(ISKRA_ISK00_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int32 0xfffffff1 = -15 W (feed-in)
		assert.strictEqual(store.states["LocalPulse.0.Power"], -15);
		// OBIS 1-0:1.8.0 — int64 0x0ee32fcb dWh ÷10 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 24976.993);
		// OBIS 1-0:2.8.0 — int64 0x7318ead dWh ÷10 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 12068.83);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EasyMeter Q3AA2064)", () => {
	it("applies scaler 0xfc (÷10000) correctly", async () => {
		const store = parseSml(EASYMETER_Q3AA_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int64 0x28d6=10454 ÷100 (scaler 0xfe) = 104.54 W
		assert.strictEqual(store.states["LocalPulse.0.Power"], 104.54);
		// OBIS 1-0:1.8.0 — int64 0x7fdd4f5c6 ÷10000 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 3432.336);
		// OBIS 1-0:2.8.0 — int64 0x2009db ÷10000 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 0.21);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EFR issue #704 unsigned export)", () => {
	it("treats Export_total (OBIS 2.8.0) as unsigned even for high-bit values", async () => {
		const store = parseSml(EFR_ISSUE_704_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int16 0xf9eb = -1557 W
		assert.strictEqual(store.states["LocalPulse.0.Power"], -1557);
		// OBIS 1-0:1.8.0 — uint32 0x0425f616 ÷10 → Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 6959.669);
		// OBIS 1-0:2.8.0 — 3-byte 0x917463; signed would give -7244701 → negative kWh (wrong)
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 953.252);
		assert.ok((store.states["LocalPulse.0.Export_total"] as number) > 0);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EMH eHZB-W24E8)", () => {
	it("parses near-zero energy counters with scaler 0x03 (no division)", async () => {
		const store = parseSml(EMH_EHZB_HEX);
		await drainMicrotasks();

		// No Power OBIS in this telegram
		assert.strictEqual(store.states["LocalPulse.0.Power"], undefined);
		// OBIS 1-0:1.8.0 — int64 value=2 Wh, scaler 0x03 (not in divisor table) → 2 Wh → kWh
		assert.strictEqual(store.states["LocalPulse.0.Import_total"], 0.002);
		// OBIS 1-0:2.8.0 — int64 value=46 Wh → 0.046 kWh
		assert.strictEqual(store.states["LocalPulse.0.Export_total"], 0.046);
	});
});
