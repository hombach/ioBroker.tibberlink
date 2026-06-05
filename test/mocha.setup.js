"use strict";

// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
// Sets the correct tsconfig for testing (CommonJS module output for ts-node/register compatibility)
process.env.TS_NODE_PROJECT = "tsconfig.test.json";
// Make ts-node respect the "include" key in tsconfig.json
process.env.TS_NODE_FILES = "TRUE";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", e => {
	throw e;
});

// Patch require resolution: remap .js → .ts so ts-node/register can intercept
// TypeScript source files that use ESM-style .js extensions in their imports.
import { createRequire } from "node:module";
const _req = createRequire(import.meta.url);
const _Module = _req("node:module");
const _origResolve = _Module._resolveFilename.bind(_Module);
_Module._resolveFilename = function (request, parent, isMain, options) {
	try {
		return _origResolve(request, parent, isMain, options);
	} catch (err) {
		if (err?.code === "MODULE_NOT_FOUND" && /\.js$/.test(request)) {
			try {
				return _origResolve(request.replace(/\.js$/, ".ts"), parent, isMain, options);
			} catch {
				// fall through to original error
			}
		}
		throw err;
	}
};

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
/*
import chaiAsPromised from "chai-as-promised";
*/
import sinonChai from "sinon-chai";
import { should, use } from "chai";

should();
use(sinonChai);

// Dynamischer Import für ES-Module
(async () => {
	const chaiAsPromised = await import("chai-as-promised");
	use(chaiAsPromised.default);
})();
