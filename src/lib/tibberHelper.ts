import * as utils from "@iobroker/adapter-core";

export enum enCalcType {
	BestCost = 1,
	BestSingleHours = 2,
	BestHoursBlock = 3,
	BestCostLTF = 4,
	BestSingleHoursLTF = 5,
	BestHoursBlockLTF = 6,
	SmartBatteryBuffer = 7,
	//BestCostMaxHours = 8,
}

export function getCalcTypeDescription(calcType: enCalcType): string {
	switch (calcType) {
		case enCalcType.BestCost:
			return `best cost`;
		case enCalcType.BestSingleHours:
			return `best single hours`;
		case enCalcType.BestHoursBlock:
			return `best hours block`;
		case enCalcType.BestCostLTF:
			return `best cost LTF`;
		case enCalcType.BestSingleHoursLTF:
			return `best single hours LTF`;
		case enCalcType.BestHoursBlockLTF:
			return `best hours block LTF`;
		case enCalcType.SmartBatteryBuffer:
			return `smart battery buffer`;
		//case enCalcType.BestCostMaxHours:
		//return "best cost max hours";
		default:
			return "Unknown";
	}
}

export interface IHomeInfo {
	ID: string;
	NameInApp: string;
	RealTime: boolean;
	FeedActive: boolean;
	PriceDataPollActive: boolean;
}

export class TibberHelper {
	adapter: utils.AdapterInstance;

	constructor(adapter: utils.AdapterInstance) {
		this.adapter = adapter;
	}

	protected getStatePrefix(homeId: string, space: string, id: string, name?: string): { [key: string]: string } {
		const statePrefix = {
			key: name ? name : id,
			value: `Homes.${homeId}.${space}.${id}`,
		};
		return statePrefix;
	}

	protected getStatePrefixLocal(pulse: number, id: string, name?: string): { [key: string]: string } {
		const statePrefix = {
			key: name ? name : id,
			value: `LocalPulse.${pulse}.${id}`,
		};
		return statePrefix;
	}

	/**
	 * Retrieves the value of a given state by its name.
	 *
	 * @param stateName - A string representing the name of the state to retrieve.
	 * @returns A Promise that resolves with the value of the state if it exists, otherwise resolves with null.
	 */
	protected async getStateValue(stateName: string): Promise<any | null> {
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
	private async getState(stateName: string): Promise<any> {
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
	private async verifyStateAvailable(stateName: string): Promise<any> {
		const stateObject = await this.adapter.getObjectAsync(stateName); // Check state existence
		if (!stateObject) {
			this.adapter.log.debug(`[verifyStateAvailable](${stateName}): State does not exist.`);
			return false;
		}
		return true;
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
	 * @param stateName - An object containing the key and value for the name of the state.
	 * @param value - The string value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	protected async checkAndSetValue(
		stateName: { [key: string]: string },
		value: string,
		description: string = "-",
		writeable: boolean = false,
		dontUpdate: boolean = false,
		forceMode: boolean = false,
	): Promise<void> {
		if (value != undefined) {
			if (value.trim().length > 0) {
				const commonObj: ioBroker.StateCommon = {
					name: stateName.key,
					type: "string",
					role: "text",
					desc: description,
					read: true,
					write: writeable,
				};
				if (!forceMode) {
					await this.adapter.setObjectNotExistsAsync(stateName.value, {
						type: "state",
						common: commonObj,
						native: {},
					});
				} else {
					await this.adapter.setObjectAsync(stateName.value, {
						type: "state",
						common: commonObj,
						native: {},
					});
				}
				if (!dontUpdate || (await this.adapter.getStateAsync(stateName.value)) === null) {
					await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
				}
			}
		}
	}

	/**
	 * Checks if a number state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - An object containing the key and value for the name of the state.
	 * @param value - The number value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param unit - Optional unit string to set for the state (default is undefined).
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	protected async checkAndSetValueNumber(
		stateName: { [key: string]: string },
		value: number,
		description: string = "-",
		unit?: string,
		writeable: boolean = false,
		dontUpdate: boolean = false,
		forceMode: boolean = false,
	): Promise<void> {
		if (value || value === 0) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName.key,
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
				await this.adapter.setObjectNotExistsAsync(stateName.value, {
					type: "state",
					common: commonObj,
					native: {},
				});
			} else {
				await this.adapter.setObjectAsync(stateName.value, {
					type: "state",
					common: commonObj,
					native: {},
				});
			}

			if (!dontUpdate || (await this.adapter.getStateAsync(stateName.value)) === null) {
				await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
			}
		}
	}

	/**
	 * Checks if a boolean state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - An object containing the key and value for the name of the state.
	 * @param value - The boolean value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	protected async checkAndSetValueBoolean(
		stateName: { [key: string]: string },
		value: boolean,
		description: string = "-",
		writeable: boolean = false,
		dontUpdate: boolean = false,
	): Promise<void> {
		if (value !== undefined && value !== null) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName.key,
				type: "boolean",
				role: "indicator",
				desc: description,
				read: true,
				write: writeable,
			};

			if (stateName.value.split(".").pop() === stateName.key) {
				await this.adapter.setObjectNotExistsAsync(stateName.value, {
					type: "state",
					common: commonObj,
					native: {},
				});
			} else {
				await this.adapter.setObjectAsync(stateName.value, {
					type: "state",
					common: commonObj,
					native: {},
				});
			}
			// Update the state value if not in don't update mode or the state does not exist
			if (!dontUpdate || (await this.adapter.getStateAsync(stateName.value)) === null) {
				await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
			}
		}
	}

	/**
	 * Generates a formatted error message based on the provided error object and context.
	 *
	 * @param error - The error object containing information about the error, such as status and error messages.
	 * @param context - A string providing context for where the error occurred.
	 * @returns A string representing the formatted error message.
	 */
	public generateErrorMessage(error: any, context: string): string {
		let errorMessages = "";
		// Check if error object has an 'errors' property that is an array
		if (error.errors && Array.isArray(error.errors)) {
			// Iterate over the array of errors and concatenate their messages
			for (const err of error.errors) {
				if (errorMessages) errorMessages += ", ";
				errorMessages += err.message;
			}
		} else if (error.message) {
			errorMessages = error.message; // If 'errors' array is not present, use the 'message' property of the error object
		} else {
			errorMessages = "Unknown error"; // If no 'errors' or 'message' property is found, default to "Unknown error"
		}
		// Construct the final error message string with status, context, and error messages
		return `Error (${error.statusMessage || error.statusText || "Unknown Status"}) occurred during: -${context}- : ${errorMessages}`;
	}
}
