import * as utils from "@iobroker/adapter-core";
import { addDays, addHours, format } from "date-fns";
import { IPrice } from "tibber-api/lib/src/models/IPrice";
import { TibberHelper, enCalcType } from "./tibberHelper";

export class TibberCalculator extends TibberHelper {
	numBestCost: number;
	numBestSingleHours: number;
	numBestHoursBlock: number;
	numBestCostLTF: number;
	numBestSingleHoursLTF: number;
	numBestHoursBlockLTF: number;
	numSmartBatteryBuffer: number;

	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
		this.numBestCost = 0;
		this.numBestSingleHours = 0;
		this.numBestHoursBlock = 0;
		this.numBestCostLTF = 0;
		this.numBestSingleHoursLTF = 0;
		this.numBestHoursBlockLTF = 0;
		this.numSmartBatteryBuffer = 0;
	}

	initStats(): void {
		this.numBestCost = 0;
		this.numBestSingleHours = 0;
		this.numBestHoursBlock = 0;
		this.numBestCostLTF = 0;
		this.numBestSingleHoursLTF = 0;
		this.numBestHoursBlockLTF = 0;
		this.numSmartBatteryBuffer = 0;
	}

	private increaseStatsValueByOne(type: enCalcType): void {
		switch (type) {
			case enCalcType.BestCost:
				this.numBestCost++;
				break;
			case enCalcType.BestSingleHours:
				this.numBestSingleHours++;
				break;
			case enCalcType.BestHoursBlock:
				this.numBestHoursBlock++;
				break;
			case enCalcType.BestCostLTF:
				this.numBestCostLTF++;
				break;
			case enCalcType.BestSingleHoursLTF:
				this.numBestSingleHoursLTF++;
				break;
			case enCalcType.BestHoursBlockLTF:
				this.numBestHoursBlockLTF++;
				break;
			case enCalcType.SmartBatteryBuffer:
				this.numSmartBatteryBuffer++;
		}
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
				case enCalcType.SmartBatteryBuffer:
					typeDesc = "type: smart battery buffer";
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

			//"best cost": Defined by the "TriggerPrice" state as input.
			//"best single hours": Defined by the "AmountHours" state as input.
			//"best hours block": Defined by the "AmountHours" state as input.
			//"best hours block": Writes data to the "AverageTotalCost", "BlockStartFullHour", "BlockEndFullHour" states as output.
			//"best cost LTF": Defined by the "TriggerPrice", "StartTime", "StopTime", "RepeatDays" states as input.
			//"best single hours LTF": Defined by the "AmountHours", "StartTime", "StopTime", "RepeatDays" states as input.
			//"best hours block LTF": Defined by the "AmountHours", "StartTime", "StopTime", "RepeatDays" states as input.
			//"smart battery buffer": Defined by the "AmountHours", "EfficiencyLoss" states as input.
			switch (this.adapter.config.CalculatorList[channel].chType) {
				case enCalcType.BestCost:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `RepeatDays`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStopTime`).value);
					await this.setup_chTriggerPrice(homeId, channel);
					break;
				case enCalcType.BestSingleHours:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `RepeatDays`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStopTime`).value);
					await this.setup_chAmountHours(homeId, channel);
					break;
				case enCalcType.BestHoursBlock:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `RepeatDays`).value);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chAverageTotalCost(homeId, channel);
					await this.setup_chBlockStartFullHour(homeId, channel);
					await this.setup_chBlockEndFullHour(homeId, channel);
					break;
				case enCalcType.BestCostLTF:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AmountHours`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStopTime`).value);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					break;
				case enCalcType.BestSingleHoursLTF:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStopTime`).value);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					break;
				case enCalcType.BestHoursBlockLTF:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`).value);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					await this.setup_chAverageTotalCost(homeId, channel);
					await this.setup_chBlockStartFullHour(homeId, channel);
					await this.setup_chBlockEndFullHour(homeId, channel);
					break;
				case enCalcType.SmartBatteryBuffer:
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `TriggerPrice`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `StopTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `RepeatDays`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartTime`).value);
					this.adapter.delObjectAsync(this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStopTime`).value);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chEfficiencyLoss(homeId, channel);
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
				this.adapter.log.debug(`Wrong type for chAmountHours: ${valueAmountHours}`);
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
	async setup_chRepeatDays(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chRepeatDays  ***
			if (this.adapter.config.CalculatorList[channel].chRepeatDays === undefined) {
				this.adapter.config.CalculatorList[channel].chRepeatDays = 0;
			}
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `RepeatDays`),
				this.adapter.config.CalculatorList[channel].chRepeatDays,
				`number of days to shift this LTF channel for repetition`,
				true,
				true,
			);
			const valueRepeatDays = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
			if (typeof valueRepeatDays === "number") {
				this.adapter.config.CalculatorList[channel].chRepeatDays = valueRepeatDays;
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to RepeatDays: ${this.adapter.config.CalculatorList[channel].chRepeatDays}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chTriggerPrice: ${valueRepeatDays}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state RepeatDays for calculator`));
		}
	}
	async setup_chEfficiencyLoss(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chEfficiencyLoss  ***
			if (this.adapter.config.CalculatorList[channel].chEfficiencyLoss === undefined) {
				this.adapter.config.CalculatorList[channel].chEfficiencyLoss = 0;
			}
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `EfficiencyLoss`),
				this.adapter.config.CalculatorList[channel].chEfficiencyLoss,
				`efficiency loss between charge and discharge of battery system`,
				true,
				true,
			);
			const valueEfficiencyLoss = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
			if (typeof valueEfficiencyLoss === "number") {
				this.adapter.config.CalculatorList[channel].chAmountHours = valueEfficiencyLoss;
				this.adapter.log.debug(
					`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelName} - set to EfficiencyLoss: ${this.adapter.config.CalculatorList[channel].chEfficiencyLoss}`,
				);
			} else {
				this.adapter.log.debug(`Wrong type for chEfficiencyLoss: ${valueEfficiencyLoss}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state EfficiencyLoss for calculator`));
		}
	}
	async setup_chAverageTotalCost(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `AverageTotalCost`),
				0,
				`average total cost in determined block`,
				false,
				false,
			);
			this.adapter.log.debug(`setup calculator output state AverageTotalCost in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AverageTotalCost for calculator`));
		}
	}
	async setup_chBlockStartFullHour(homeId: string, channel: number, delMode?: boolean): Promise<void> {
		if (delMode === undefined) delMode = false;
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValue(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockStartFullHour`),
				`-`,
				`first hour of determined block`,
				false,
				false,
			);
			if (!delMode) this.adapter.log.debug(`setup calculator output state BlockStartFullHour in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStartFullHour for calculator`));
		}
	}
	async setup_chBlockEndFullHour(homeId: string, channel: number, delMode?: boolean): Promise<void> {
		if (delMode === undefined) delMode = false;
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValue(
				this.getStatePrefix(homeId, `Calculations.${channel}`, `BlockEndFullHour`),
				`-`,
				`end hour of determined block`,
				false,
				false,
			);
			if (!delMode) this.adapter.log.debug(`setup calculator output state BlockEndFullHour in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEndFullHour for calculator`));
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

			if (this.adapter.config.CalculatorList[channel].chType === enCalcType.SmartBatteryBuffer) {
				if (
					!this.adapter.config.CalculatorList[channel] ||
					!this.adapter.config.CalculatorList[channel].chTargetState2 ||
					!this.adapter.config.CalculatorList[channel].chTargetState2.trim()
				) {
					this.adapter.log.warn(
						`Empty second destination state in calculator channel ${channel} defined - provide correct external state 2 - execution of channel skipped`,
					);
					continue;
				}
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
						break;
					case enCalcType.BestSingleHoursLTF:
						this.executeCalculatorBestSingleHours(parseInt(channel), true);
						break;
					case enCalcType.BestHoursBlockLTF:
						this.executeCalculatorBestHoursBlock(parseInt(channel), true);
						break;
					case enCalcType.SmartBatteryBuffer:
						this.executeCalculatorSmartBatteryBuffer(parseInt(channel));
						break;
					default:
						this.adapter.log.debug(`unknown value for calculator type: ${this.adapter.config.CalculatorList[channel].chType}`);
				}
			} catch (error: any) {
				this.adapter.log.warn(`unhandled error execute calculator channel ${channel}`);
			}
		}
	}

	async updateCalculatorUsageStats(): Promise<void> {
		if (!this.adapter.config.UseCalculator) return;
		this.initStats;
		for (const channel in this.adapter.config.CalculatorList) {
			try {
				this.increaseStatsValueByOne(this.adapter.config.CalculatorList[channel].chType);
			} catch (error: any) {
				this.adapter.log.debug(`unhandled error in calculator channel ${channel} scan`);
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
				if (this.adapter.config.CalculatorList[channel].chRepeatDays == 0) {
					// no repeating planned
					this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StopTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStopTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
				}
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
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price ${modeLTF ? "LTF " : ""}in channel ${channel}`));
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
				// chActive but before LTF -> choose chValueOff
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
			} else if (modeLTF && now > this.adapter.config.CalculatorList[channel].chStopTime) {
				// chActive, modeLTF but after LTF -> choose chValueOff and disable channel
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				if (this.adapter.config.CalculatorList[channel].chRepeatDays == 0) {
					this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StopTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStopTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
				}
			} else {
				// chActive -> choose desired value
				const pricesToday: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.jsonBYpriceASC`),
				);

				let filteredPrices: IPrice[] = pricesToday;
				if (modeLTF) {
					// Limited Time Frame mode
					const pricesTomorrow: IPrice[] = JSON.parse(
						await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesTomorrow.json`),
					);
					const startTime = this.adapter.config.CalculatorList[channel].chStartTime;
					const stopTime = this.adapter.config.CalculatorList[channel].chStopTime;

					// Merge prices if pricesTomorrow is not empty
					let mergedPrices: IPrice[] = pricesToday;
					if (pricesTomorrow.length !== 0) {
						mergedPrices = [...pricesToday, ...pricesTomorrow];
					}

					// filter objects to time frame
					filteredPrices = mergedPrices.filter((price) => {
						const priceDate = new Date(price.startsAt);
						return priceDate >= startTime && priceDate < stopTime;
					});
				}

				// get first n entries und test for matching hour
				const n = this.adapter.config.CalculatorList[channel].chAmountHours;
				const result: boolean[] = filteredPrices.slice(0, n).map((entry: IPrice) => checkHourMatch(entry));

				// identify if any element is true
				if (result.some((value) => value)) {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
				} else {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				}
			}
			//set value to foreign state
			this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(valueToSet));
			this.adapter.log.debug(
				`calculator channel: ${channel}-best single hours ${modeLTF ? "LTF" : ""}; setting state: ${
					this.adapter.config.CalculatorList[channel].chTargetState
				} to ${valueToSet}`,
			);
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
				this.setup_chBlockStartFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
				this.setup_chBlockEndFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
			} else if (modeLTF && now < this.adapter.config.CalculatorList[channel].chStartTime) {
				// chActive but before LTF -> choose chValueOff
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				this.setup_chBlockStartFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
				this.setup_chBlockEndFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
			} else if (modeLTF && now > this.adapter.config.CalculatorList[channel].chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				this.setup_chBlockStartFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
				this.setup_chBlockEndFullHour(this.adapter.config.CalculatorList[channel].chHomeID, channel, true);
				if (this.adapter.config.CalculatorList[channel].chRepeatDays == 0) {
					this.adapter.setStateAsync(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setStateAsync(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StopTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStopTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
				}
			} else {
				const pricesToday: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.json`),
				);

				let filteredPrices: IPrice[] = pricesToday;
				if (modeLTF) {
					// Limited Time Frame mode, modify filteredPrices accordingly
					const pricesTomorrow: IPrice[] = JSON.parse(
						await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesTomorrow.json`),
					);
					const startTime: Date = this.adapter.config.CalculatorList[channel].chStartTime;
					const stopTime: Date = this.adapter.config.CalculatorList[channel].chStopTime;

					// Merge prices if pricesTomorrow is not empty
					let mergedPrices: IPrice[] = pricesToday;
					if (pricesTomorrow.length !== 0) {
						mergedPrices = [...pricesToday, ...pricesTomorrow];
					}

					// filter objects to time frame
					filteredPrices = mergedPrices.filter((price) => {
						const priceDate = new Date(price.startsAt);
						return priceDate >= startTime && priceDate < stopTime;
					});
				}

				let minSum = Number.MAX_VALUE;
				let startIndex = 0;
				const n = this.adapter.config.CalculatorList[channel].chAmountHours;

				for (let i = 0; i < filteredPrices.length - n + 1; i++) {
					let sum = 0;
					for (let j = i; j < i + n; j++) {
						sum += filteredPrices[j].total;
					}
					if (sum < minSum) {
						minSum = sum;
						startIndex = i;
					}
				}
				const minSumEntries: boolean[] = filteredPrices.slice(startIndex, startIndex + n).map((entry: IPrice) => checkHourMatch(entry));
				// identify if any element is true
				if (minSumEntries.some((value) => value)) {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
				} else {
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				}

				// calculate average cost of determined block of hours, write to data point
				this.checkAndSetValueNumber(
					this.getStatePrefix(this.adapter.config.CalculatorList[channel].chHomeID, `Calculations.${channel}`, `AverageTotalCost`),
					Math.round(1000 * (minSum / n)) / 1000,
					`average total cost in determined block`,
					false,
					false,
				);
				// write start and stop time of determined block to data points
				const beginDate = new Date(filteredPrices[startIndex].startsAt);
				const endDate = new Date(filteredPrices[startIndex + n - 1].startsAt);
				this.checkAndSetValue(
					this.getStatePrefix(this.adapter.config.CalculatorList[channel].chHomeID, `Calculations.${channel}`, `BlockStartFullHour`),
					format(beginDate, "H"),
					`first hour of determined block`,
					false,
					false,
				);
				this.checkAndSetValue(
					this.getStatePrefix(this.adapter.config.CalculatorList[channel].chHomeID, `Calculations.${channel}`, `BlockEndFullHour`),
					format(addHours(endDate, 1), "H"),
					`end hour of determined block`,
					false,
					false,
				);
			}
			//set value to foreign state
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

	async executeCalculatorSmartBatteryBuffer(channel: number): Promise<void> {
		/*
		Summary:
			Develop a channel that categorizes hourly energy prices into three groups—cheap, normal, and expensive.
			The categorization is based on the total price of each hour, considering a efficiency loss of a battery system.

		Detailed Description:
			The system has an algorithm to organize hourly energy prices, providing users with a clear understanding of price
			dynamics. The algorithm follows these steps:
			- Sort by Total Price: Sort hourly rates in ascending order based on the total price.
			- Identify Cheap Hours: Starting with the cheapest hour, include hours in the cheap category if the total price is
			lower than the total price of the most expensive hour minus a minimum distance (MinDelta). Hereby calculate MinDelta
			based on the average total price of the cheap hours and a user-defined efficiency loss of a battery system. Collect
			cheap hours up to a maximum number of maxCheapCount
			- Determine the Most Expensive Hour Among the Cheap: Identify the hour with the highest total price among the cheap hours.
			- Classify Normal and Expensive Hours: Hours not classified as cheap are further categorized as follows:
				Normal Hours: Total price is lower than MinDelta plus the highest total price among the cheap hours.
				Expensive Hours: Total price is higher than MinDelta plus the highest total price among the cheap hours.

		User Customization:
			Allow users to specify the maximum number of cheap hours they want to identify (maxCheapCount) and
			define the efficiency loss (efficiencyLoss).

		Output:
			- Not Active - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
			- Cheap Hours - enable battery charging (ON-1) and disable feed into home energy system (OFF-2)
			- Normal Hours - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
			- Expensive Hours - disable battery charging (OFF-1) and enable feed into home energy system (ON-2)
		*/
		try {
			let valueToSet: string = "";
			let valueToSet2: string = "";
			if (!this.adapter.config.CalculatorList[channel].chActive) {
				// Not Active - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
				valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
				valueToSet2 = this.adapter.config.CalculatorList[channel].chValueOff2;
			} else {
				// chActive -> choose desired values
				const pricesToday: IPrice[] = JSON.parse(
					await this.getStateValue(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.PricesToday.json`),
				);
				const maxCheapCount: number = await this.getStateValue(
					`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.AmountHours`,
				);
				const efficiencyLoss: number = await this.getStateValue(
					`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.EfficiencyLoss`,
				);

				// sort by total price
				pricesToday.sort((a, b) => a.total - b.total);

				const cheapHours: IPrice[] = [];
				const normalHours: IPrice[] = [];
				const expensiveHours: IPrice[] = [];
				let cheapIndex = 0;
				let minDelta = 0;
				while (cheapIndex < pricesToday.length && cheapHours.length < maxCheapCount) {
					const currentHour = pricesToday[cheapIndex];
					if (currentHour.total < pricesToday[pricesToday.length - 1].total - minDelta) {
						cheapHours.push(currentHour);
						minDelta = calculateMinDelta(cheapHours, efficiencyLoss);
					} else {
						break;
					}
					cheapIndex++;
				}

				const maxCheapTotal = Math.max(...cheapHours.map((hour) => hour.total));

				for (const hour of pricesToday) {
					if (!cheapHours.includes(hour)) {
						if (hour.total > minDelta + maxCheapTotal) {
							expensiveHours.push(hour);
						} else {
							normalHours.push(hour);
						}
					}
				}

				this.adapter.log.debug(`calculator channel ${channel} SBB-type result - cheap hours: ${cheapHours.map((hour) => hour.total)}`);
				this.adapter.log.debug(`calculator channel ${channel} SBB-type result - normal hours: ${normalHours.map((hour) => hour.total)}`);
				this.adapter.log.debug(`calculator channel ${channel} SBB-type result - expensive hours: ${expensiveHours.map((hour) => hour.total)}`);
				const resultCheap: boolean[] = cheapHours.map((entry: IPrice) => checkHourMatch(entry));
				const resultNormal: boolean[] = normalHours.map((entry: IPrice) => checkHourMatch(entry));
				const resultExpensive: boolean[] = expensiveHours.map((entry: IPrice) => checkHourMatch(entry));

				// identify if an element is true and generate output
				if (resultCheap.some((value) => value)) {
					// Cheap Hours - enable battery charging (ON-1) and disable feed into home energy system (OFF-2)
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOn;
					valueToSet2 = this.adapter.config.CalculatorList[channel].chValueOff2;
				} else if (resultNormal.some((value) => value)) {
					// Normal Hours - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
					valueToSet2 = this.adapter.config.CalculatorList[channel].chValueOff2;
				} else if (resultExpensive.some((value) => value)) {
					// Expensive Hours - disable battery charging (OFF-1) and enable feed into home energy system (ON-2)
					valueToSet = this.adapter.config.CalculatorList[channel].chValueOff;
					valueToSet2 = this.adapter.config.CalculatorList[channel].chValueOn2;
				} else {
					this.adapter.log.warn(
						this.generateErrorMessage(`no result found for SBB`, `execute calculator for smart battery buffer in channel ${channel}`),
					);
				}

				function calculateMinDelta(cheapHours: IPrice[], efficiencyLoss: number): number {
					const cheapTotalSum = cheapHours.reduce((sum, hour) => sum + hour.total, 0);
					const cheapAverage = cheapTotalSum / cheapHours.length;
					return cheapAverage * efficiencyLoss;
				}
			}
			this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState, convertValue(valueToSet));
			this.adapter.log.debug(
				`calculator channel: ${channel}-smart battery buffer; setting first state: ${this.adapter.config.CalculatorList[channel].chTargetState} to ${valueToSet}`,
			);
			this.adapter.setForeignStateAsync(this.adapter.config.CalculatorList[channel].chTargetState2, convertValue(valueToSet2));
			this.adapter.log.debug(
				`calculator channel: ${channel}-smart battery buffer; setting second state: ${this.adapter.config.CalculatorList[channel].chTargetState2} to ${valueToSet2}`,
			);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for smart battery buffer in channel ${channel}`));
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
