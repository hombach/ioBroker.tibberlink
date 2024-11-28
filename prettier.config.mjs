// iobroker prettier configuration file
import prettierConfig from "@iobroker/eslint-config/prettier.config.mjs";

export default {
	...prettierConfig,
	// uncomment next line if you prefer double quotes
	singleQuote: false,
	printWidth: 160,
	useTabs: true,
};
