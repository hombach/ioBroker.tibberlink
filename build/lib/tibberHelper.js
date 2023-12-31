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
    async checkAndSetValue(stateName, value, description, writeable, dontUpdate) {
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
    async checkAndSetValueNumber(stateName, value, description, writeable, dontUpdate) {
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
    async checkAndSetValueNumberUnit(stateName, value, unit, description, writeable) {
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
    async checkAndSetValueBoolean(stateName, value, description, writeable, dontUpdate) {
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
            if (!dontUpdate || (await this.adapter.getStateAsync(stateName.value)) === null) {
                await this.adapter.setStateAsync(stateName.value, { val: value, ack: true });
            }
        }
    }
    generateErrorMessage(error, context) {
        let errorMessages = "";
        for (const index in error.errors) {
            if (errorMessages)
                errorMessages += ", ";
            errorMessages += error.errors[index].message;
        }
        return `Error (${error.statusMessage}) occured during: -${context}- : ${errorMessages}`;
    }
}
exports.TibberHelper = TibberHelper;
//# sourceMappingURL=tibberHelper.js.map