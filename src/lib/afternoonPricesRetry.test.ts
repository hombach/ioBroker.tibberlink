import assert from "node:assert";
import { isAfternoonPricesTomorrowRetryWindow, pricesTomorrowStateNeedsFetch } from "./projectUtils.ts";

describe("afternoon PricesTomorrow retry helpers (#973)", () => {
	describe("isAfternoonPricesTomorrowRetryWindow", () => {
		it("is false before 13:00", () => {
			assert.strictEqual(isAfternoonPricesTomorrowRetryWindow(new Date("2026-11-05T12:59:00")), false);
		});
		it("is true from 13:00 inclusive", () => {
			assert.strictEqual(isAfternoonPricesTomorrowRetryWindow(new Date("2026-11-05T13:00:00")), true);
		});
		it("is true during mid-afternoon", () => {
			assert.strictEqual(isAfternoonPricesTomorrowRetryWindow(new Date("2026-11-05T16:30:00")), true);
		});
		it("is false from 20:00 inclusive", () => {
			assert.strictEqual(isAfternoonPricesTomorrowRetryWindow(new Date("2026-11-05T20:00:00")), false);
		});
	});

	describe("pricesTomorrowStateNeedsFetch", () => {
		const now = new Date("2026-11-05T15:00:00");

		it("needs fetch for null/empty/[]", () => {
			assert.strictEqual(pricesTomorrowStateNeedsFetch(null, now), true);
			assert.strictEqual(pricesTomorrowStateNeedsFetch("", now), true);
			assert.strictEqual(pricesTomorrowStateNeedsFetch("[]", now), true);
			assert.strictEqual(pricesTomorrowStateNeedsFetch([], now), true);
		});

		it("needs fetch when slot[2] is missing or not tomorrow", () => {
			assert.strictEqual(
				pricesTomorrowStateNeedsFetch(
					JSON.stringify([{ startsAt: "2026-11-06T00:00:00" }, { startsAt: "2026-11-06T00:15:00" }]),
					now,
				),
				true,
			);
			assert.strictEqual(
				pricesTomorrowStateNeedsFetch(
					JSON.stringify([
						{ startsAt: "2026-11-05T00:00:00" },
						{ startsAt: "2026-11-05T00:15:00" },
						{ startsAt: "2026-11-05T00:30:00" },
					]),
					now,
				),
				true,
			);
		});

		it("does not need fetch when slot[2] is tomorrow", () => {
			assert.strictEqual(
				pricesTomorrowStateNeedsFetch(
					JSON.stringify([
						{ startsAt: "2026-11-06T00:00:00" },
						{ startsAt: "2026-11-06T00:15:00" },
						{ startsAt: "2026-11-06T00:30:00" },
					]),
					now,
				),
				false,
			);
		});

		it("needs fetch for unparsable JSON", () => {
			assert.strictEqual(pricesTomorrowStateNeedsFetch("{not-json", now), true);
		});
	});
});
