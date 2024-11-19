import * as utils from "@iobroker/adapter-core";
import { addDays, addHours, format } from "date-fns";
import { IPrice } from "tibber-api/lib/src/models/IPrice";
import { ProjectUtils } from "./projectUtils";
import { enCalcType, getCalcTypeDescription } from "./tibberHelper";

export class TibberCalculator extends ProjectUtils {
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

			//#region *** setup calculations channels folder ***
			const typeDesc: string = getCalcTypeDescription(this.adapter.config.CalculatorList[channel].chType);
			await this.adapter.setObjectAsync(`Homes.${homeId}.Calculations.${channel}`, {
				type: "channel",
				common: {
					name: channelName,
					desc: `type: ${typeDesc}`,
				},
				native: {},
			});
			//#endregion

			//#region *** setup chActive state object for all channel types ***
			if (this.adapter.config.CalculatorList[channel].chActive === undefined) {
				this.adapter.config.CalculatorList[channel].chActive = false;
			}
			this.checkAndSetValueBoolean(
				`Homes.${homeId}.Calculations.${channel}.Active`,
				this.adapter.config.CalculatorList[channel].chActive,
				`Whether the calculation channel is active`,
				true,
				true, // set to false if adapter config from database should be used
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

			//#region *** setup and delete channel states according to channel type ***
			/*	"best cost"				| Input state: "TriggerPrice"
										| Output state: "Output"
				"best single hours" 	| Input state: "AmountHours"
										| Output state: "Output"
				"best hours block"		| Input state: "AmountHours"
										| Output state: "Output", "AverageTotalCost", "BlockStartFullHour", "BlockEndFullHour"
				"best cost LTF"			| Input state: "TriggerPrice", "StartTime", "StopTime", "RepeatDays"
										| Output state: "Output"
				"best single hours LTF"	| Input state: "AmountHours", "StartTime", "StopTime", "RepeatDays"
										| Output state: "Output"
				"best hours block LTF"	| Input state: "AmountHours", "StartTime", "StopTime", "RepeatDays"
										| Output state: "Output"
				"smart battery buffer"	| Input state: "AmountHours", "EfficiencyLoss"
										| Output state: "Output", "Output2"
			*/
			switch (this.adapter.config.CalculatorList[channel].chType) {
				case enCalcType.BestCost:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.BestSingleHours:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setup_chAmountHours(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.BestHoursBlock:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chAverageTotalCost(homeId, channel);
					await this.setup_chBlockStartFullHour(homeId, channel);
					await this.setup_chBlockEndFullHour(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.BestCostLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.BestSingleHoursLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.BestHoursBlockLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chStartTime(homeId, channel);
					await this.setup_chStopTime(homeId, channel);
					await this.setup_chRepeatDays(homeId, channel);
					await this.setup_chAverageTotalCost(homeId, channel);
					await this.setup_chBlockStartFullHour(homeId, channel);
					await this.setup_chBlockEndFullHour(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.setup_chOutput(homeId, channel);
					break;
				case enCalcType.SmartBatteryBuffer:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chEfficiencyLoss(homeId, channel);
					await this.setup_chOutput(homeId, channel); // OUTPUTS
					await this.setup_chOutput2(homeId, channel);
					break;
				default:
					this.adapter.log.error(`Calculator Type for channel ${channel} not set, please do!`);
			}
			//#endregion

			//#region *** subscribe state changes ***
			// this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
			this.adapter.subscribeStates([
				`Homes.${homeId}.Calculations.${channel}.Active`,
				`Homes.${homeId}.Calculations.${channel}.TriggerPrice`,
				`Homes.${homeId}.Calculations.${channel}.AmountHours`,
				`Homes.${homeId}.Calculations.${channel}.StartTime`,
				`Homes.${homeId}.Calculations.${channel}.StopTime`,
				`Homes.${homeId}.Calculations.${channel}.RepeatDays`,
				`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`,
			]);
			/*
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.Active`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.StartTime`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.StopTime`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
			*/
			//#endregion
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
		}
	}

	private async setup_chOutput(homeId: string, channel: number): Promise<void> {
		if (
			this.adapter.config.CalculatorList[channel]?.chTargetState &&
			this.adapter.config.CalculatorList[channel].chTargetState.length > 10 &&
			!this.adapter.config.CalculatorList[channel].chTargetState.startsWith("choose your state to drive")
		) {
			await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output`);
		} else {
			try {
				this.checkAndSetValueBoolean(
					`Homes.${homeId}.Calculations.${channel}.Output`,
					false,
					`standard output if no special one selected in config`,
					true,
					true,
				);
			} catch (error) {
				this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output for calculator for Home ${homeId}, Channel ${channel}`));
			}
		}
	}
	private async setup_chOutput2(homeId: string, channel: number): Promise<void> {
		if (
			this.adapter.config.CalculatorList[channel]?.chTargetState2 &&
			this.adapter.config.CalculatorList[channel].chTargetState2.length > 10 &&
			!this.adapter.config.CalculatorList[channel].chTargetState2.startsWith("choose your state to drive")
		) {
			await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`);
		} else {
			try {
				this.checkAndSetValueBoolean(
					`Homes.${homeId}.Calculations.${channel}.Output2`,
					false,
					`standard output2 if no special one selected in config`,
					true,
					true,
				);
			} catch (error) {
				this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output2 for calculator for Home ${homeId}, Channel ${channel}`));
			}
		}
	}
	private async setup_chTriggerPrice(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			if (this.adapter.config.CalculatorList[channel].chTriggerPrice === undefined) {
				this.adapter.config.CalculatorList[channel].chTriggerPrice = 0;
			}
			this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.TriggerPrice`,
				this.adapter.config.CalculatorList[channel].chTriggerPrice,
				`pricelevel to trigger this channel at`,
				undefined,
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
	private async setup_chAmountHours(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chAmountHours  ***
			if (this.adapter.config.CalculatorList[channel].chAmountHours === undefined) {
				this.adapter.config.CalculatorList[channel].chAmountHours = 0;
			}
			this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.AmountHours`,
				this.adapter.config.CalculatorList[channel].chAmountHours,
				`amount of hours to trigger this channel`,
				undefined,
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
	private async setup_chStartTime(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chStartTime  ***
			if (this.adapter.config.CalculatorList[channel].chStartTime === undefined) {
				const today = new Date();
				today.setHours(0, 0, 0, 0); // sets clock to 0:00
				this.adapter.config.CalculatorList[channel].chStartTime = today;
			}
			this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.StartTime`,
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
	private async setup_chStopTime(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chStopTime  ***
			if (this.adapter.config.CalculatorList[channel].chStopTime === undefined) {
				const today = new Date();
				today.setHours(23, 59, 0, 0); // sets clock to 0:00
				this.adapter.config.CalculatorList[channel].chStopTime = today;
			}
			this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.StopTime`,
				this.adapter.config.CalculatorList[channel].chStopTime.toISOString(),
				`Stop time for this channel`,
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
	private async setup_chRepeatDays(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chRepeatDays  ***
			if (this.adapter.config.CalculatorList[channel].chRepeatDays === undefined) {
				this.adapter.config.CalculatorList[channel].chRepeatDays = 0;
			}
			this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.RepeatDays`,
				this.adapter.config.CalculatorList[channel].chRepeatDays,
				`number of days to shift this LTF channel for repetition`,
				undefined,
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
	private async setup_chEfficiencyLoss(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			//***  chEfficiencyLoss  ***
			if (this.adapter.config.CalculatorList[channel].chEfficiencyLoss === undefined) {
				this.adapter.config.CalculatorList[channel].chEfficiencyLoss = 0;
			}
			this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`,
				this.adapter.config.CalculatorList[channel].chEfficiencyLoss,
				`efficiency loss between charge and discharge of battery system`,
				undefined,
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
	private async setup_chAverageTotalCost(homeId: string, channel: number): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`,
				0,
				`average total cost in determined block`,
				undefined,
				false,
				false,
			);
			this.adapter.log.debug(`setup calculator output state AverageTotalCost in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AverageTotalCost for calculator`));
		}
	}
	private async setup_chBlockStartFullHour(homeId: string, channel: number, delMode = false): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockStartFullHour`, `-`, `first hour of determined block`, false, false);
			if (!delMode) this.adapter.log.debug(`setup calculator output state BlockStartFullHour in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStartFullHour for calculator`));
		}
	}
	private async setup_chBlockEndFullHour(homeId: string, channel: number, delMode = false): Promise<void> {
		try {
			const channelName = this.adapter.config.CalculatorList[channel].chName;
			this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockEndFullHour`, `-`, `end hour of determined block`, false, false);
			if (!delMode) this.adapter.log.debug(`setup calculator output state BlockEndFullHour in home: ${homeId} - channel: ${channel}-${channelName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEndFullHour for calculator`));
		}
	}

	async startCalculatorTasks(onStateChange = false, firstRun = false): Promise<void> {
		if (!this.adapter.config.UseCalculator) return;

		const badComponents = ["tibberlink", "Homes", "Calculations"]; // we must not use an input as output!!

		for (const channel in this.adapter.config.CalculatorList) {
			//#region *** first run checks ***
			if (firstRun) {
				if (
					!this.adapter.config.CalculatorList[channel] ||
					!this.adapter.config.CalculatorList[channel].chTargetState ||
					!this.adapter.config.CalculatorList[channel].chTargetState.trim()
				) {
					this.adapter.log.warn(
						`Empty destination state in calculator channel ${channel} defined - provide correct external state - channel will use internal state OUTPUT`,
					);
				}

				if (
					this.adapter.config.CalculatorList[channel].chTargetState != null &&
					typeof this.adapter.config.CalculatorList[channel].chTargetState === "string" &&
					this.adapter.config.CalculatorList[channel].chTargetState !== ""
				) {
					const chTargetStateComponents = this.adapter.config.CalculatorList[channel].chTargetState.split(".");
					let foundAllBadComponents = true;
					badComponents.forEach((badComponent) => {
						if (!chTargetStateComponents.includes(badComponent)) foundAllBadComponents = false;
					});
					if (foundAllBadComponents) {
						this.adapter.log.error(
							`Invalid destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`,
						);
						continue; // skip channel
					}
				} else {
					this.adapter.log.debug(`chTargetState is null or undefined in calculator channel ${channel}. Skipping channel execution.`);
					continue; // skip channel
				}

				//checks for SmartBatteryBuffer only...
				if (this.adapter.config.CalculatorList[channel].chType === enCalcType.SmartBatteryBuffer) {
					if (
						!this.adapter.config.CalculatorList[channel] ||
						!this.adapter.config.CalculatorList[channel].chTargetState2 ||
						!this.adapter.config.CalculatorList[channel].chTargetState2.trim()
					) {
						this.adapter.log.warn(
							`Empty second destination state in calculator channel ${channel} defined - provide correct external state 2 - upon this, channel will use internal state OUTPUT2`,
						);
					}

					if (
						this.adapter.config.CalculatorList[channel].chTargetState2 != null &&
						typeof this.adapter.config.CalculatorList[channel].chTargetState2 === "string" &&
						this.adapter.config.CalculatorList[channel].chTargetState2 !== ""
					) {
						const chTargetState2Components = this.adapter.config.CalculatorList[channel].chTargetState2.split(".");
						let foundAllBadComponents = true;
						badComponents.forEach((badComponent) => {
							if (!chTargetState2Components.includes(badComponent)) foundAllBadComponents = false;
						});
						if (foundAllBadComponents) {
							this.adapter.log.error(
								`Invalid second destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`,
							);
							continue; //skip channel
						}
					} else {
						this.adapter.log.debug(`chTargetState2 is null or undefined in calculator channel ${channel}. Skipping channel execution.`);
						continue; // skip channel
					}
					if (
						this.adapter.config.CalculatorList[channel].chValueOn2 == null ||
						this.adapter.config.CalculatorList[channel].chValueOn2 === "" ||
						this.adapter.config.CalculatorList[channel].chValueOff2 == null ||
						this.adapter.config.CalculatorList[channel].chValueOff2 === ""
					) {
						this.adapter.log.error(
							`"Value YES 2" or "Value NO 2" is null or undefined in calculator channel ${channel}. Please provide usable values in config.`,
						);
						continue; // skip channel
					}
				}
			}
			//#endregion first run mode

			try {
				if (this.adapter.config.CalculatorList[channel].chActive || onStateChange) {
					// If Active=false been set just now - or still active then act  - else just produce debug log in the following runs
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
				} else {
					this.adapter.log.debug(
						`calculator channel: ${channel} - ${getCalcTypeDescription(this.adapter.config.CalculatorList[channel].chType)}; execution skipped because channel not set to active in channel states`,
					);
				}
			} catch (error: unknown) {
				this.adapter.log.warn(`unhandled error ${error} while executing calculator channel ${channel}`);
			}
		}
	}

	async updateCalculatorUsageStats(): Promise<void> {
		if (!this.adapter.config.UseCalculator) return;
		this.initStats();
		for (const channel in this.adapter.config.CalculatorList) {
			try {
				this.increaseStatsValueByOne(this.adapter.config.CalculatorList[channel].chType);
			} catch (error: unknown) {
				this.adapter.log.debug(`unhandled error ${error} in calculator usage scan for channel ${channel}`);
			}
		}
	}

	private async executeCalculatorBestCost(channel: number, modeLTF = false): Promise<void> {
		try {
			let valueToSet = "";
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
					this.adapter.setState(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					this.adapter.setState(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setState(
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
			//set value to foreign state, if defined
			let sOutState = "";
			if (
				this.adapter.config.CalculatorList[channel]?.chTargetState &&
				this.adapter.config.CalculatorList[channel].chTargetState.length > 10 &&
				!this.adapter.config.CalculatorList[channel].chTargetState.startsWith("choose your state to drive")
			) {
				sOutState = this.adapter.config.CalculatorList[channel].chTargetState;
				this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
			} else {
				sOutState = `Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Output`;
				this.adapter.setState(sOutState, convertValue(valueToSet), true);
			}
			this.adapter.log.debug(`calculator channel: ${channel} - best price ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}

	private async executeCalculatorBestSingleHours(channel: number, modeLTF = false): Promise<void> {
		try {
			let valueToSet = "";
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
					this.adapter.setState(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					// chRepeatDays present, change start and stop time accordingly
					this.adapter.setState(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setState(
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
			//set value to foreign state, if defined
			let sOutState = "";
			if (
				this.adapter.config.CalculatorList[channel]?.chTargetState &&
				this.adapter.config.CalculatorList[channel].chTargetState.length > 10 &&
				!this.adapter.config.CalculatorList[channel].chTargetState.startsWith("choose your state to drive")
			) {
				sOutState = this.adapter.config.CalculatorList[channel].chTargetState;
				this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
			} else {
				sOutState = `Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Output`;
				this.adapter.setState(sOutState, convertValue(valueToSet), true);
			}
			this.adapter.log.debug(`calculator channel: ${channel} - best single hours ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best single hours ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}

	private async executeCalculatorBestHoursBlock(channel: number, modeLTF = false): Promise<void> {
		try {
			let valueToSet = "";
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
					this.adapter.setState(`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Active`, false, true);
				} else {
					this.adapter.setState(
						`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.StartTime`,
						format(
							addDays(this.adapter.config.CalculatorList[channel].chStartTime, this.adapter.config.CalculatorList[channel].chRepeatDays),
							"yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
						),
						true,
					);
					this.adapter.setState(
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
				const n = Math.min(this.adapter.config.CalculatorList[channel].chAmountHours, filteredPrices.length);

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
					`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.AverageTotalCost`,
					Math.round(1000 * (minSum / n)) / 1000,
					`average total cost in determined block`,
					undefined,
					false,
					false,
				);
				// write start and stop time of determined block to data points
				const beginDate = new Date(filteredPrices[startIndex].startsAt);
				const endDate = new Date(filteredPrices[startIndex + n - 1].startsAt);
				this.checkAndSetValue(
					`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.BlockStartFullHour`,
					format(beginDate, "H"),
					`first hour of determined block`,
					false,
					false,
				);
				this.checkAndSetValue(
					`Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.BlockEndFullHour`,
					format(addHours(endDate, 1), "H"),
					`end hour of determined block`,
					false,
					false,
				);
			}
			//set value to foreign state, if defined
			let sOutState = "";
			if (
				this.adapter.config.CalculatorList[channel]?.chTargetState &&
				this.adapter.config.CalculatorList[channel].chTargetState.length > 10 &&
				!this.adapter.config.CalculatorList[channel].chTargetState.startsWith("choose your state to drive")
			) {
				sOutState = this.adapter.config.CalculatorList[channel].chTargetState;
				this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
			} else {
				sOutState = `Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Output`;
				this.adapter.setState(sOutState, convertValue(valueToSet), true);
			}
			this.adapter.log.debug(`calculator channel: ${channel} - best hours block ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best hours block ${modeLTF ? "LTF " : ""}in channel ${channel}`));
		}
	}

	private async executeCalculatorSmartBatteryBuffer(channel: number): Promise<void> {
		//#region *** SPECIFICATION ***
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
		//#endregion
		try {
			let valueToSet = "";
			let valueToSet2 = "";
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
			//set value to foreign states, if defined
			let sOutState = "";
			if (
				this.adapter.config.CalculatorList[channel]?.chTargetState &&
				this.adapter.config.CalculatorList[channel].chTargetState.length > 10 &&
				!this.adapter.config.CalculatorList[channel].chTargetState.startsWith("choose your state to drive")
			) {
				sOutState = this.adapter.config.CalculatorList[channel].chTargetState;
				this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
			} else {
				sOutState = `Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Output`;
				this.adapter.setState(sOutState, convertValue(valueToSet), true);
			}
			sOutState = ""; // reinit for output 2
			if (
				this.adapter.config.CalculatorList[channel].chTargetState2.length > 10 &&
				!this.adapter.config.CalculatorList[channel].chTargetState2.startsWith("choose your state to drive")
			) {
				sOutState = this.adapter.config.CalculatorList[channel].chTargetState2;
				this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet2));
			} else {
				sOutState = `Homes.${this.adapter.config.CalculatorList[channel].chHomeID}.Calculations.${channel}.Output2`;
				this.adapter.setState(sOutState, convertValue(valueToSet2), true);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for smart battery buffer in channel ${channel}`));
		}
	}
}

/**
 * Checks if the current hour matches the hour of a given entry's start time.
 * This method compares the hour of the current date and time with the hour extracted from the `startsAt` property of the provided `entry` object.
 * If the hours match, the function returns `true`, otherwise `false`.
 *
 * @param entry - An object of type `IPrice` containing a `startsAt` property that represents the start time as a date string.
 * @returns A boolean indicating whether the current hour matches the hour of the `startsAt` time.
 */
function checkHourMatch(entry: IPrice): boolean {
	const currentDateTime = new Date();
	const startDateTime = new Date(entry.startsAt);
	return currentDateTime.getHours() === startDateTime.getHours();
}

/**
 * Converts a string value to its corresponding boolean, number, or string representation.
 * This method attempts to convert the input string into a boolean if it matches "true" or "false" (case-insensitive).
 * If the string can be parsed as a number, it is converted to a number. Otherwise, the original string is returned.
 *
 * @param Value - The string to be converted into a boolean, number, or returned as a string.
 * @returns A boolean if the string is "true" or "false", a number if the string represents a valid numeric value, or the original string if no conversion is possible.
 */
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
