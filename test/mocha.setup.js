"use strict";

// Makes ts-node ignore warnings, so mocha --watch does work
process.env.TS_NODE_IGNORE_WARNINGS = "TRUE";
// Sets the correct tsconfig for testing
process.env.TS_NODE_PROJECT = "tsconfig.json";
// Make ts-node respect the "include" key in tsconfig.json
process.env.TS_NODE_FILES = "TRUE";

// Don't silently swallow unhandled rejections
process.on("unhandledRejection", e => {
	throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
/*
import sinonChai from "sinon-chai";
import chaiAsPromised from "chai-as-promised";
import { should, use } from "chai";
*/
const sinonChai = require("sinon-chai");
const { should, use } = require("chai");

should();
use(sinonChai);

// Dynamischer Import für ES-Module
(async () => {
	const chaiAsPromised = await import("chai-as-promised");
	use(chaiAsPromised.default);
})();
