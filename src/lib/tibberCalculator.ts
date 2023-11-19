import * as utils from "@iobroker/adapter-core";
import { IPrice } from "tibber-api/lib/src/models/IPrice";
import { TibberHelper, enCalcType } from "./tibberHelper";

export class TibberCalculator extends TibberHelper {
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
	}

	async setupCalculatorStates(homeId: string, channel: number): Promise<void> {
		try {
			if (this.adapter.config.CalculatorList[channel].chName === undefined) {
				this.adapter.config.CalculatorList[channel].chName = `Channel Name`;
			}
			const channelName = this.adapter.config.CalculatorList[channel].chName;

			//#region *** setup channel folder ***
			let typeDesc: string;
			switch (this.adapter.config.CalculatorList[channel].chType) {
				case enCalcType.BestCost:
					typeDesc = "type: best cost";
					break;
				case enCalcType.BestSingleHours:
					typeDesc = "type: best single hours";
					break;
				case enCalcType.BestHoursBlock:
					typeDesc = "type: best hours block";
					break;
				case enCalcType.BestCostLTF:
					typeDesc = "type: best cost, limited time frame";
					break;
				case enCalcType.BestSingleHoursLTF:
					typeDesc = "type: best single hours, limited time frame";
					break;
				case enCalcType.BestHoursBlockLTF:
					typeDesc = "type: best hours block, limited time frame";
					break;
				default:
					typeDesc = "---";
			}
			await this.adapter.setObjectAsync(`Homes.${homeId}.Calculations.${channel}`, {
				type: "channel",
				common: {
					name: channelName,
					desc: typeDesc,
				},
				native: {},
			});
			//#endregion

			//#region *** setup chActive state object ***
			if (this.adapter.config.CalculatorList[channel].chActive === undefined) {
				this.adapter.config.CalculatorList[channel].chActive = false;
			}
			this.checkAndSetValueBoolean(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `Active`, channelName),
				this.adapter.config.CalculatorList[channel].chActive,
				`Whether the calculation channel is active`,
				true,
				true,
			);
			const valueActive = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.Active`);
			if (typeof valueActive === "boolean") {
				this.adapter.config.CalculatorList[channel].chActive = valueActive;
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to Active: ${this.adapter.config.CalculatorList[channel].chActive}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chActive: ${valueActive}`);
			}
			//#endregion

			//"Best cost": Defined by the "TriggerPrice" state as input.
			//"Best single hours": Defined by the "AmountHours" state as input.
			//"Best hours block": Defined by the "AmountHours" state as input.
			//"Best cost LTF": Defined by the "TriggerPrice", "StartTime", "StopTime" states as input.
			//"Best single hours LTF": Defined by the "AmountHours", "StartTime", "StopTime" states as input.
			//"Best hours block LTF": Defined by the "AmountHours", "StartTime", "StopTime" states as input.
			switch (this.adapter.config.CalculatorList[channel].chType) {
				case enCalcType.BestCost:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					await this.setup_chTriggerPrice(homeId, channel);
					break;
				case enCalcType.BestSingleHours:
				case enCalcType.BestHoursBlock:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					await this.setup_chAmountHours(homeId, channel);
					break;
				case enCalcType.BestCostLTF:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`).value);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					break;
				case enCalcType.BestSingleHoursLTF:
				case enCalcType.BestHoursBlockLTF:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					break;
				default:
					this.adapter.log.error(`Calculator Type for channel ${channel} not set, please do!`);
			}

			//***  subscribeStates  ***
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
			// all states changes inside the calculator channel settings namespace are subscribed
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
		}
	}

	async setup_chTriggerPrice(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
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
			const valueTriggerPrice = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
			if (typeof valueTriggerPrice === "number") {
				this.adapter.config.CalculatorList[channel].chTriggerPrice = valueTriggerPrice;
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to TriggerPrice: ${this.adapter.config.CalculatorList[channel].chTriggerPrice}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chTriggerPrice: ${valueTriggerPrice}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state TriggerPrice for calculator`));
		}
	}
	async setup_chAmountHours(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chAmountHours  ***
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
			const valueAmountHours = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
			if (typeof valueAmountHours === "number") {
				this.adapter.config.CalculatorList[channel].chAmountHours = valueAmountHours;
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to AmountHours: ${this.adapter.config.CalculatorList[channel].chAmountHours}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chTriggerPrice: ${valueAmountHours}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AmountHours for calculator`));
		}
	}
	async setup_chStartTime(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chAmountHours  ***
			if (this.adapter.config.CalculatorList[channel].chStartTime === undefined) {
				const today = new Date();
				today.setHours(0, 0, 0, 0); // sets clock to 0:00
				this.adapter.config.CalculatorList[channel].chStartTime = today;
			}
			this.checkAndSetValue(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`),
				this.adapter.config.CalculatorList[channel].chStartTime.toISOString(),
				`Start time for this channel`,
				true,
				true,
			);
			const valueStartTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StartTime`);
			if (typeof valueStartTime === "string") {
				this.adapter.config.CalculatorList[channel].chStartTime.setTime(Date.parse(valueStartTime));
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to StartTime: ${this.adapter.config.CalculatorList[channel].chStartTime}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chStartTime: ${valueStartTime}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StartTime for calculator`));
		}
	}
	async setup_chStopTime(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chAmountHours  ***
			if (this.adapter.config.CalculatorList[channel].chStopTime === undefined) {
				const today = new Date();
				today.setHours(23, 59, 0, 0); // sets clock to 0:00
				this.adapter.config.CalculatorList[channel].chStopTime = today;
			}
			this.checkAndSetValue(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`),
				this.adapter.config.CalculatorList[channel].chStopTime.toISOString(),
				`Start time for this channel`,
				true,
				true,
			);
			const valueStopTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StopTime`);
			if (typeof valueStopTime === "string") {
				this.adapter.config.CalculatorList[channel].chStopTime.setTime(Date.parse(valueStopTime));
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to StopTime: ${this.adapter.config.CalculatorList[channel].chStopTime}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chStopTime: ${valueStopTime}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StopTime for calculator`));
		}
	}

	async startCalculatorTasks(): Promise<void> {
		if (!this.adapter.config.UseCalculator) return;
		for (const channel in this.adapter.config.CalculatorList) {
			if (
				!this.adapter.config.CalculatorList[channel] ||
				!this.adapter.config.CalculatorList[channel].chTargetState ||
				!this.adapter.config.CalculatorList[channel].chTargetState.trim()
			) {
				this.adapter.log.warn(
					`Empty destination state in calculator channel ${channel} defined - provide correct external state - execution of channel skipped`,
				);
				continue;
			}
			try {
				switch (this.adapter.config.CalculatorList[channel].chType) {
					case enCalcType.BestCost:
						this.executeCalculatorBestCost(parseInt(channel));
						break;
					case enCalcType.BestSingleHours:
						this.executeCalculatorBestSingleHours(parseInt(channel));
						break;
					case enCalcType.BestHoursBlock:
						this.executeCalculatorBestHoursBlock(parseInt(channel));
						break;
					case enCalcType.BestCostLTF:
						this.executeCalculatorBestCost(parseInt(channel), true);
						//ToDo
						break;
					case enCalcType.BestSingleHoursLTF:
						this.executeCalculatorBestSingleHours(parseInt(channel), true);
						//ToDo
						break;
					case enCalcType.BestHoursBlockLTF:
						this.executeCalculatorBestHoursBlock(parseInt(channel), true);
						//ToDo
						break;
					default:
						this.adapter.log.debug(`unknown value for calculator type: ${this.adapter.config.CalculatorList[channel].chType}`);
				}
			} catch (error: any) {
				this.adapter.log.warn(`unhandled error execute calculator channel ${channel}`);
			}
		}
	}

	async executeCalculatorBestCost(channel: number, modeLTF?: boolean): Promise<void> {
		if (modeLTF === undefined) modeLTF = false;
		try {
			let valueToSet: string = "";
			const now = new Date();
			if (!this.adapter.config.CalculatorList[channel].chActive) {
				// not active
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now < this.adapter.config.CalculatorList[channel].chStartTime) {
				// chActive but before LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now > this.adapter.config.CalculatorList[channel].chStopTime) {
				// chActive but after LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
			} else {
				// chActive and inside LTF -> choose desired value
				const currentPrice = await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.CurrentPrice.total`);
				if (this.adapter.config.CalculatorList[channel].chTriggerPrice > currentPrice) {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
				} else {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				}
			}
			this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(valueToSet));
			this.adapter.log.debug(
				`calculator channel: ${channel}-best price ${modeLTF ? "LTF" : ""}; setting state: ${
					this.adapter.config.CalculatorList[channel].chTargetState
				} to ${valueToSet}`,
			);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price  ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}

	async executeCalculatorBestSingleHours(channel: number, modeLTF?: boolean): Promise<void> {
		if (modeLTF === undefined) modeLTF = false;
		try {
			let valueToSet: string = "";
			const now = new Date();
			if (!this.adapter.config.CalculatorList[channel].chActive) {
				// not active -> choose chValueOff
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now < this.adapter.config.CalculatorList[channel].chStartTime) {
				// chActive but before LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now > this.adapter.config.CalculatorList[channel].chStopTime) {
				// chActive but after LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
			} else {
				// chActive -> choose desired value
				const pricesToday: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.jsonBYpriceASC`),
				);

				// NEW
				let mergedPrices: IPrice[] = pricesToday;
				let filteredPrices: IPrice[] = pricesToday;
				if (modeLTF) {
					const pricesTomorrow: IPrice[] = JSON.parse(
						await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesTomorrow.json`),
					);
					// Merge prices if pricesTomorrow is not empty
					if (pricesTomorrow.length !== 0) {
						mergedPrices = [...pricesToday, ...pricesTomorrow];
					}
					const startTime = this.adapter.config.CalculatorList[channel].chStartTime;
					const stopTime = this.adapter.config.CalculatorList[channel].chStopTime;
					// filter objects to time frame
					filteredPrices = mergedPrices.filter((price) => {
						const priceDate = new Date(price.startsAt);
						return priceDate >= startTime && priceDate < stopTime;
					});
				}
				// END NEW

				// get first n entries und test for matching hour
				const n = this.adapter.config.CalculatorList[channel].chAmountHours;
				//const result: boolean[] = pricesToday.slice(0, n).map((entry: IPrice) => checkHourMatch(entry));
				const result: boolean[] = filteredPrices.slice(0, n).map((entry: IPrice) => checkHourMatch(entry));

				// identify if any element is true
				if (result.some((value) => value)) {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
				} else {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				}
				this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(valueToSet));
				this.adapter.log.debug(
					`calculator channel: ${channel}-best single hours ${modeLTF ? "LTF" : ""}; setting state: ${
						this.adapter.config.CalculatorList[channel].chTargetState
					} to ${valueToSet}`,
				);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best single hours ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}

	async executeCalculatorBestHoursBlock(channel: number, modeLTF?: boolean): Promise<void> {
		if (modeLTF === undefined) modeLTF = false;
		try {
			let valueToSet: string = "";
			const now = new Date();
			if (!this.adapter.config.CalculatorList[channel].chActive) {
				// not active -> choose chValueOff
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now < this.adapter.config.CalculatorList[channel].chStartTime) {
				// chActive but before LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now > this.adapter.config.CalculatorList[channel].chStopTime) {
				// chActive but after LTF
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
			} else {
				//const currentDateTime = new Date();
				const pricesToday: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.json`),
				);

				// NEW
				const pricesTomorrow: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesTomorrow.json`),
				);
				if (modeLTF && pricesTomorrow.length !== 0) {
					//const mergedPrice: IPrice = { ...pricesToday, ...pricesTomorrow };
				} else {
					//const mergedPrice: IPrice = pricesToday;
				}
				// END NEW

				let minSum = Number.MAX_VALUE;
				let startIndex = 0;
				const n = this.adapter.config.CalculatorList[channel].chAmountHours;

				for (let i = 0; i < pricesToday.length - n + 1; i++) {
					let sum = 0;
					for (let j = i; j < i + n; j++) {
						sum += pricesToday[j].total;
					}
					if (sum < minSum) {
						minSum = sum;
						startIndex = i;
					}
				}
				const minSumEntries: boolean[] = pricesToday.slice(startIndex, startIndex + n).map((entry: IPrice) => checkHourMatch(entry));

				// identify if any element is true
				if (minSumEntries.some((value) => value)) {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
				} else {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				}
			}
			this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(valueToSet));
			this.adapter.log.debug(
				`calculator channel: ${channel}-best hours block ${modeLTF ? "LTF" : ""}; setting state: ${
					this.adapter.config.CalculatorList[channel].chTargetState
				} to ${valueToSet}`,
			);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best hours block ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}
}

// function to check for equal hour values of given to current
function checkHourMatch(entry: IPrice): boolean {
	const currentDateTime = new Date();
	const startDateTime = new Date(entry.startsAt);
	return currentDateTime.getHours() === startDateTime.getHours();
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
