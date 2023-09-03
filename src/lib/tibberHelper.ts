import * as utils from "@iobroker/adapter-core";

export class TibberHelper {
	adapter: utils.AdapterInstance;

	constructor(adapter: utils.AdapterInstance) {
		this.adapter = adapter;
	}

	protected getStatePrefix(homeId: string, space: string, name: string): { [key: string]: string } {
		const statePrefix = {
			key: name,
			value: `Homes.${homeId}.${space}.${name}`,
		};
		return statePrefix;
	}

	protected async getStateValue(stateName: string): Promise<any> {
		try {
			const stateObject = await this.getState(stateName);
			if (stateObject == null) return null; // errors thrown already in GetState()
			return stateObject.val;
		} catch (e) {
			this.adapter.log.error(`[getStateValue](${stateName}): ${e}`);
			return null;
		}
	}

	private async getState(stateName: string): Promise<any> {
		try {
			const stateObject = await this.adapter.getObjectAsync(stateName); // Check state existence
			if (!stateObject) {
				throw `State '${stateName}' does not exist.`;
			} else {
				// Get state value, so like: {val: false, ack: true, ts: 1591117034451, …}
				const stateValueObject = await this.adapter.getStateAsync(stateName);
				if (!this.isLikeEmpty(stateValueObject)) {
					return stateValueObject;
				} else {
					throw `Unable to retrieve info from state '${stateName}'.`;
				}
			}
		} catch (e) {
			this.adapter.log.error(`[asyncGetState](${stateName}): ${e}`);
			return null;
		}
	}

	private isLikeEmpty(inputVar: ioBroker.State | null | undefined): boolean {
		if (typeof inputVar !== "undefined" && inputVar !== null) {
			let sTemp = JSON.stringify(inputVar);
			sTemp = sTemp.replace(/\s+/g, ""); // remove all white spaces
			sTemp = sTemp.replace(/"+/g, ""); // remove all >"<
			sTemp = sTemp.replace(/'+/g, ""); // remove all >'<
			sTemp = sTemp.replace(/\[+/g, ""); // remove all >[<
			sTemp = sTemp.replace(/\]+/g, ""); // remove all >]<
			sTemp = sTemp.replace(/\{+/g, ""); // remove all >{<
			sTemp = sTemp.replace(/\}+/g, ""); // remove all >}<
			if (sTemp !== "") {
				return false;
			} else {
				return true;
			}
		} else {
			return true;
		}
	}

	protected async checkAndSetValue(stateName: { [key: string]: string }, value: string, description?: string): Promise<void> {
		if (value != undefined) {
			if (value.trim().length > 0) {
				await this.adapter.setObjectNotExistsAsync(stateName.value, {
					type: "state",
					common: {
						name: stateName.key,
						type: "string",
						role: "text",
						desc: description,
						read: true,
						write: false,
					},
					native: {},
				});
				await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
			}
		}
	}

	protected async checkAndSetValueNumber(stateName: { [key: string]: string }, value: number, description?: string): Promise<void> {
		if (value || value === 0) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "number",
					role: "value",
					desc: description,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
		}
	}

	protected async checkAndSetValueNumber2(
		stateName: { [key: string]: string },
		value: number,
		description?: string,
		writeable?: boolean,
	): Promise<void> {
		if (writeable === undefined) {
			writeable = false;
		}
		if (value || value === 0) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "number",
					role: "value",
					desc: description,
					read: true,
					write: writeable,
				},
				native: {},
			});
			await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
		}
	}

	protected async checkAndSetValueNumberUnit(
		stateName: { [key: string]: string },
		value: number,
		unit?: string,
		description?: string,
	): Promise<void> {
		if (value || value === 0) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "number",
					role: "value",
					desc: description,
					unit: unit,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
		}
	}

	protected async checkAndSetValueBoolean(stateName: { [key: string]: string }, value: boolean, description?: string): Promise<void> {
		if (value !== undefined && value !== null) {
			await this.adapter.setObjectNotExistsAsync(stateName.value, {
				type: "state",
				common: {
					name: stateName.key,
					type: "boolean",
					role: "indicator",
					desc: description,
					read: true,
					write: false,
				},
				native: {},
			});
			await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
		}
	}

	public generateErrorMessage(error: any, context: string): string {
		let errorMessages = "";
		for (const index in error.errors) {
			if (errorMessages) {
				errorMessages += ", ";
			}
			errorMessages += error.errors[index].message;
		}
		return `Error (${error.statusMessage}) occured during: -${context}- : ${errorMessages}`;
	}
}
