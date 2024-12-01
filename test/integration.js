import { join } from "path";
import { tests } from "@iobroker/testing";

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(process.cwd(), {
	allowedExitCodes: [11, 1],
});
