import * as utils from "@iobroker/adapter-core";

export class TibberHelper {
	adapter: utils.AdapterInstance;

	constructor(adapter: utils.AdapterInstance) {
		this.adapter = adapter;
	}

	protected getStatePrefix(homeId: string, space: string, name: string): { [key: string]: string } {
		const statePrefix = {
			key: name,
			value: "Homes." + homeId + "." + space + "." + name,
		};
		return statePrefix;
	}

	protected async checkAndSetValue(
		stateName: { [key: string]: string },
		value: string,
		description?: string,
	): Promise<void> {
		if (value != undefined) {
			if (value.trim().length > 0) {
				await this.adapter.setObjectNotExistsAsync(stateName.value, {
					type: "state",
					common: {
						name: stateName.key,
						type: "string",
						role: "String",
						desc: description,
						read: true,
						write: false,
					},
					native: {},
				});

				await this.adapter.setStateAsync(stateName.value, value, true);
			}
		}
	}

	protected async checkAndSetValueNumber(
		stateName: { [key: string]: string },
		value: number,
		description?: string,
	): Promise<void> {
		if (value != undefined) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "number",
					role: "Number",
					desc: description,
					read: true,
					write: false,
				},
				native: {},
			});

			await this.adapter.setStateAsync(stateName.value, value, true);
		}
	}

	protected async checkAndSetValueNumberUnit(
		stateName: { [key: string]: string },
		value: number,
		unit?: string,
		description?: string,
	): Promise<void> {
		if (value != undefined) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "number",
					role: "Number",
					desc: description,
					unit: unit,
					read: true,
					write: false,
				},
				native: {},
			});

			await this.adapter.setStateAsync(stateName.value, value, true);
		}
	}

	protected async checkAndSetValueBoolean(
		stateName: { [key: string]: string },
		value: boolean,
		description?: string,
	): Promise<void> {
		if (value) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "boolean",
					role: "Boolean",
					desc: description,
					read: true,
					write: false,
				},
				native: {},
			});

			await this.adapter.setStateAsync(stateName.value, value, true);
		}
	}
}
