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
                        role: "String",
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
    async checkAndSetValueNumber(stateName, value, description) {
        if (value != undefined) {
            await this.adapter.setObjectNotExistsAsync(stateName.value, {
                type: "state",
                common: {
                    name: stateName.key,
                    type: "number",
                    role: "Number",
                    desc: description,
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.adapter.setStateAsync(stateName.value, value, true);
        }
    }
    async checkAndSetValueNumberUnit(stateName, value, description, unit) {
        if (value != undefined) {
            await this.adapter.setObjectNotExistsAsync(stateName.value, {
                type: "state",
                common: {
                    name: stateName.key,
                    type: "number",
                    role: "Number",
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
                    role: "Boolean",
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
exports.TibberHelper = TibberHelper;
//# sourceMappingURL=tibberHelper.js.map