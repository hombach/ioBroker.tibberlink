"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberHelper = void 0;
class TibberHelper {
    constructor(adapter) {
        this.adapter = adapter;
    }
    getStatePrefix(homeId, space, name) {
        const statePrefix = {
            key: name,
            value: "Homes." + homeId + "." + space + "." + name,
        };
        return statePrefix;
    }
    async checkAndSetValue(stateName, value, description) {
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
                await this.adapter.setStateAsync(stateName.value, value, true);
            }
        }
    }
    async getStateValue(stateName) {
        try {
            const stateObject = await this.getState(stateName);
            if (stateObject == null)
                return null; // errors thrown already in GetState()
            return stateObject.val;
        }
        catch (e) {
            this.adapter.log.error(`[getStateValue](${stateName}): ${e}`);
            return null;
        }
    }
    async getState(stateName) {
        try {
            const stateObject = await this.adapter.getObjectAsync(stateName); // Check state existence
            if (!stateObject) {
                throw `State '${stateName}' does not exist.`;
            }
            else { // Get state value, so like: {val: false, ack: true, ts: 1591117034451, �}
                const stateValueObject = await this.adapter.getStateAsync(stateName);
                if (!this.isLikeEmpty(stateValueObject)) {
                    return stateValueObject;
                }
                else {
                    throw `Unable to retrieve info from state '${stateName}'.`;
                }
            }
        }
        catch (e) {
            this.adapter.log.error(`[asyncGetState](${stateName}): ${e}`);
            return null;
        }
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
    async checkAndSetValueNumber(stateName, value, description) {
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
    async checkAndSetValueNumberUnit(stateName, value, unit, description) {
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
    async checkAndSetValueBoolean(stateName, value, description) {
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
    generateErrorMessage(error, context) {
        let errorMessages = "";
        for (const index in error.errors) {
            if (errorMessages) {
                errorMessages += ", ";
            }
            errorMessages += error.errors[index].message;
        }
        //return "Error (" + error.statusMessage + ") occured during: " + context + ": " + errorMessages;
        return `Error (${error.statusMessage}) occured during: ${context} : ${errorMessages}`;
    }
}
exports.TibberHelper = TibberHelper;
//# sourceMappingURL=tibberHelper.js.map