import type * as utils from "@iobroker/adapter-core";

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ADAPTER-SPECIFIC SECTION — only for ioBroker.tibberlink. Do NOT copy to other adapters.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export enum enCalcType {
	BestCost = 1,
	BestSingleHours = 2,
	BestHoursBlock = 3,
	BestCostLTF = 4,
	BestSingleHoursLTF = 5,
	BestHoursBlockLTF = 6,
	SmartBatteryBuffer = 7,
	BestPercentage = 8,
	BestPercentageLTF = 9,
	SmartBatteryBufferLTF = 10,
}

/**
 * getCalcTypeDescription
 *
 * @param calcType - ID of calculator channel type
 */
export function getCalcTypeDescription(calcType: enCalcType): string {
	const descriptions: Record<enCalcType, string> = {
		[enCalcType.BestCost]: `best cost`,
		[enCalcType.BestSingleHours]: `best single hours`,
		[enCalcType.BestHoursBlock]: `best hours block`,
		[enCalcType.BestCostLTF]: `best cost LTF`,
		[enCalcType.BestSingleHoursLTF]: `best single hours LTF`,
		[enCalcType.BestHoursBlockLTF]: `best hours block LTF`,
		[enCalcType.SmartBatteryBuffer]: `smart battery buffer`,
		[enCalcType.BestPercentage]: `best percentage`,
		[enCalcType.BestPercentageLTF]: `best percentage LTF`,
		[enCalcType.SmartBatteryBufferLTF]: `smart battery buffer LTF`,
	};
	return descriptions[calcType] || `Unknown`;
}

/**
 * Information about a home configuration.
 */
export interface IHomeInfo {
	/** Unique identifier for the home. */
	ID: string;
	/** Display name of the home in the app. */
	NameInApp: string;
	/** Whether real-time updates are enabled. */
	RealTime: boolean;
	/** Whether the home feed is active. */
	FeedActive: boolean;
	/** Whether price data polling is active. */
	PriceDataPollActive: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════
 * ║  SHARED REGION — class ProjectUtils                                                            ║
 * ║  Keep this block IDENTICAL across all of my own ioBroker adapters                              ║
 * ║  (tibberlink, go-e-charger, chargemaster, goodwe-pv, teslafi, …).                              ║
 * ║  Everything ABOVE this banner is adapter-specific and must NOT be copied.                      ║
 * ║  When you change anything below, bump the date and propagate the block to the other adapters.  ║
 * ║  Last changed: 2026-08-09                                                                      ║
 * ═══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ProjectUtils
 */
export class ProjectUtils {
	adapter: utils.AdapterInstance;

	/**
	 * constructor
	 *
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(adapter: utils.AdapterInstance) {
		this.adapter = adapter;
	}

	/**
	 * Replaces all characters not allowed in ioBroker object IDs with an underscore.
	 *
	 * Use this whenever a segment of an object ID is built from external data,
	 * e.g. names or IDs received from a device API.
	 *
	 * @param text - The raw text to be used as part of an object ID.
	 * @returns The sanitized text, safe for use in object IDs.
	 */
	sanitizeIdSegment(text: string): string {
		return text.replace(this.adapter.FORBIDDEN_CHARS, "_").trim();
	}

