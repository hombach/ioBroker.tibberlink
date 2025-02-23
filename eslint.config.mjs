// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from "@iobroker/eslint-config";

export default [
	...config,

	{
		// specify files to exclude from linting here
		ignores: [
			"*.test.js",
			"test/**/*.js",
			"*.config.mjs",
			"build",
			"admin/build",
			"admin/words.js",
			"admin/admin.d.ts",
			"**/adapter-config.d.ts",
			".dev-server/**",
		],
	},

	{
		// you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
		// as this improves maintainability. jsdoc warnings will not block build process.
		rules: {
			// 'jsdoc/require-jsdoc': 'off',
		},
	},
];
