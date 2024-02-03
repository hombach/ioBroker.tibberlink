"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberHelper = exports.enCalcType = void 0;
var enCalcType;
(function (enCalcType) {
    enCalcType[enCalcType["BestCost"] = 1] = "BestCost";
    enCalcType[enCalcType["BestSingleHours"] = 2] = "BestSingleHours";
    enCalcType[enCalcType["BestHoursBlock"] = 3] = "BestHoursBlock";
    enCalcType[enCalcType["BestCostLTF"] = 4] = "BestCostLTF";
    enCalcType[enCalcType["BestSingleHoursLTF"] = 5] = "BestSingleHoursLTF";
    enCalcType[enCalcType["BestHoursBlockLTF"] = 6] = "BestHoursBlockLTF";
    enCalcType[enCalcType["SmartBatteryBuffer"] = 7] = "SmartBatteryBuffer";
    //BestCostMaxHours = 8,
})(enCalcType || (exports.enCalcType = enCalcType = {}));
class TibberHelper {
    constructor(adapter) {
        this.adapter = adapter;
    }
    getStatePrefix(homeId, space, id, name) {
        const statePrefix = {
            key: name ? name : id,
            value: `Homes.${homeId}.${space}.${id}`,
        };
        return statePrefix;
    }
    async getStateValue(stateName) {
        try {
            const stateObject = await this.getState(stateName);
            return stateObject?.val ?? null; // errors have already been handled in getState()
        }
        catch (error) {
            this.adapter.log.error(`[getStateValue](${stateName}): ${error}`);
            return null;
        }
    }
    async getState(stateName) {
        try {
            if (await this.verifyStateAvailable(stateName)) {
                // Get state value, so like: {val: false, ack: true, ts: 1591117034451, �}
                const stateValueObject = await this.adapter.getStateAsync(stateName);
                if (!this.isLikeEmpty(stateValueObject)) {
                    return stateValueObject;
                }
                else {
                    throw `Unable to retrieve info from state '${stateName}'.`;
                }
            }
        }
        catch (error) {
            this.adapter.log.error(`[asyncGetState](${stateName}): ${error}`);
            return null;
        }
    }
    async verifyStateAvailable(stateName) {
        const stateObject = await this.adapter.getObjectAsync(stateName); // Check state existence
        if (!stateObject) {
            this.adapter.log.debug(`[verifyStateAvailable](${stateName}): State does not exist.`);
            return false;
        }
        return true;
    }
    isLikeEmpty(inputVar) {
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
            }
            else {
                return true;
            }
        }
        else {
            return true;
        }
    }
    /**
     * Checks if a string state exists, creates it if necessary, and updates its value.
     *
     * @param stateName - An object containing the key and value for the name of the state.
     * @param value - The string value to set for the state.
     * @param description - Optional description for the state.
     * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
     * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
     * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
     */
    async checkAndSetValue(stateName, value, description, writeable, dontUpdate) {
        if (description === undefined)
            description = "";
        if (writeable === undefined)
            writeable = false;
        if (dontUpdate === undefined)
            dontUpdate = false;
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
                        write: writeable,
                    },
                    native: {},
                });
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
     * @param description - Optional description for the state.
     * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
     * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
     * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
     */
    async checkAndSetValueNumber(stateName, value, description, writeable, dontUpdate) {
        if (description === undefined)
            description = "";
        if (writeable === undefined)
            writeable = false;
        if (dontUpdate === undefined)
            dontUpdate = false;
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
            if (!dontUpdate || (await this.adapter.getStateAsync(stateName.value)) === null) {
                await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
            }
        }
    }
    /**
     * Checks if a number state with named unit exists, creates it if necessary, and updates its value.
     *
     * @param stateName - An object containing the key and value for the name of the state.
     * @param value - The number value to set for the state.
     * @param unit - The unit string to set for the state.
     * @param description - Optional description for the state.
     * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
     * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
     */
    async checkAndSetValueNumberUnit(stateName, value, unit, description, writeable) {
        if (description === undefined)
            description = "";
        if (writeable === undefined)
            writeable = false;
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
                    write: writeable,
                },
                native: {},
            });
            await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
        }
    }
    /**
     * Checks if a boolean state exists, creates it if necessary, and updates its value.
     *
     * @param stateName - An object containing the key and value for the name of the state.
     * @param value - The boolean value to set for the state.
     * @param description - Optional description for the state.
     * @param writeable - Optional boolean indicating if the state should be writeable (default is false).
     * @param dontUpdate - Optional boolean indicating if the state should not be updated if it already exists (default is false).
     * @returns A Promise that resolves when the state is checked, created (if necessary), and updated.
     */
    async checkAndSetValueBoolean(stateName, value, description, writeable, dontUpdate) {
        // Default values for optional parameters
        if (description === undefined)
            description = "";
        if (writeable === undefined)
            writeable = false;
        if (dontUpdate === undefined)
            dontUpdate = false;
        if (value !== undefined && value !== null) {
            if (stateName.value.split(".").pop() === stateName.key) {
                await this.adapter.setObjectNotExistsAsync(stateName.value, {
                    type: "state",
                    common: {
                        name: stateName.key,
                        type: "boolean",
                        role: "indicator",
                        desc: description,
                        read: true,
                        write: writeable,
                    },
                    native: {},
                });
            }
            else {
                await this.adapter.setObjectAsync(stateName.value, {
                    type: "state",
                    common: {
                        name: stateName.key,
                        type: "boolean",
                        role: "indicator",
                        desc: description,
                        read: true,
                        write: writeable,
                    },
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
    generateErrorMessage(error, context) {
        let errorMessages = "";
        // Check if error object has an 'errors' property that is an array
        if (error.errors && Array.isArray(error.errors)) {
            // Iterate over the array of errors and concatenate their messages
            for (const err of error.errors) {
                if (errorMessages)
                    errorMessages += ", ";
                errorMessages += err.message;
            }
        }
        else if (error.message) {
            errorMessages = error.message; // If 'errors' array is not present, use the 'message' property of the error object
        }
        else {
            errorMessages = "Unknown error"; // If no 'errors' or 'message' property is found, default to "Unknown error"
        }
        // Construct the final error message string with status, context, and error messages
        return `Error (${error.statusMessage || error.statusText || "Unknown Status"}) occurred during: -${context}- : ${errorMessages}`;
    }
}
exports.TibberHelper = TibberHelper;
//# sourceMappingURL=tibberHelper.js.map