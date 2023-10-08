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
            if (this.adapter.config.CalculatorList[channel].chTriggerPrice === undefined) {
                this.adapter.config.CalculatorList[channel].chTriggerPrice = 0.1;
            }
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`), this.adapter.config.CalculatorList[channel].chTriggerPrice, `pricelevel to trigger this channel at`, true);
            this.adapter.log.debug(`Setting up TriggerPrice for ${this.adapter.config.CalculatorList[channel].chTriggerPrice}`);
            this.checkAndSetValueBoolean(this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`), this.adapter.config.CalculatorList[channel].chActive, `Whether the calculation channel is active`, true);
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`), this.adapter.config.CalculatorList[channel].chAmountHours, `amount of hours to trigger this channel`, true);
            this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
            // all states changes inside the calculator channel settings namespace are subscribed
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
        }
    }
    async executeCalculatorBestCost(channel) {
        try {
            if (this.adapter.config.CalculatorList[channel].chTriggerPrice <
                (await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.CurrentPrice.total`))) {
                this.adapter.setStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, this.adapter.config.CalculatorList[channel].chValueOn);
            }
            else {
                this.adapter.setStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, this.adapter.config.CalculatorList[channel].chValueOff);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price in channel ${channel}`));
        }
    }
}
exports.TibberCalculator = TibberCalculator;
//# sourceMappingURL=tibberCalculator.js.map