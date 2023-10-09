import * as utils from "@iobroker/adapter-core";
import { TibberHelper } from "./tibberHelper";

export class TibberCalculator extends TibberHelper {
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
	}

	async setupCalculatorStates(homeId: string, channel: number): Promise<void> {
		try {
			if (this.adapter.config.CalculatorList[channel].chTriggerPrice === undefined) {
				this.adapter.config.CalculatorList[channel].chTriggerPrice = 0;
			}
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`),
				this.adapter.config.CalculatorList[channel].chTriggerPrice,
				`pricelevel to trigger this channel at`,
				true,
			);
			this.checkAndSetValueBoolean(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`),
				this.adapter.config.CalculatorList[channel].chActive,
				`Whether the calculation channel is active`,
				true,
			);
			if (this.adapter.config.CalculatorList[channel].chAmountHours === undefined) {
				this.adapter.config.CalculatorList[channel].chAmountHours = 0;
			}
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`),
				this.adapter.config.CalculatorList[channel].chAmountHours,
				`amount of hours to trigger this channel`,
				true,
			);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
			// all states changes inside the calculator channel settings namespace are subscribed
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
		}
	}

	async executeCalculatorBestCost(channel: number): Promise<void> {
		try {
			if (
				this.adapter.config.CalculatorList[channel].chTriggerPrice <
				(await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.CurrentPrice.total`))
			) {
				this.adapter.setStateAsync(
					this.adapter.config.CalculatorList[channel].chTargetState,
					convertValue(this.adapter.config.CalculatorList[channel].chValueOn),
				);
			} else {
				this.adapter.setStateAsync(
					this.adapter.config.CalculatorList[channel].chTargetState,
					convertValue(this.adapter.config.CalculatorList[channel].chValueOff),
				);
			}
			this.adapter.log.debug(`calculator channel ${channel} set state ${this.adapter.config.CalculatorList[channel].chTargetState}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price in channel ${channel}`));
		}
	}
}

function convertValue(Value: string): boolean | number | string {
	if (Value.toLowerCase() === "true") {
		return true;
	} else if (Value.toLowerCase() === "false") {
		return false;
	} else {
		const numericValue = parseFloat(Value);
		return isNaN(numericValue) ? Value : numericValue;
	}
}
