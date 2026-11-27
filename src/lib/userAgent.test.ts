import assert from "node:assert";
import { buildUserAgent, hashInstallationId } from "./projectUtils.ts";

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

describe("projectUtils – hashInstallationId", () => {
	it("is stable and 16 hex chars long", () => {
		const id = hashInstallationId("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0");
		assert.match(id ?? "", /^[0-9a-f]{16}$/);
		assert.strictEqual(id, hashInstallationId("0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0"));
	});
	it("differs between installations and doesn't contain the UUID", () => {
		const a = hashInstallationId("uuid-a");
		assert.notStrictEqual(a, hashInstallationId("uuid-b"));
		assert.ok(!a?.includes("uuid"));
	});
	it("returns undefined without UUID", () => {
		assert.strictEqual(hashInstallationId(undefined), undefined);
		assert.strictEqual(hashInstallationId(""), undefined);
	});
	it("is appended to the User-Agent as comment", () => {
		assert.strictEqual(buildUserAgent("7.4.2", "7.2.5", "abcdef0123456789"), "ioBroker/7.2.5 ioBroker.tibberlink/7.4.2 (abcdef0123456789)");
	});
});