	/**
	 * Retrieves the value of a given state by its name.
	 *
	 * @param stateName - A string representing the name of the state to retrieve.
	 * @returns A Promise that resolves with the value of the state if it exists, otherwise resolves with null.
	 */
	async getStateValue(stateName: string): Promise<any> {
		try {
			const stateObject = await this.getState(stateName);
			return stateObject?.val ?? null; // errors have already been handled in getState()
		} catch (error) {
			this.adapter.log.error(`[getStateValue](${stateName}): ${error as Error}`);
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
				// Get state value, so like: {val: false, ack: true, ts: 1591117034451, }
				const stateValueObject = await this.adapter.getStateAsync(stateName);
				if (!this.isLikeEmpty(stateValueObject)) {
					return stateValueObject;
				}
				throw new Error(`Unable to retrieve info from state '${stateName}'.`);
			}
		} catch (error) {
			this.adapter.log.error(`[asyncGetState](${stateName}): ${error as Error}`);
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
	 *
	 * @param stateName - Full path to state, like 0_userdata.0.other.isSummer
	 * @returns State value, or null if error
	 */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	async asyncGetForeignStateVal(stateName: string): Promise<any | null> {
		try {
			const stateObject = await this.asyncGetForeignState(stateName);
			if (stateObject == null) {
				return null;
			} // errors thrown already in asyncGetForeignState()
			return stateObject.val;
		} catch (error) {
			this.adapter.log.error(`[asyncGetForeignStateValue](${stateName}): ${error as Error}`);
			return null;
		}
	}

	/**
	 * Get foreign state
	 *
	 * @param stateName - Full path to state, like 0_userdata.0.other.isSummer
	 * @returns State object: {val: false, ack: true, ts: 1591117034451, …}, or null if error
	 */
	private async asyncGetForeignState(stateName: string): Promise<ioBroker.State | null> {
		try {
			const stateObject = await this.adapter.getForeignObjectAsync(stateName); // Check state existence
			if (!stateObject) {
				throw new Error(`State '${stateName}' does not exist.`);
			} else {
				// Get state value, so like: {val: false, ack: true, ts: 1591117034451, …}
				const stateValueObject = await this.adapter.getForeignStateAsync(stateName);
				if (!this.isLikeEmpty(stateValueObject)) {
					return stateValueObject ?? null;
				}
				throw new Error(`Unable to retrieve info from state '${stateName}'.`);
			}
		} catch (error) {
			this.adapter.log.error(`[asyncGetForeignState](${stateName}): ${error as Error}`);
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
			const sTemp = JSON.stringify(inputVar).replace(/[\s"'[\]{}]/g, "");
			if (sTemp !== "") {
				return false;
			}
			return true;
		}
		return true;
	}

	/**
	 * Checks if a string state exists, creates it if necessary, and updates its value.
	 *
	 * @param stateName - A string representing the name of the state.
	 * @param value - The string value to set for the state.
	 * @param description - Optional description for the state (default is "-").
	 * @param role - Optional role type for the state (default is "text").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	async checkAndSetValue(
		stateName: string,
		value: string,
		description = "-",
		role = "text",
		writeable = false,
		dontUpdate = false,
		forceMode = false,
	): Promise<void> {
		if (value?.trim()?.length) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName.split(".").pop() ?? stateName,
				type: "string",
				role: role,
				desc: description,
				read: true,
				write: writeable,
			};
			// forceMode uses extendObject (merge) instead of setObject, so user customizations
			// (e.g. history/logging settings) on the state are preserved across restarts (see #927 / S5054).
			await (forceMode
				? this.adapter.extendObject(stateName, { type: "state", common: commonObj, native: {} })
				: this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));

			if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
				await this.adapter.setState(stateName, { val: value, ack: true });
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
	 * @param role - Optional role type for the state (default is "value").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be reinitiated if it already exists (default is false).
	 * @param min - Optional number setting allowed value minimum
	 * @param max - Optional number setting allowed value maximum
	 * @param step - Optional number setting value step
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	async checkAndSetValueNumber(
		stateName: string,
		value: number,
		description = "-",
		unit?: string,
		role = "value",
		writeable = false,
		dontUpdate = false,
		forceMode = false,
		min?: number,
		max?: number,
		step?: number,
	): Promise<void> {
		if (value !== undefined) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName.split(".").pop() ?? stateName,
				type: "number",
				role: role,
				desc: description,
				read: true,
				write: writeable,
				// Add unit, min, max and step only if provided and not null/undefined — note that 0 is a valid value!
				...(unit != null ? { unit } : {}),
				...(min != null ? { min } : {}),
				...(max != null ? { max } : {}),
				...(step != null ? { step } : {}),
			};

			await (forceMode
				? this.adapter.extendObject(stateName, { type: "state", common: commonObj, native: {} })
				: this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));

			if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
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
	 * @param role - Optional role type for the state (default is "indicator").
	 * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
	 * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
	 * @param forceMode - Optional boolean indicating if the state should be overwritten if it already exists (default is false).
	 * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
	 */
	async checkAndSetValueBoolean(
		stateName: string,
		value: boolean,
		description = "-",
		role = "indicator",
		writeable = false,
		dontUpdate = false,
		forceMode = false,
	): Promise<void> {
		if (value !== undefined && value !== null) {
			const commonObj: ioBroker.StateCommon = {
				name: stateName.split(".").pop() ?? stateName,
				type: "boolean",
				role: role,
				desc: description,
				read: true,
				write: writeable,
			};

			await (forceMode
				? this.adapter.extendObject(stateName, { type: "state", common: commonObj, native: {} })
				: this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));

			if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
				await this.adapter.setState(stateName, { val: value, ack: true });
			}
		}
	}

	/**
	 * Checks if a folder object exists, creates it if necessary.
	 *
	 * @param folderObjectName - Object ID of the folder (e.g. Charger)
	 * @param name - Display name of the folder
	 * @param icon - Optional icon name/path (e.g. `go-eCharger.png`)
	 * @param forceMode - overwrite existing object
	 * @returns Promise<void>
	 */
	async checkAndSetFolder(folderObjectName: string, name?: string, icon = "", forceMode = false): Promise<void> {
		const commonObj: ioBroker.MetaCommon = {
			type: "meta.folder",
			name: name ?? folderObjectName.split(".").pop() ?? folderObjectName,
			desc: "",
		};
		if (icon) {
			commonObj.icon = icon;
		}
		await (forceMode
			? this.adapter.extendObject(folderObjectName, {
					type: "folder",
					common: commonObj,
					native: {},
				})
			: this.adapter.setObjectNotExistsAsync(folderObjectName, {
					type: "folder",
					common: commonObj,
					native: {},
				}));
	}

	/**
	 * Checks if a device object exists, creates it if necessary.
	 *
	 * @param deviceObjectName - Object ID of the device (e.g. Charger.0)
	 * @param name - Display name of the device (default: derived from ID)
	 * @param onlineId - Optional state ID for online status binding (e.g. `info.connection`)
	 * @param icon - Optional icon name/path (e.g. `go-eCharger.png`)
	 * @param forceMode - Optional boolean indicating if the device should be overwritten if it already exists (default is false).
	 * @returns Promise<void>
	 */
	async checkAndSetDevice(deviceObjectName: string, name?: string, onlineId = "", icon = "", forceMode = false): Promise<void> {
		const commonObj: ioBroker.DeviceCommon = {
			name: name ?? deviceObjectName.split(".").pop() ?? deviceObjectName,
			desc: "",
		};
		if (onlineId) {
			commonObj.statusStates = {
				onlineId,
			};
		}
		if (icon) {
			commonObj.icon = icon;
		}
		await (forceMode
			? this.adapter.extendObject(deviceObjectName, {
					type: "device",
					common: commonObj,
					native: {},
				})
			: this.adapter.setObjectNotExistsAsync(deviceObjectName, {
					type: "device",
					common: commonObj,
					native: {},
				}));
	}

	/**
	 * Checks if a channel object exists, creates it if necessary.
	 *
	 * @param channelObjectName - Object ID of the channel (e.g. Charger.0.Info)
	 * @param name - Display name of the channel (default: derived from ID)
	 * @param icon - Optional icon name/path (e.g. `go-eCharger.png`)
	 * @param forceMode - Optional boolean indicating if the device should be overwritten if it already exists (default is false).
	 * @returns Promise<void>
	 */
	async checkAndSetChannel(channelObjectName: string, name?: string, icon = "", forceMode = false): Promise<void> {
		const commonObj: ioBroker.ChannelCommon = {
			name: name ?? channelObjectName.split(".").pop() ?? channelObjectName,
			desc: "",
		};
		if (icon) {
			commonObj.icon = icon;
		}
		await (forceMode
			? this.adapter.extendObject(channelObjectName, {
					type: "channel",
					common: commonObj,
					native: {},
				})
			: this.adapter.setObjectNotExistsAsync(channelObjectName, {
					type: "channel",
					common: commonObj,
					native: {},
				}));
	}

	/**
	 * Generates a formatted error message based on the provided error object and context.
	 *
	 * @param error - The error object containing information about the error, such as status and error messages.
	 * @param context - A string providing context for where the error occurred.
	 * @returns A string representing the formatted error message.
	 */
	public generateErrorMessage(error: unknown, context: string): string {
		let errorMessages = "";
		// narrow the unknown error to the optional shape we read from
		const err = (error ?? {}) as {
			errors?: { message?: string }[];
			message?: string;
			statusMessage?: string;
			statusText?: string;
		};
		// Check if error object has an 'errors' property that is an array
		if (err.errors && Array.isArray(err.errors)) {
			// Iterate over the array of errors and concatenate their messages
			for (const e of err.errors) {
				if (errorMessages) {
					errorMessages += ", ";
				}
				errorMessages += e.message;
			}
		} else if (err.message) {
			errorMessages = err.message; // If 'errors' array is not present, use the 'message' property of the error object
		} else {
			errorMessages = "Unknown error"; // If no 'errors' or 'message' property is found, default to "Unknown error"
		}
		// Construct the final error message string with status, context, and error messages
		return `Error (${err.statusMessage || err.statusText || "Unknown Status"}) occurred during: -${context}- : ${errorMessages}`;
	}
}
