"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberCalculator = void 0;
const tibberHelper_1 = require("./tibberHelper");
class TibberCalculator extends tibberHelper_1.TibberHelper {
    constructor(adapter) {
        super(adapter);
    }
    async setupCalculatorStates(homeId, channel) {
        try {
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`), this.adapter.config.CalculatorList[parseInt(channel)].chTriggerPrice, "pricelevel to trigger this channel at", true);
            this.checkAndSetValueBoolean(this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`), this.adapter.config.CalculatorList[parseInt(channel)].chActive, "Whether the calculation channel is active", true);
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`), this.adapter.config.CalculatorList[parseInt(channel)].chAmountHours, "amount of hours to trigger this channel", true);
            this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
            // all states changes inside the Calculator channel settings namespace are subscribed
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
        }
    }
    async executeCalculatorBestCost(channel) {
        try {
            if (this.adapter.config.CalculatorList[parseInt(channel)].chTriggerPrice) {
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price in channel ${channel}`));
        }
    }
}
exports.TibberCalculator = TibberCalculator;
//# sourceMappingURL=tibberCalculator.js.map