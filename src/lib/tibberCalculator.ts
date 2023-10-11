import * as utils from "@iobroker/adapter-core";
import { TibberHelper, enCalcType } from "./tibberHelper";

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
				true,
			);
			this.checkAndSetValueBoolean(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`),
				this.adapter.config.CalculatorList[channel].chActive,
				`Whether the calculation channel is active`,
				true,
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
				true,
			);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
			// all states changes inside the calculator channel settings namespace are subscribed
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
		}
	}

	async startCalculatorTasks(): Promise<void> {
		if (this.adapter.config.UseCalculator) {
			for (const channel in this.adapter.config.CalculatorList) {
				try {
					if (this.adapter.config.CalculatorList[channel].chActive) {
						switch (this.adapter.config.CalculatorList[channel].chType) {
							case enCalcType.BestCost:
								this.executeCalculatorBestCost(parseInt(channel));
								break;
							case enCalcType.BestSingleHours:
								//tibberCalculator.executeCalculatorBestSingleHours(parseInt(channel));
								break;
							case enCalcType.BestHoursBlock:
								//tibberCalculator.executeCalculatorBestHoursBlock(parseInt(channel));
								break;
							default:
								this.adapter.log.debug(`unknown value for calculator type: ${this.adapter.config.CalculatorList[channel].chType}`);
						}
					}
				} catch (error: any) {
					this.adapter.log.warn(`unhandled error execute calculator channel ${channel}`);
				}
			}
		}
	}

	async executeCalculatorBestCost(channel: number): Promise<void> {
		try {
			const currentPrice = await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.CurrentPrice.total`);
			//
			this.adapter.log.debug(`currentPrice ${currentPrice} chTriggerPrice ${this.adapter.config.CalculatorList[channel].chTriggerPrice}`);
			//
			if (this.adapter.config.CalculatorList[channel].chTriggerPrice < currentPrice) {
				this.adapter.setForeignStateAsync(
					this.adapter.config.CalculatorList[channel].chTargetState,
					convertValue(this.adapter.config.CalculatorList[channel].chValueOn),
				);
			} else {
				this.adapter.setForeignStateAsync(
					this.adapter.config.CalculatorList[channel].chTargetState,
					convertValue(this.adapter.config.CalculatorList[channel].chValueOff),
				);
			}
			this.adapter.log.debug(`calculator channel: ${channel} setting state: ${this.adapter.config.CalculatorList[channel].chTargetState}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price in channel ${channel}`));
		}
	}

	async executeCalculatorBestSingleHours(channel: number): Promise<void> {
		try {
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best single hours in channel ${channel}`));
		}
	}

	async executeCalculatorBestHoursBlock(channel: number): Promise<void> {
		try {
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best hours block in channel ${channel}`));
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
