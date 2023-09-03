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
//				await this.adapter.setStateAsync(stateName.value, value, true);
				await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
			}
		}
	}


/* /**
 * @method setState
 * @param id the id of the value. '<this.namespaceRedis>.' will be prepended
 * @param state
 *
 *
 *      an object containing the actual value and some metadata:<br>
 *      setState(id, {'val': val, 'ts': ts, 'ack': ack, 'from': from, 'lc': lc, 'user': user})
 *
 *      if no object is given state is treated as val:<br>
 *      setState(id, val)
 *
 *      <ul><li><b>val</b>  the actual value. Can be any JSON-stringifiable object. If undefined the
 *                          value is kept unchanged.</li>
 *
 *      <li><b>ack</b>  a boolean that can be used to mark a value as confirmed, used in bidirectional systems which
 *                      acknowledge that a value has been successfully set. Will be set to false if undefined.</li>
 *
 *      <li><b>ts</b>   a unix timestamp indicating the last write-operation on the state. Will be set by the
 *                      setState method if undefined.</li>
 *
 *      <li><b>lc</b>   a unix timestamp indicating the last change of the actual value. this should be undefined
 *                      when calling setState, it will be set by the setValue method itself.</li></ul>
 *
 * @param callback will be called when redis confirmed reception of the command
*/ /*
	async setState(
		id: string,
		state: ioBroker.SettableState | ioBroker.StateValue,
		callback?: (err: Error | null | undefined, id: string) => void
	): Promise<string | void> {
*/



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
			await this.adapter.setStateAsync(stateName.value, value, true);
		}
	}

	protected async checkAndSetValueNumberUnit(stateName: { [key: string]: string }, value: number, unit?: string, description?: string): Promise<void> {
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
			await this.adapter.setStateAsync(stateName.value, value, true);
		}
	}

	protected async checkAndSetValueBoolean(stateName: { [key: string]: string }, value: boolean, description?: string): Promise<void> {
		if (value) {
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
			await this.adapter.setStateAsync(stateName.value, value, true);
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
