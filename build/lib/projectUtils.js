"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUtils = exports.enCalcType = void 0;
exports.getCalcTypeDescription = getCalcTypeDescription;
var enCalcType;
(function (enCalcType) {
    enCalcType[enCalcType["BestCost"] = 1] = "BestCost";
    enCalcType[enCalcType["BestSingleHours"] = 2] = "BestSingleHours";
    enCalcType[enCalcType["BestHoursBlock"] = 3] = "BestHoursBlock";
    enCalcType[enCalcType["BestCostLTF"] = 4] = "BestCostLTF";
    enCalcType[enCalcType["BestSingleHoursLTF"] = 5] = "BestSingleHoursLTF";
    enCalcType[enCalcType["BestHoursBlockLTF"] = 6] = "BestHoursBlockLTF";
    enCalcType[enCalcType["SmartBatteryBuffer"] = 7] = "SmartBatteryBuffer";
    enCalcType[enCalcType["BestPercentage"] = 8] = "BestPercentage";
    enCalcType[enCalcType["BestPercentageLTF"] = 9] = "BestPercentageLTF";
})(enCalcType || (exports.enCalcType = enCalcType = {}));
function getCalcTypeDescription(calcType) {
    const descriptions = {
        [enCalcType.BestCost]: `best cost`,
        [enCalcType.BestSingleHours]: `best single hours`,
        [enCalcType.BestHoursBlock]: `best hours block`,
        [enCalcType.BestCostLTF]: `best cost LTF`,
        [enCalcType.BestSingleHoursLTF]: `best single hours LTF`,
        [enCalcType.BestHoursBlockLTF]: `best hours block LTF`,
        [enCalcType.SmartBatteryBuffer]: `smart battery buffer`,
        [enCalcType.BestPercentage]: `best percentage`,
        [enCalcType.BestPercentageLTF]: `best percentage LTF`,
    };
    return descriptions[calcType] || `Unknown`;
}
class ProjectUtils {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async getStateValue(stateName) {
        try {
            const stateObject = await this.getState(stateName);
            return stateObject?.val ?? null;
        }
        catch (error) {
            this.adapter.log.error(`[getStateValue](${stateName}): ${error}`);
            return null;
        }
    }
    async getState(stateName) {
        try {
            if (await this.verifyStateAvailable(stateName)) {
                const stateValueObject = await this.adapter.getStateAsync(stateName);
                if (!this.isLikeEmpty(stateValueObject)) {
                    return stateValueObject;
                }
                throw new Error(`Unable to retrieve info from state '${stateName}'.`);
            }
        }
        catch (error) {
            this.adapter.log.error(`[asyncGetState](${stateName}): ${error}`);
            return null;
        }
    }
    async verifyStateAvailable(stateName) {
        const stateObject = await this.adapter.getObjectAsync(stateName);
        if (!stateObject) {
            this.adapter.log.debug(`[verifyStateAvailable](${stateName}): State does not exist.`);
            return false;
        }
        return true;
    }
    async asyncGetForeignStateVal(stateName) {
        try {
            const stateObject = await this.asyncGetForeignState(stateName);
            if (stateObject == null) {
                return null;
            }
            return stateObject.val;
        }
        catch (error) {
            this.adapter.log.error(`[asyncGetForeignStateValue](${stateName}): ${error}`);
            return null;
        }
    }
    async asyncGetForeignState(stateName) {
        try {
            const stateObject = await this.adapter.getForeignObjectAsync(stateName);
            if (!stateObject) {
                throw new Error(`State '${stateName}' does not exist.`);
            }
            else {
                const stateValueObject = await this.adapter.getForeignStateAsync(stateName);
                if (!this.isLikeEmpty(stateValueObject)) {
                    return stateValueObject;
                }
                throw new Error(`Unable to retrieve info from state '${stateName}'.`);
            }
        }
        catch (error) {
            this.adapter.log.error(`[asyncGetForeignState](${stateName}): ${error}`);
            return null;
        }
    }
    isLikeEmpty(inputVar) {
        if (typeof inputVar !== "undefined" && inputVar !== null) {
            let sTemp = JSON.stringify(inputVar);
            sTemp = sTemp.replace(/\s+/g, "");
            sTemp = sTemp.replace(/"+/g, "");
            sTemp = sTemp.replace(/'+/g, "");
            sTemp = sTemp.replace(/\[+/g, "");
            sTemp = sTemp.replace(/\]+/g, "");
            sTemp = sTemp.replace(/\{+/g, "");
            sTemp = sTemp.replace(/\}+/g, "");
            if (sTemp !== "") {
                return false;
            }
            return true;
        }
        return true;
    }
    async checkAndSetValue(stateName, value, description = "-", role = "text", writeable = false, dontUpdate = false, forceMode = false) {
        if (value?.trim()?.length) {
            const commonObj = {
                name: stateName.split(".").pop() ?? stateName,
                type: "string",
                role: role,
                desc: description,
                read: true,
                write: writeable,
            };
            await (forceMode
                ? this.adapter.setObject(stateName, { type: "state", common: commonObj, native: {} })
                : this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));
            if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
                await this.adapter.setState(stateName, { val: value, ack: true });
            }
        }
    }
    async checkAndSetValueNumber(stateName, value, description = "-", unit, role = "value", writeable = false, dontUpdate = false, forceMode = false) {
        if (value !== undefined) {
            const commonObj = {
                name: stateName.split(".").pop() ?? stateName,
                type: "number",
                role: role,
                desc: description,
                read: true,
                write: writeable,
            };
            if (unit !== null && unit !== undefined) {
                commonObj.unit = unit;
            }
            await (forceMode
                ? this.adapter.setObject(stateName, { type: "state", common: commonObj, native: {} })
                : this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));
            if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
                await this.adapter.setState(stateName, { val: value, ack: true });
            }
        }
    }
    async checkAndSetValueBoolean(stateName, value, description = "-", role = "indicator", writeable = false, dontUpdate = false, forceMode = false) {
        if (value !== undefined && value !== null) {
            const commonObj = {
                name: stateName.split(".").pop() ?? stateName,
                type: "boolean",
                role: role,
                desc: description,
                read: true,
                write: writeable,
            };
            await (forceMode
                ? this.adapter.setObject(stateName, { type: "state", common: commonObj, native: {} })
                : this.adapter.setObjectNotExistsAsync(stateName, { type: "state", common: commonObj, native: {} }));
            if (!dontUpdate || !(await this.adapter.getStateAsync(stateName))) {
                await this.adapter.setState(stateName, { val: value, ack: true });
            }
        }
    }
    generateErrorMessage(error, context) {
        let errorMessages = "";
        if (error.errors && Array.isArray(error.errors)) {
            for (const err of error.errors) {
                if (errorMessages) {
                    errorMessages += ", ";
                }
                errorMessages += err.message;
            }
        }
        else if (error.message) {
            errorMessages = error.message;
        }
        else {
            errorMessages = "Unknown error";
        }
        return `Error (${error.statusMessage || error.statusText || "Unknown Status"}) occurred during: -${context}- : ${errorMessages}`;
    }
}
exports.ProjectUtils = ProjectUtils;
//# sourceMappingURL=projectUtils.js.map