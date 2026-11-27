import assert from "node:assert";
import { buildUserAgent } from "./projectUtils.ts";

describe("projectUtils – buildUserAgent", () => {
	it("contains platform and driver version", () => {
		assert.strictEqual(buildUserAgent("7.4.1", "7.2.5"), "ioBroker/7.2.5 ioBroker.tibberlink/7.4.1");
	});
	it("falls back to 'unknown' for missing versions", () => {
		assert.strictEqual(buildUserAgent(undefined, ""), "ioBroker/unknown ioBroker.tibberlink/unknown");
	});
	it("contains no token or other user specific data", () => {
		assert.doesNotMatch(buildUserAgent("7.4.1", "7.2.5"), /\d{13}/);
	});
});
