import * as utils from "@iobroker/adapter-core";

export class ProjectUtils {
	adapter: utils.AdapterInstance;

	constructor(adapter: utils.AdapterInstance) {
		this.adapter = adapter;
	}

	/**
	 * Retrieves the value of a given state by its name.
	 *
	 * @param stateName - A string representing the name of the state to retrieve.
	 * @returns A Promise that resolves with the value of the state if it exists, otherwise resolves with null.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async getStateValue(stateName: string): Promise<any | null> {
		try {
			const stateObject = await this.getState(stateName);
			return stateObject?.val ?? null; // errors have already been handled in getState()
		} catch (error) {
			this.adapter.log.error(`[getStateValue](${stateName}): ${error}`);
			return null;
		}
	}

	/**
	 * Retrieves the state object by its name.
	 *
	 * @param stateName - A string representing the name of the state to retrieve.
	 * @returns A Promise that resolves with the object of the state if it exists, otherwise resolves with null.
	 */
	private async getState(stateName: string): Promise<ioBroker.State | null | undefined> {
		try {
			if (await this.verifyStateAvailable(stateName)) {
				// Get state value, so like: {val: false, ack: true, ts: 1591117034451, �}
				const stateValueObject = await this.adapter.getStateAsync(stateName);
				if (!this.isLikeEmpty(stateValueObject)) {
					return stateValueObject;
				} else {
					throw `Unable to retrieve info from state '${stateName}'.`;
				}
			}
		} catch (error) {
			this.adapter.log.error(`[asyncGetState](${stateName}): ${error}`);
			return null;
		}
	}

	/**
	 * Verifies the availability of a state by its name.
	 *
	 * @param stateName - A string representing the name of the state to verify.
	 * @returns A Promise that resolves with true if the state exists, otherwise resolves with false.
	 */
	private async verifyStateAvailable(stateName: string): Promise<boolean> {
		const stateObject = await this.adapter.getObjectAsync(stateName); // Check state existence
		if (!stateObject) {
			this.adapter.log.debug(`[verifyStateAvailable](${stateName}): State does not exist.`);
			return false;
		}
		return true;
	}

	/**
	 * Get foreign state value
	 * @param {string}      stateName  - Full path to state, like 0_userdata.0.other.isSummer
	 * @return {Promise<*>}            - State value, or null if error
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async asyncGetForeignStateVal(stateName: string): Promise<any | null> {
		try {
			const stateObject = await this.asyncGetForeignState(stateName);
			if (stateObject == null) return null; // errors thrown already in asyncGetForeignState()
			return stateObject.val;
		} catch (error) {
			this.adapter.log.error(`[asyncGetForeignStateValue](${stateName}): ${error}`);
			return null;
		}
	}

	/**
	 * Get foreign state
	 *
	 * @param {string}      stateName  - Full path to state, like 0_userdata.0.other.isSummer
	 * @return {Promise<object>}       - State object: {val: false, ack: true, ts: 1591117034451, …}, or null if error
	 */
	private async asyncGetForeignState(stateName: string): Promise<ioBroker.State | null | undefined> {
		try {
			const stateObject = await this.adapter.getForeignObjectAsync(stateName); // Check state existence
			if (!stateObject) {
				throw `State '${stateName}' does not exist.`;
			} else {
				// Get state value, so like: {val: false, ack: true, ts: 1591117034451, …}
				const stateValueObject = await this.adapter.getForeignStateAsync(stateName);
				if (!this.isLikeEmpty(stateValueObject)) {
					return stateValueObject;
				} else {
					throw `Unable to retrieve info from state '${stateName}'.`;
				}
			}
		} catch (error) {
			this.adapter.log.error(`[asyncGetForeignState](${stateName}): ${error}`);
			return null;
		}
	}

	/**
	 * Checks if the given input variable is effectively empty.
	 *
	 * This method examines the provided `inputVar` to determine if it contains any meaningful data.
	 * It performs a series of transformations to strip out whitespace and common punctuation, then checks if the result is an empty string.
	 *
	 * @param inputVar - The state variable to check, which can be of type `ioBroker.State`, `null`, or `undefined`.
	 * @returns A boolean indicating whether the input variable is considered empty (`true` if empty, `false` otherwise).
	 */
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

	/**
	 * Checks if a string state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - A string representing the name of the state.
	 * @param value - The string value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	protected async checkAndSetValue(
		stateName: string,
		value: string,
		description = "-",
		writeable = false,
		dontUpdate = false,
		forceMode = false,
	): Promise<void> {
		if (value != undefined) {
			if (value.trim().length > 0) {
				const commonObj: ioBroker.StateCommon = {
					name: stateName,
					type: "string",
					role: "text",
					desc: description,
					read: true,
					write: writeable,
				};
				if (!forceMode) {
					await this.adapter.setObjectNotExistsAsync(stateName, {
						type: "state",
						common: commonObj,
						native: {},
					});
				} else {
					await this.adapter.setObjectAsync(stateName, {
						type: "state",
						common: commonObj,
						native: {},
					});
				}
				if (!dontUpdate || (await this.adapter.getStateAsync(stateName)) === null) {
					await this.adapter.setState(stateName, { val: value, ack: true });
				}
			}
		}
	}

	/**
	 * Checks if a number state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - A string representing the name of the state.
	 * @param value - The number value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param unit - Optional unit string to set for the state (default is undefined).
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	async checkAndSetValueNumber(
		stateName: string,
		value: number,
		description = "-",
		unit?: string,
		writeable = false,
		dontUpdate = false,
		forceMode = false,
	): Promise<void> {
		if (value || value === 0) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName,
				type: "number",
				role: "value",
				desc: description,
				read: true,
				write: writeable,
			};
			// Add unit only if it's provided and not null or undefined
			if (unit !== null && unit !== undefined) {
				commonObj.unit = unit;
			}
			if (!forceMode) {
				await this.adapter.setObjectNotExistsAsync(stateName, {
					type: "state",
					common: commonObj,
					native: {},
				});
			} else {
				await this.adapter.setObjectAsync(stateName, {
					type: "state",
					common: commonObj,
					native: {},
				});
			}

			if (!dontUpdate || (await this.adapter.getStateAsync(stateName)) === null) {
				await this.adapter.setState(stateName, { val: value, ack: true });
			}
		}
	}

	/**
	 * Checks if a boolean state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - A string representing the name of the state.
	 * @param value - The boolean value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	async checkAndSetValueBoolean(stateName: string, value: boolean, description = "-", writeable = false, dontUpdate = false): Promise<void> {
		if (value !== undefined && value !== null) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName,
				type: "boolean",
				role: "indicator",
				desc: description,
				read: true,
				write: writeable,
			};

			if (stateName.split(".").pop() === stateName) {
				await this.adapter.setObjectNotExistsAsync(stateName, {
					type: "state",
					common: commonObj,
					native: {},
				});
			} else {
				await this.adapter.setObjectAsync(stateName, {
					type: "state",
					common: commonObj,
					native: {},
				});
			}
			// Update the state value if not in don't update mode or the state does not exist
			if (!dontUpdate || (await this.adapter.getStateAsync(stateName)) === null) {
				await this.adapter.setState(stateName, { val: value, ack: true });
			}
		}
	}
}
