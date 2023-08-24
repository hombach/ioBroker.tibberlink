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
    async getValue(stateName) {
        const value = await this.adapter.getStateAsync(stateName);
        return value;
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