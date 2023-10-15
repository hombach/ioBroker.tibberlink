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
                this.adapter.config.CalculatorList[channel].chTriggerPrice = 0;
            }
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`), this.adapter.config.CalculatorList[channel].chTriggerPrice, `pricelevel to trigger this channel at`, true, true);
            if (this.adapter.config.CalculatorList[channel].chActive === undefined) {
                this.adapter.config.CalculatorList[channel].chActive = false;
            }
            this.checkAndSetValueBoolean(this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`), this.adapter.config.CalculatorList[channel].chActive, `Whether the calculation channel is active`, true, true);
            if (this.adapter.config.CalculatorList[channel].chAmountHours === undefined) {
                this.adapter.config.CalculatorList[channel].chAmountHours = 0;
            }
            this.checkAndSetValueNumber(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`), this.adapter.config.CalculatorList[channel].chAmountHours, `amount of hours to trigger this channel`, true, true);
            this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
            // all states changes inside the calculator channel settings namespace are subscribed
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
        }
    }
    async startCalculatorTasks() {
        if (this.adapter.config.UseCalculator) {
            for (const channel in this.adapter.config.CalculatorList) {
                try {
                    switch (this.adapter.config.CalculatorList[channel].chType) {
                        case tibberHelper_1.enCalcType.BestCost:
                            this.executeCalculatorBestCost(parseInt(channel));
                            break;
                        case tibberHelper_1.enCalcType.BestSingleHours:
                            this.executeCalculatorBestSingleHours(parseInt(channel));
                            break;
                        case tibberHelper_1.enCalcType.BestHoursBlock:
                            //this.executeCalculatorBestHoursBlock(parseInt(channel));
                            break;
                        default:
                            this.adapter.log.debug(`unknown value for calculator type: ${this.adapter.config.CalculatorList[channel].chType}`);
                    }
                }
                catch (error) {
                    this.adapter.log.warn(`unhandled error execute calculator channel ${channel}`);
                }
            }
        }
    }
    async executeCalculatorBestCost(channel) {
        try {
            const currentPrice = await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.CurrentPrice.total`);
            if (this.adapter.config.CalculatorList[channel].chTriggerPrice > currentPrice && this.adapter.config.CalculatorList[channel].chActive) {
                this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(this.adapter.config.CalculatorList[channel].chValueOn));
            }
            else {
                this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(this.adapter.config.CalculatorList[channel].chValueOff));
            }
            this.adapter.log.debug(`calculator channel: ${channel} setting state: ${this.adapter.config.CalculatorList[channel].chTargetState}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price in channel ${channel}`));
        }
    }
    async executeCalculatorBestSingleHours(channel) {
        try {
            this.adapter.log.debug(`TEST 1 - ${channel}`);
            const currentDateTime = new Date();
            this.adapter.log.debug(`TEST 2 - ${currentDateTime}`);
            const jsonPrices = JSON.parse(await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.json`));
            // function to check for equal hour values
            function checkHourMatch(entry) {
                const startDateTime = new Date(entry.startsAt);
                return currentDateTime.getHours() === startDateTime.getHours();
            }
            // get first n entries und test for matching hour
            const n = this.adapter.config.CalculatorList[channel].chAmountHours;
            this.adapter.log.debug(`TEST n - ${n}`);
            const result = jsonPrices.slice(0, n).map((entry) => checkHourMatch(entry));
            this.adapter.log.debug(`TEST 3 - ${result[0]}`);
            // identify if any element is true
            const isAnyTrue = result.some((value) => value);
            this.adapter.log.debug(`TEST 4 - ${isAnyTrue}`);
            if (isAnyTrue) {
                this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(this.adapter.config.CalculatorList[channel].chValueOn));
            }
            else {
                this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(this.adapter.config.CalculatorList[channel].chValueOff));
            }
            this.adapter.log.debug(`calculator channel: ${channel} setting state: ${this.adapter.config.CalculatorList[channel].chTargetState}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best single hours in channel ${channel}`));
        }
    }
    async executeCalculatorBestHoursBlock(channel) {
        try {
            if (false) {
            }
            else {
                this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(this.adapter.config.CalculatorList[channel].chValueOff));
            }
            this.adapter.log.debug(`calculator channel: ${channel} setting state: ${this.adapter.config.CalculatorList[channel].chTargetState}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best hours block in channel ${channel}`));
        }
    }
}
exports.TibberCalculator = TibberCalculator;
function convertValue(Value) {
    if (Value.toLowerCase() === "true") {
        return true;
    }
    else if (Value.toLowerCase() === "false") {
        return false;
    }
    else {
        const numericValue = parseFloat(Value);
        return isNaN(numericValue) ? Value : numericValue;
    }
}
//# sourceMappingURL=tibberCalculator.js.map