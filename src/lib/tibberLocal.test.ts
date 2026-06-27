import { expect } from "chai";
import { createMockAdapter, drainMicrotasks } from "./testHelpers.test.ts";
import { TibberLocal } from "./tibberLocal.ts";

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

function makePulseAdapter(): ReturnType<typeof createMockAdapter> {
	return createMockAdapter({ PulseList: [{ puName: "Test Pulse" }] });
}

type SmlParser = { extractAndParseSMLMessages(p: number, t: string, f: boolean): void };
type AsciiParser = { extractAndParseMode1_4Messages(p: number, t: string, f: boolean): void };

function parseSml(hex: string): ReturnType<typeof createMockAdapter>["store"] {
	const { adapter, store } = makePulseAdapter();
	const local = new TibberLocal(adapter);
	(local as unknown as SmlParser).extractAndParseSMLMessages(0, hex, true);
	return store;
}

// ── extractAndParseSMLMessages ─────────────────────────────────────────────

describe("TibberLocal – extractAndParseSMLMessages (issue #912 EMH regression)", () => {
	it("extracts Power, Import_total and Export_total from binary SML telegram", async () => {
		const store = parseSml(EMH_ISSUE_912_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — instantaneous power, int32 0xffffffff = -1 W
		expect(store.states["LocalPulse.0.Power"]).to.equal(-1);
		// OBIS 1-0:1.8.0 — import energy, int64 0x3020021 dWh ÷10 → Wh → kWh
		expect(store.states["LocalPulse.0.Import_total"]).to.equal(5046.275);
		// OBIS 1-0:2.8.0 — export energy, int64 0x4c461f3 dWh ÷10 → Wh → kWh
		expect(store.states["LocalPulse.0.Export_total"]).to.equal(7997.9);
	});

	it("mode-1/4 ASCII parser yields no states for binary SML data (root cause of #912)", async () => {
		// Confirms the bug: routing binary SML to the ASCII parser silently produces nothing
		const { adapter, store } = makePulseAdapter();
		const local = new TibberLocal(adapter);
		(local as unknown as AsciiParser).extractAndParseMode1_4Messages(0, EMH_ISSUE_912_HEX, true);
		await drainMicrotasks();

		expect(store.states["LocalPulse.0.Power"]).to.be.undefined;
	});
});

describe("TibberLocal – extractAndParseSMLMessages (ISKRA ISK00 7034)", () => {
	it("extracts negative power and energy counters", async () => {
		const store = parseSml(ISKRA_ISK00_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int32 0xfffffff1 = -15 W (feed-in)
		expect(store.states["LocalPulse.0.Power"]).to.equal(-15);
		// OBIS 1-0:1.8.0 — int64 0x0ee32fcb dWh ÷10 → Wh → kWh
		expect(store.states["LocalPulse.0.Import_total"]).to.equal(24976.993);
		// OBIS 1-0:2.8.0 — int64 0x7318ead dWh ÷10 → Wh → kWh
		expect(store.states["LocalPulse.0.Export_total"]).to.equal(12068.83);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EasyMeter Q3AA2064)", () => {
	it("applies scaler 0xfc (÷10000) correctly", async () => {
		const store = parseSml(EASYMETER_Q3AA_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int64 0x28d6=10454 ÷100 (scaler 0xfe) = 104.54 W
		expect(store.states["LocalPulse.0.Power"]).to.equal(104.54);
		// OBIS 1-0:1.8.0 — int64 0x7fdd4f5c6 ÷10000 → Wh → kWh
		expect(store.states["LocalPulse.0.Import_total"]).to.equal(3432.336);
		// OBIS 1-0:2.8.0 — int64 0x2009db ÷10000 → Wh → kWh
		expect(store.states["LocalPulse.0.Export_total"]).to.equal(0.21);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EFR issue #704 unsigned export)", () => {
	it("treats Export_total (OBIS 2.8.0) as unsigned even for high-bit values", async () => {
		const store = parseSml(EFR_ISSUE_704_HEX);
		await drainMicrotasks();

		// OBIS 1-0:16.7.0 — int16 0xf9eb = -1557 W
		expect(store.states["LocalPulse.0.Power"]).to.equal(-1557);
		// OBIS 1-0:1.8.0 — uint32 0x0425f616 ÷10 → Wh → kWh
		expect(store.states["LocalPulse.0.Import_total"]).to.equal(6959.669);
		// OBIS 1-0:2.8.0 — 3-byte 0x917463; signed would give -7244701 → negative kWh (wrong)
		expect(store.states["LocalPulse.0.Export_total"]).to.equal(953.252);
		expect(store.states["LocalPulse.0.Export_total"] as number).to.be.greaterThan(0);
	});
});

describe("TibberLocal – extractAndParseSMLMessages (EMH eHZB-W24E8)", () => {
	it("parses near-zero energy counters with scaler 0x03 (no division)", async () => {
		const store = parseSml(EMH_EHZB_HEX);
		await drainMicrotasks();

		// No Power OBIS in this telegram
		expect(store.states["LocalPulse.0.Power"]).to.be.undefined;
		// OBIS 1-0:1.8.0 — int64 value=2 Wh, scaler 0x03 (not in divisor table) → 2 Wh → kWh
		expect(store.states["LocalPulse.0.Import_total"]).to.equal(0.002);
		// OBIS 1-0:2.8.0 — int64 value=46 Wh → 0.046 kWh
		expect(store.states["LocalPulse.0.Export_total"]).to.equal(0.046);
	});
});
