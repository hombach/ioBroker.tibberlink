import { join } from "path";
import { tests } from "@iobroker/testing";

// Validate the package files
tests.packageFiles(join(__dirname, ".."));
