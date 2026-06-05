import type * as utils from "@iobroker/adapter-core";
import { addDays, addMinutes, format, parseISO } from "date-fns";
import type { IPrice } from "tibber-api/lib/src/models/IPrice.js";
import { ProjectUtils, enCalcType, getCalcTypeDescription } from "./projectUtils.js";

/**
 * TibberCalculator
 */
export class TibberCalculator extends ProjectUtils {
	numBestCost: number;
	numBestSingleHours: number;
	numBestHoursBlock: number;
	numBestCostLTF: number;
	numBestSingleHoursLTF: number;
	numBestHoursBlockLTF: number;
	numSmartBatteryBuffer: number;
	numBestPercentage: number;
	numBestPercentageLTF: number;
	numSmartBatteryBufferLTF: number;

	/**
	 * constructor
	 *
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
		this.numBestCost = 0;
		this.numBestSingleHours = 0;
		this.numBestHoursBlock = 0;
		this.numBestCostLTF = 0;
		this.numBestSingleHoursLTF = 0;
		this.numBestHoursBlockLTF = 0;
		this.numSmartBatteryBuffer = 0;
		this.numBestPercentage = 0;
		this.numBestPercentageLTF = 0;
		this.numSmartBatteryBufferLTF = 0;
	}

	/**
	 * Resets all calculator channel type counters to zero.
	 * Called before re-scanning the CalculatorList to produce fresh usage statistics.
	 */
	initStats(): void {
		this.numBestCost = 0;
		this.numBestSingleHours = 0;
		this.numBestHoursBlock = 0;
		this.numBestCostLTF = 0;
		this.numBestSingleHoursLTF = 0;
		this.numBestHoursBlockLTF = 0;
		this.numSmartBatteryBuffer = 0;
		this.numBestPercentage = 0;
		this.numBestPercentageLTF = 0;
		this.numSmartBatteryBufferLTF = 0;
	}

	/**
	 * Increments the usage counter for the given calculator channel type by one.
	 *
	 * @param type - The `enCalcType` enum value identifying which counter to increment.
	 */
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
				break;
			case enCalcType.BestPercentage:
				this.numBestPercentage++;
				break;
			case enCalcType.BestPercentageLTF:
				this.numBestPercentageLTF++;
				break;
			case enCalcType.SmartBatteryBufferLTF:
				this.numSmartBatteryBufferLTF++;
		}
	}

	/**
	 * Creates and initialises all ioBroker state objects for a single calculator channel.
	 * Sets up output states, JSON output states, and channel-type-specific input states
	 * (trigger price, amount hours, LTF window, percentage, efficiency loss, block timing).
	 * Subscribes to the relevant input states so runtime changes are picked up immediately.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when all states have been created and subscriptions are registered.
	 */
	async setupCalculatorStates(homeId: string, channel: number): Promise<void> {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			if (channelConfig.chName === undefined) {
				channelConfig.chName = `Channel Name`;
			}

			//#region *** setup calculation channels folder ***
			const typeDesc: string = getCalcTypeDescription(channelConfig.chType);
			await this.adapter.setObject(`Homes.${homeId}.Calculations.${channel}`, {
				type: "channel",
				common: {
					name: channelConfig.chName,
					desc: `type: ${typeDesc}`,
				},
				native: {},
			});
			//#endregion

			//#region *** setup chActive state object for all channel types ***
			if (channelConfig.chActive === undefined) {
				channelConfig.chActive = false;
			}
			void this.checkAndSetValueBoolean(
				`Homes.${homeId}.Calculations.${channel}.Active`,
				channelConfig.chActive,
				`Whether the calculation channel is active`,
				`switch.enable`,
				true,
				true, // set to false if adapter config from database should be used
			);
			const valueActive = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.Active`);
			if (typeof valueActive === "boolean") {
				channelConfig.chActive = valueActive;
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to Active: ${channelConfig.chActive}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chActive: ${valueActive}`);
			}
			//#endregion

			//#region *** setup and delete channel states according to channel type ***
			/*	"best cost"				| Input state: "TriggerPrice"
										| Output state: "Output", "OutputJSON"
				"best single hours" 	| Input state: "AmountHours"
										| Output state: "Output", "OutputJSON"
				"best hours block"		| Input state: "AmountHours"
										| Output state: "Output", "OutputJSON", "AverageTotalCost", "BlockStartFullHour", "BlockEndFullHour", "BlockStart", "BlockEnd"
				"best cost LTF"			| Input state: "TriggerPrice", ["StartTime", "StopTime", "RepeatDays"]
										| Output state: "Output", "OutputJSON"
				"best single hours LTF"	| Input state: "AmountHours", ["StartTime", "StopTime", "RepeatDays"]
										| Output state: "Output", "OutputJSON"
				"best hours block LTF"	| Input state: "AmountHours", ["StartTime", "StopTime", "RepeatDays"]
										| Output state: "Output", "OutputJSON", "AverageTotalCost", "BlockStartFullHour", "BlockEndFullHour", "BlockStart", "BlockEnd"
				"smart battery buffer"	| Input state: "AmountHours", "EfficiencyLoss"
										| Output state: "Output", "Output2", "OutputJSON", "OutputJSON2"
				"best percentage"	 	| Input state: "Percentage"
										| Output state: "Output", "OutputJSON"
				"best percentage LTF" 	| Input state: "Percentage", ["StartTime", "StopTime", "RepeatDays"]
										| Output state: "Output", "OutputJSON"
				"smart battery buffer"	| Input state: "AmountHours", "EfficiencyLoss", ["StartTime", "StopTime", "RepeatDays"]
										| Output state: "Output", "Output2", "OutputJSON", "OutputJSON2"
			*/
			switch (channelConfig.chType) {
				case enCalcType.BestCost:
					await this.deleteLTFInputs(homeId, channel); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestSingleHours:
					await this.deleteLTFInputs(homeId, channel); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setup_chAmountHours(homeId, channel); // alias 15 minute time blocks
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestHoursBlock:
					await this.deleteLTFInputs(homeId, channel); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setup_chAmountHours(homeId, channel); // alias 15 minute time blocks
					this.setup_chAverageTotalCost(homeId, channel);
					this.setup_chBlockStartFullHour(homeId, channel);
					this.setup_chBlockEndFullHour(homeId, channel);
					this.setup_chBlockStart(homeId, channel);
					this.setup_chBlockEnd(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestCostLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setupLTFInputs(homeId, channel);
					await this.setup_chTriggerPrice(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestSingleHoursLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setupLTFInputs(homeId, channel);
					await this.setup_chAmountHours(homeId, channel); // alias 15 minute time blocks
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestHoursBlockLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setupLTFInputs(homeId, channel);
					await this.setup_chAmountHours(homeId, channel); // alias 15 minute time blocks
					this.setup_chAverageTotalCost(homeId, channel);
					this.setup_chBlockStartFullHour(homeId, channel);
					this.setup_chBlockEndFullHour(homeId, channel);
					this.setup_chBlockStart(homeId, channel);
					this.setup_chBlockEnd(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.SmartBatteryBuffer:
					await this.deleteLTFInputs(homeId, channel); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setup_chAmountHours(homeId, channel);
					await this.setup_chEfficiencyLoss(homeId, channel);
					await this.setup_chOutput(homeId, channel); // OUTPUTS
					await this.setup_chOutput2(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					this.setup_chOutputJSON2(homeId, channel);
					break;
				case enCalcType.BestPercentage:
					await this.deleteLTFInputs(homeId, channel); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
					await this.setup_chPercentage(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.BestPercentageLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.setupLTFInputs(homeId, channel);
					await this.setup_chPercentage(homeId, channel);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.OutputJSON2`);
					await this.setup_chOutput(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					break;
				case enCalcType.SmartBatteryBufferLTF:
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
					await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
					await this.setupLTFInputs(homeId, channel);
					await this.setup_chAmountHours(homeId, channel); // alias 15 minute time blocks
					await this.setup_chEfficiencyLoss(homeId, channel);
					await this.setup_chOutput(homeId, channel); // OUTPUTS
					await this.setup_chOutput2(homeId, channel);
					this.setup_chOutputJSON(homeId, channel);
					this.setup_chOutputJSON2(homeId, channel);
					break;
				default:
					this.adapter.log.error(`Calculator Type for channel ${channel} not set, please do!`);
			}
			//#endregion

			//#region *** subscribe state changes ***
			// this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.*`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.Active`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.StartTime`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.StopTime`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
			this.adapter.subscribeStates(`Homes.${homeId}.Calculations.${channel}.Percentage`);
			//#endregion
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
		}
	}

	/**
	 * Creates or updates the LTF (Limited Time Frame) input states — StartTime, StopTime, RepeatDays —
	 * for the given channel, and reads back the persisted values into the in-memory channel config.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when all LTF input states have been written and the config has been updated.
	 */
	private async setupLTFInputs(homeId: string, channel: number): Promise<void> {
		const channelConfig = this.adapter.config.CalculatorList[channel];

		try {
			//***  chStartTime  ***
			if (channelConfig.chStartTime === undefined) {
				const today = new Date();
				today.setHours(0, 0, 0, 0); // sets clock to 0:00
				channelConfig.chStartTime = today;
			}

			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.StartTime`,
				channelConfig.chStartTime.toISOString(),
				`Start time for this channel`,
				`date`,
				true,
				true,
			);
			const valueStartTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StartTime`);
			if (typeof valueStartTime === "string") {
				channelConfig.chStartTime.setTime(Date.parse(valueStartTime));
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to StartTime: ${channelConfig.chStartTime.toISOString()}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chStartTime: ${valueStartTime}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StartTime for calculator`));
		}

		try {
			//***  chStopTime  ***
			if (channelConfig.chStopTime === undefined) {
				const today = new Date();
				today.setHours(23, 59, 0, 0); // sets clock to 0:00
				channelConfig.chStopTime = today;
			}
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.StopTime`,
				channelConfig.chStopTime.toISOString(),
				`Stop time for this channel`,
				`date`,
				true,
				true,
			);
			const valueStopTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StopTime`);
			if (typeof valueStopTime === "string") {
				channelConfig.chStopTime.setTime(Date.parse(valueStopTime));
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to StopTime: ${channelConfig.chStopTime.toISOString()}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chStopTime: ${valueStopTime}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StopTime for calculator`));
		}

		try {
			//***  chRepeatDays  ***
			if (channelConfig.chRepeatDays === undefined) {
				channelConfig.chRepeatDays = 0;
			}
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.RepeatDays`,
				channelConfig.chRepeatDays,
				`number of days to shift this LTF channel for repetition`,
				undefined,
				`level`,
				true,
				true,
			);
			const valueRepeatDays = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
			if (typeof valueRepeatDays === "number") {
				channelConfig.chRepeatDays = valueRepeatDays;
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to RepeatDays: ${channelConfig.chRepeatDays}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chTriggerPrice: ${valueRepeatDays}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state RepeatDays for calculator`));
		}
	}
	/**
	 * Removes the LTF input state objects (StartTime, StopTime, RepeatDays) from the adapter object tree.
	 * Called when a channel type is changed away from an LTF type.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when all three state objects have been deleted.
	 */
	private async deleteLTFInputs(homeId: string, channel: number): Promise<void> {
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
	}

	/**
	 * Creates the primary Output boolean state for the channel, or removes it when a custom
	 * external target state is configured (chTargetState).
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been created or deleted.
	 */
	private async setup_chOutput(homeId: string, channel: number): Promise<void> {
		const channelConfig = this.adapter.config.CalculatorList[channel];
		if (channelConfig?.chTargetState?.length > 10 && !channelConfig.chTargetState.startsWith("choose your state to drive")) {
			await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output`);
		} else {
			try {
				void this.checkAndSetValueBoolean(
					`Homes.${homeId}.Calculations.${channel}.Output`,
					false,
					`standard output if no special one selected in config`,
					`switch.enable`,
					false,
					true,
				);
			} catch (error) {
				this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output for calculator for Home ${homeId}, Channel ${channel}`));
			}
		}
	}
	/**
	 * Creates the secondary Output2 boolean state for the channel (used by SmartBatteryBuffer types),
	 * or removes it when a custom external target state is configured (chTargetState2).
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been created or deleted.
	 */
	private async setup_chOutput2(homeId: string, channel: number): Promise<void> {
		const channelConfig = this.adapter.config.CalculatorList[channel];
		if (channelConfig?.chTargetState2?.length > 10 && !channelConfig.chTargetState2.startsWith("choose your state to drive")) {
			await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`);
		} else {
			try {
				void this.checkAndSetValueBoolean(
					`Homes.${homeId}.Calculations.${channel}.Output2`,
					false,
					`standard output2 if no special one selected in config`,
					`switch.enable`,
					false,
					true,
				);
			} catch (error) {
				this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output2 for calculator for Home ${homeId}, Channel ${channel}`));
			}
		}
	}
	/**
	 * Creates or resets the OutputJSON state for the channel, which holds the full price schedule as JSON.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chOutputJSON(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.OutputJSON`,
				`[]`,
				`JSON output to see the schedule the channel will follow`,
				`json`,
				false,
				true,
			);
			if (!delMode) {
				this.adapter.log.debug(`[tibberCalculator]: setup output state OutputJSON in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write  state OutputJSON for calculator in Home ${homeId}, Channel ${channel}`));
		}
	}
	/**
	 * Creates or resets the OutputJSON2 state for the channel (used by SmartBatteryBuffer types
	 * to indicate expensive/feed-in slots separately from cheap/charging slots).
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chOutputJSON2(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.OutputJSON2`,
				`[]`,
				`JSON output 2 to see the schedule the channel will follow`,
				`json`,
				false,
				true,
			);
			if (!delMode) {
				this.adapter.log.debug(`[tibberCalculator]: setup output state OutputJSON2 in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state OutputJSON2 for calculator in Home ${homeId}, Channel ${channel}`));
		}
	}
	/**
	 * Creates the TriggerPrice input state if it does not yet exist, then reads back the persisted
	 * value into the in-memory channel config so subsequent calculations use the latest user setting.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been written and the config has been updated.
	 */
	private async setup_chTriggerPrice(homeId: string, channel: number): Promise<void> {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			if (channelConfig.chTriggerPrice === undefined) {
				channelConfig.chTriggerPrice = 0;
			}
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.TriggerPrice`,
				channelConfig.chTriggerPrice,
				`pricelevel to trigger this channel at`,
				undefined,
				`level.max`,
				true,
				true,
			);
			const valueTriggerPrice = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
			if (typeof valueTriggerPrice === "number") {
				channelConfig.chTriggerPrice = valueTriggerPrice;
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to TriggerPrice: ${channelConfig.chTriggerPrice}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chTriggerPrice: ${valueTriggerPrice}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state TriggerPrice for calculator`));
		}
	}
	/**
	 * Creates the AmountHours input state (in hours, resolution 0.25 h = 15 min) and reads back
	 * the persisted value, converting it to 15-minute blocks internally (×4) for use in calculations.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been written and the config has been updated.
	 */
	private async setup_chAmountHours(homeId: string, channel: number): Promise<void> {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			//***  chAmountHours  ***
			if (channelConfig.chAmountHours === undefined) {
				channelConfig.chAmountHours = 0;
			}
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.AmountHours`,
				channelConfig.chAmountHours,
				`value of hours to trigger this channel, resolution 0.25 hours = 15 minutes`,
				undefined,
				`level`,
				true,
				true,
			);

			const valueAmountHours = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
			if (typeof valueAmountHours === "number") {
				channelConfig.chAmountHours = valueAmountHours * 4; // convert hours to 15 minute time blocks
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to AmountHours: ${channelConfig.chAmountHours}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chAmountHours: ${valueAmountHours}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AmountHours for calculator`));
		}
	}
	/**
	 * Creates the Percentage input state and reads back the persisted value into the channel config.
	 * Used by BestPercentage channel types to define the allowed price spread above the cheapest slot.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been written and the config has been updated.
	 */
	private async setup_chPercentage(homeId: string, channel: number): Promise<void> {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			//***  chPercentage  ***
			if (channelConfig.chPercentage === undefined) {
				channelConfig.chPercentage = 0;
			}
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.Percentage`,
				channelConfig.chPercentage,
				`amount of percentage to trigger this channel`,
				undefined,
				`level.max`,
				true,
				true,
			);
			const valuePercentage = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.Percentage`);
			if (typeof valuePercentage === "number") {
				channelConfig.chPercentage = valuePercentage;
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to percentage: ${channelConfig.chPercentage}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chPercentage: ${valuePercentage}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Percentage for calculator`));
		}
	}
	/**
	 * Creates the EfficiencyLoss input state and reads back the persisted value into the channel config.
	 * Represents the round-trip efficiency loss of a battery system, used by SmartBatteryBuffer types
	 * to dynamically calculate the minimum price delta between cheap and expensive slots.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @returns Resolves when the state has been written and the config has been updated.
	 */
	private async setup_chEfficiencyLoss(homeId: string, channel: number): Promise<void> {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			//***  chEfficiencyLoss  ***
			if (channelConfig.chEfficiencyLoss === undefined) {
				channelConfig.chEfficiencyLoss = 0;
			}
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`,
				channelConfig.chEfficiencyLoss,
				`efficiency loss between charge and discharge of battery system`,
				undefined,
				`level.max`,
				true,
				true,
			);
			const valueEfficiencyLoss = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
			if (typeof valueEfficiencyLoss === "number") {
				channelConfig.chEfficiencyLoss = valueEfficiencyLoss;
				this.adapter.log.debug(
					`[tibberCalculator]: setup settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to EfficiencyLoss: ${channelConfig.chEfficiencyLoss}`,
				);
			} else {
				this.adapter.log.debug(`[tibberCalculator]: wrong type for chEfficiencyLoss: ${valueEfficiencyLoss}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state EfficiencyLoss for calculator`));
		}
	}
	/**
	 * Creates the AverageTotalCost output state, which holds the mean total price of the
	 * cheapest block determined by a BestHoursBlock channel.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 */
	private setup_chAverageTotalCost(homeId: string, channel: number): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValueNumber(
				`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`,
				0,
				`average total cost in determined block`,
				undefined,
				`value`,
				false,
				false,
			);
			this.adapter.log.debug(`[tibberCalculator]: setup output state AverageTotalCost in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AverageTotalCost for calculator`));
		}
	}
	/**
	 * Creates or resets the BlockStartFullHour output state, which holds the full-hour number (0–23)
	 * at which the cheapest block begins.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chBlockStartFullHour(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.BlockStartFullHour`,
				`-`,
				`first quarter hour of determined block`,
				`value`,
				false,
				false,
			);
			if (!delMode) {
				this.adapter.log.debug(
					`[tibberCalculator]: setup output state BlockStartFullHour in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`,
				);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStartFullHour for calculator in Home ${homeId}, Channel ${channel}`));
		}
	}
	/**
	 * Creates or resets the BlockEndFullHour output state, which holds the full-hour number (0–23)
	 * at which the cheapest block ends (i.e. start of the first quarter-hour after the block).
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chBlockEndFullHour(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.BlockEndFullHour`,
				`-`,
				`end full hour of determined block`,
				`value`,
				false,
				false,
			);
			if (!delMode) {
				this.adapter.log.debug(
					`[tibberCalculator]: setup output state BlockEndFullHour in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`,
				);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEndFullHour for calculator`));
		}
	}
	/**
	 * Creates or resets the BlockStart output state, which holds the ISO date-time string of the
	 * first 15-minute slot of the cheapest block.
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chBlockStart(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.BlockStart`,
				`-`,
				`start date string of determined block`,
				`date`,
				false,
				false,
			);
			if (!delMode) {
				this.adapter.log.debug(`[tibberCalculator]: setup output state BlockStart in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStart for calculator`));
		}
	}
	/**
	 * Creates or resets the BlockEnd output state, which holds the ISO date-time string of the
	 * first 15-minute slot after the cheapest block (exclusive end boundary).
	 *
	 * @param homeId - ID of the home this channel belongs to.
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param delMode - When `true`, suppresses the debug log (used during cleanup/delete flows).
	 */
	private setup_chBlockEnd(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockEnd`, `-`, `stop date string of determined block`, `date`, false, false);
			if (!delMode) {
				this.adapter.log.debug(`[tibberCalculator]: setup output state BlockEnd in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEnd for calculator`));
		}
	}

	/**
	 * startCalculatorTasks
	 *
	 * @param onStateChange - Optional onStateChange mode (default = false)
	 * @param firstRun - Optional firstRun mode (default = false)
	 */
	async startCalculatorTasks(onStateChange = false, firstRun = false): Promise<void> {
		if (!this.adapter.config.UseCalculator) {
			return;
		}
		const badComponents = ["tibberlink", "Homes", "Calculations"]; // we must not use an input as output!!

		// eslint-disable-next-line @typescript-eslint/no-for-in-array
		for (const channel in this.adapter.config.CalculatorList) {
			//#region *** first run checks ***
			if (firstRun) {
				//reassign channel ID - needed in graph output, because of sorted and filtered channels
				this.adapter.config.CalculatorList[channel].chChannelID = channel;
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
					badComponents.forEach(badComponent => {
						if (!chTargetStateComponents.includes(badComponent)) {
							foundAllBadComponents = false;
						}
					});
					if (foundAllBadComponents) {
						this.adapter.log.error(
							`Invalid destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`,
						);
						continue; // skip channel
					}
				} else {
					this.adapter.log.debug(
						`[tibberCalculator]: chTargetState is null or undefined in channel ${channel}. Skipping channel output verification.`,
					);
					//WiP - shouldn't be skipped continue; // skip channel
				}

				//checks for SmartBatteryBuffer (LTF) only...
				if (
					this.adapter.config.CalculatorList[channel].chType === enCalcType.SmartBatteryBuffer ||
					this.adapter.config.CalculatorList[channel].chType === enCalcType.SmartBatteryBufferLTF
				) {
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
						badComponents.forEach(badComponent => {
							if (!chTargetState2Components.includes(badComponent)) {
								foundAllBadComponents = false;
							}
						});
						if (foundAllBadComponents) {
							this.adapter.log.error(
								`Invalid second destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`,
							);
							continue; //skip channel
						}
					} else {
						this.adapter.log.debug(
							`[tibberCalculator]: chTargetState2 is null or undefined in channel ${channel}. Skipping channel output verification.`,
						);
						//WiP - shouldn't be skipped continue; // skip channel
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
			//#endregion first run checks

			try {
				if (this.adapter.config.CalculatorList[channel].chActive || onStateChange) {
					// If Active=false been set just now - or still active then act - else just produce debug log in the following runs
					switch (this.adapter.config.CalculatorList[channel].chType) {
						case enCalcType.BestCost:
							await this.executeCalculatorBestCost(parseInt(channel));
							break;
						case enCalcType.BestSingleHours:
							await this.executeCalculatorBestSingleHours(parseInt(channel));
							break;
						case enCalcType.BestHoursBlock:
							await this.executeCalculatorBestHoursBlock(parseInt(channel));
							break;
						case enCalcType.BestCostLTF:
							await this.executeCalculatorBestCost(parseInt(channel), true);
							break;
						case enCalcType.BestSingleHoursLTF:
							await this.executeCalculatorBestSingleHours(parseInt(channel), true);
							break;
						case enCalcType.BestHoursBlockLTF:
							await this.executeCalculatorBestHoursBlock(parseInt(channel), true);
							break;
						case enCalcType.SmartBatteryBuffer:
							await this.executeCalculatorSmartBatteryBuffer(parseInt(channel));
							break;
						case enCalcType.BestPercentage:
							await this.executeCalculatorBestPercentage(parseInt(channel));
							break;
						case enCalcType.BestPercentageLTF:
							await this.executeCalculatorBestPercentage(parseInt(channel), true);
							break;
						case enCalcType.SmartBatteryBufferLTF:
							await this.executeCalculatorSmartBatteryBuffer(parseInt(channel), true);
							break;
						default:
							this.adapter.log.debug(`[tibberCalculator]: unknown value for type: ${this.adapter.config.CalculatorList[channel].chType}`);
					}
				} else {
					this.adapter.log.debug(
						`[tibberCalculator]: channel ${channel} - ${getCalcTypeDescription(this.adapter.config.CalculatorList[channel].chType)}; execution skipped because channel not set to active in channel states`,
					);
				}
			} catch (error) {
				this.adapter.log.warn(`unhandled error ${error as Error} while executing calculator channel ${channel}`);
			}
		}
	}

	/**
	 * Updates the usage statistics of the calculator.
	 * If calculator is enabled (`UseCalculator`), it initializes the statistics and iterates over the `CalculatorList`
	 * to increment the statistics values for each entry.
	 * Errors encountered during iteration are caught and logged as debug messages.
	 */
	updateCalculatorUsageStats(): void {
		if (!this.adapter.config.UseCalculator) {
			return;
		}
		this.initStats();
		this.adapter.config.CalculatorList.forEach(channel => {
			try {
				this.increaseStatsValueByOne(channel.chType);
			} catch (error) {
				this.adapter.log.debug(`[tibberCalculator]: unhandled error ${error as Error} in calculator usage scan`);
			}
		});
	}

	/**
	 * Executes the BestCost (or BestCostLTF) calculator logic for the given channel.
	 * Sets the channel output to ON when the current price is below the configured trigger price,
	 * and writes the full price schedule with per-slot output flags to OutputJSON.
	 *
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param modeLTF - When `true`, applies Limited Time Frame boundaries from the channel config.
	 * @returns Resolves when output states and OutputJSON have been updated.
	 */
	private async executeCalculatorBestCost(channel: number, modeLTF = false): Promise<void> {
		const now = new Date();
		const channelConfig = this.adapter.config.CalculatorList[channel];
		let valueToSet = channelConfig.chValueOff;
		try {
			if (!channelConfig.chActive) {
				// not active
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
			} else if (modeLTF && now < channelConfig.chStartTime) {
				// chActive but before LTF
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF, true);
				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelConfig.chTriggerPrice > (entry.total ?? 0) ? true : false, // mark all cheap hours
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.shiftLTF(channel);
			} else {
				if (modeLTF && now > addDays(channelConfig.chStartTime, channelConfig.chRepeatDays)) {
					// chActive and inside LTF, but more than repeatdays after start -> shift LTF
					this.shiftLTF(channel);
				}
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF, true);

				//#region *** Find channel result ***
				const currentPrice = await this.getStateValue(`Homes.${channelConfig.chHomeID}.CurrentPrice.total`);
				if (channelConfig.chTriggerPrice > currentPrice) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelConfig.chTriggerPrice > (entry.total ?? 0) ? true : false, // mark all cheap hours
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			}
			this.setChannelOutStates(channel, valueToSet);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

	/**
	 * Executes the BestSingleHours (or BestSingleHoursLTF) calculator logic for the given channel.
	 * Selects the N cheapest individual 15-minute slots and sets the output to ON during the matching slot.
	 * Writes the full price schedule with per-slot output flags to OutputJSON.
	 *
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param modeLTF - When `true`, applies Limited Time Frame boundaries from the channel config.
	 * @returns Resolves when output states and OutputJSON have been updated.
	 */
	private async executeCalculatorBestSingleHours(channel: number, modeLTF = false): Promise<void> {
		const now = new Date();
		const channelConfig = this.adapter.config.CalculatorList[channel];
		let valueToSet = channelConfig.chValueOff;
		try {
			if (!channelConfig.chActive) {
				// not active -> choose chValueOff
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
			} else if (modeLTF && now < channelConfig.chStartTime) {
				// chActive but before LTF -> choose chValueOff
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
				// get first amount of block entries und test for matching time block
				const channelResult: boolean[] = filteredPrices.slice(0, channelConfig.chAmountHours).map((entry: IPrice) => checkQuarterMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.shiftLTF(channel);
			} else {
				if (modeLTF && now > addDays(channelConfig.chStartTime, channelConfig.chRepeatDays)) {
					// chActive and inside LTF, but more than repeatdays after start -> shift LTF
					this.shiftLTF(channel);
				}
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
				// get first chAmountHours entries und test for matching time block
				const channelResult: boolean[] = filteredPrices.slice(0, channelConfig.chAmountHours).map((entry: IPrice) => checkQuarterMatch(entry));
				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total ?? 0,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			}
			this.setChannelOutStates(channel, valueToSet);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

	/**
	 * Executes the BestHoursBlock (or BestHoursBlockLTF) calculator logic for the given channel.
	 * Finds the contiguous block of N 15-minute slots with the lowest total price sum and sets
	 * the output to ON during the matching slot. Also writes block start/end times and average cost.
	 * Writes the full price schedule with per-slot output flags to OutputJSON.
	 *
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param modeLTF - When `true`, applies Limited Time Frame boundaries from the channel config.
	 * @returns Resolves when output states, block timing states, and OutputJSON have been updated.
	 */
	private async executeCalculatorBestHoursBlock(channel: number, modeLTF = false): Promise<void> {
		const now = new Date();
		const channelConfig = this.adapter.config.CalculatorList[channel];
		let valueToSet = channelConfig.chValueOff;
		try {
			if (!channelConfig.chActive) {
				// not active -> choose chValueOff
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
			} else if (modeLTF && now < channelConfig.chStartTime) {
				// chActive but before LTF -> choose chValueOff
				this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);

				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				let minSum = Number.MAX_VALUE;
				let startIndex = 0;
				const n = Math.min(channelConfig.chAmountHours, filteredPrices.length);
				for (let i = 0; i < filteredPrices.length - n + 1; i++) {
					let sum = 0;
					for (let j = i; j < i + n; j++) {
						sum += filteredPrices[j].total ?? 0;
					}
					if (sum < minSum) {
						minSum = sum;
						startIndex = i;
					}
				}
				const channelResult: boolean[] = filteredPrices.slice(startIndex, startIndex + n).map((entry: IPrice) => checkQuarterMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index - startIndex] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
				this.shiftLTF(channel);
			} else {
				if (modeLTF && now > addDays(channelConfig.chStartTime, channelConfig.chRepeatDays)) {
					// chActive and inside LTF, but more than repeatdays after start -> shift LTF
					this.shiftLTF(channel);
				}
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				let minSum = Number.MAX_VALUE;
				let startIndex = 0;
				const n = Math.min(channelConfig.chAmountHours, filteredPrices.length);
				for (let i = 0; i < filteredPrices.length - n + 1; i++) {
					let sum = 0;
					for (let j = i; j < i + n; j++) {
						sum += filteredPrices[j].total ?? 0;
					}
					if (sum < minSum) {
						minSum = sum;
						startIndex = i;
					}
				}
				const channelResult: boolean[] = filteredPrices.slice(startIndex, startIndex + n).map((entry: IPrice) => checkQuarterMatch(entry));
				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index - startIndex] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion

				// calculate average cost of determined block of hours, write to data point
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AverageTotalCost`,
					Math.round(1000 * (minSum / n)) / 1000,
					true,
				);

				//#region *** Write start and stop time of determined block to data points ***
				const beginDate = new Date(filteredPrices[startIndex]?.startsAt ?? Date.now());
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStartFullHour`, format(beginDate, "H"), true);
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStart`,
					filteredPrices[startIndex]?.startsAt ?? Date.now(),
					true,
				);
				const endDate = new Date(filteredPrices[startIndex + n - 1]?.startsAt ?? Date.now());
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEndFullHour`,
					format(addMinutes(endDate, 15), "H"),
					true,
				);
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEnd`,
					format(addMinutes(endDate, 15), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
					true,
				);
				//#endregion
			}
			this.setChannelOutStates(channel, valueToSet);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

	//#region *** SPECIFICATION Smart Battery Buffer ***
	/*
		Summary:
			Develop a channel that categorizes slots of 15 minutes with energy prices into three groups—cheap, normal, and expensive.
			The categorization is based on the total price of each slot, considering a efficiency loss of a battery system.

		Detailed Description:
			The system has an algorithm to organize timeslots with energy prices, providing users with a clear understanding of price
			dynamics. The algorithm follows these steps:
			- Sort by total price: Sort timeslots in ascending order based on the total price.
			- Identify cheap timeslots: Starting with the cheapest timeslot, include timeslots in the cheap category if the total price is
			lower than the total price of the most expensive timeslot minus a minimum distance (MinDelta). Hereby calculate MinDelta
			based on the average total price of the cheap timeslots and a user-defined efficiency loss of a battery system. Identify cheap
			timeslots starting from the lowest prices and include them only as long as the price difference to the most expensive timeslot
			exceeds the dynamically calculated minimum delta (battery efficiency loss). The number of cheap timeslots is additionally capped by maxCheapCount.
			- Determine the Most Expensive Hour Among the Cheap: Identify the timeslot with the highest total price among the cheap slots.
			- Classify Normal and Expensive Hours: Hours not classified as cheap are further categorized as follows:
				Normal Timeslots: Total price is lower than MinDelta plus the highest total price among the cheap slots.
				Expensive Timeslots: Total price is higher than MinDelta plus the highest total price among the cheap slots.

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
	/**
	 * Executes the SmartBatteryBuffer (or SmartBatteryBufferLTF) calculator logic for the given channel.
	 * Classifies all 15-minute slots into cheap (charge battery), normal (idle), or expensive (feed into grid)
	 * based on a dynamic minimum price delta derived from the configured battery efficiency loss.
	 * Sets two outputs: Output (cheap → ON) and Output2 (expensive → ON).
	 * Writes separate JSON schedules to OutputJSON (cheap slots) and OutputJSON2 (expensive slots).
	 *
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param modeLTF - When `true`, applies Limited Time Frame boundaries from the channel config.
	 * @returns Resolves when both output states and both OutputJSON states have been updated.
	 */
	private async executeCalculatorSmartBatteryBuffer(channel: number, modeLTF = false): Promise<void> {
		const now = new Date();
		const channelConfig = this.adapter.config.CalculatorList[channel];
		let valueToSet = channelConfig.chValueOff;
		let valueToSet2 = channelConfig.chValueOff2;
		try {
			if (!channelConfig.chActive) {
				// not active - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2) - not by channel!!
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, `[]`, true);
			} else if (modeLTF && now < channelConfig.chStartTime) {
				// chActive but before LTF -> choose chValueOff, but calculate results
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);
				const maxCheapCount: number = (await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AmountHours`)) * 4;
				// maxCheapCount is an upper bound.
				// The actual number of cheap slots is determined by price distance (minDelta), not by the requested hour count.
				const efficiencyLoss: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.EfficiencyLoss`);
				const cheapTimeSlots: IPrice[] = [];
				const normalTimeSlots: IPrice[] = [];
				const expensiveTimeSlots: IPrice[] = [];
				let cheapIndex = 0;
				let minDelta = 0;

				//#region *** Find channel result ***
				// sort by total price
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));

				while (cheapIndex < filteredPrices.length && cheapTimeSlots.length < maxCheapCount) {
					const currentTimeSlot = filteredPrices[cheapIndex];
					if (currentTimeSlot.total ?? 0 < (filteredPrices[filteredPrices.length - 1].total ?? 0) - minDelta) {
						cheapTimeSlots.push(currentTimeSlot);
						minDelta = calculateMinDelta(cheapTimeSlots, efficiencyLoss);
					} else {
						break;
					}
					cheapIndex++;
				}

				const maxCheapTotal = Math.max(...cheapTimeSlots.map(timeSlot => timeSlot.total ?? 0));

				for (const timeSlot of filteredPrices) {
					if (!cheapTimeSlots.includes(timeSlot)) {
						if (timeSlot.total ?? 0 > minDelta + maxCheapTotal) {
							expensiveTimeSlots.push(timeSlot);
						} else {
							normalTimeSlots.push(timeSlot);
						}
					}
				}

				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - cheap: ${cheapTimeSlots.map(timeSlot => timeSlot.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - normal: ${normalTimeSlots.map(timeSlot => timeSlot.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - expensive: ${expensiveTimeSlots.map(timeSlot => timeSlot.total).join(", ")}`,
				);

				const resultCheap: boolean[] = cheapTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				//const resultNormal: boolean[] = normalTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				//const resultExpensive: boolean[] = expensiveTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: resultCheap[index] !== undefined ? true : false, // Check if resultCheap[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				const jsonOutput2 = filteredPrices
					.map((entry: IPrice) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: expensiveTimeSlots.some((expensive: IPrice) => expensive.startsAt === entry.startsAt), // Check if entry is part of resultExpensive
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, JSON.stringify(jsonOutput2, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff, channelOff2 and disable channels or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, `[]`, true);
				this.shiftLTF(channel);
			} else {
				if (modeLTF && now > addDays(channelConfig.chStartTime, channelConfig.chRepeatDays)) {
					// chActive and inside LTF, but more than repeatdays after start -> shift LTF
					this.shiftLTF(channel);
				}
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);
				const maxCheapCount: number = (await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AmountHours`)) * 4;
				const efficiencyLoss: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.EfficiencyLoss`);
				const cheapTimeSlots: IPrice[] = [];
				const normalTimeSlots: IPrice[] = [];
				const expensiveTimeSlots: IPrice[] = [];
				let cheapIndex = 0;
				let minDelta = 0;

				//#region *** Find channel result ***
				// sort by total price
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));

				while (cheapIndex < filteredPrices.length && cheapTimeSlots.length < maxCheapCount) {
					const currentTimeSlot = filteredPrices[cheapIndex];
					if (currentTimeSlot.total ?? 0 < (filteredPrices[filteredPrices.length - 1].total ?? 0) - minDelta) {
						cheapTimeSlots.push(currentTimeSlot);
						minDelta = calculateMinDelta(cheapTimeSlots, efficiencyLoss);
					} else {
						break;
					}
					cheapIndex++;
				}

				const maxCheapTotal = Math.max(...cheapTimeSlots.map(slot => slot.total ?? 0));

				for (const timeSlot of filteredPrices) {
					if (!cheapTimeSlots.includes(timeSlot)) {
						if (timeSlot.total ?? 0 > minDelta + maxCheapTotal) {
							expensiveTimeSlots.push(timeSlot);
						} else {
							normalTimeSlots.push(timeSlot);
						}
					}
				}

				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - cheap prices: ${cheapTimeSlots.map(slot => slot.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - normal prices: ${normalTimeSlots.map(slot => slot.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - expensive prices: ${expensiveTimeSlots.map(slot => slot.total).join(", ")}`,
				);

				const resultCheap: boolean[] = cheapTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				const resultNormal: boolean[] = normalTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				const resultExpensive: boolean[] = expensiveTimeSlots.map((entry: IPrice) => checkQuarterMatch(entry));
				//#endregion

				//#region *** identify if an element is true and generate output
				if (resultCheap.some(value => value)) {
					// Cheap Hours - enable battery charging (ON-1) and disable feed into home energy system (OFF-2)
					valueToSet = channelConfig.chValueOn;
					valueToSet2 = channelConfig.chValueOff2;
				} else if (resultNormal.some(value => value)) {
					// Normal Hours - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
					valueToSet = channelConfig.chValueOff;
					valueToSet2 = channelConfig.chValueOff2;
				} else if (resultExpensive.some(value => value)) {
					// Expensive Hours - disable battery charging (OFF-1) and enable feed into home energy system (ON-2)
					valueToSet = channelConfig.chValueOff;
					valueToSet2 = channelConfig.chValueOn2;
				} else {
					this.adapter.log.warn(
						this.generateErrorMessage(`no result found for SBB`, `execute calculator for smart battery buffer in channel ${channel}`),
					);
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: resultCheap[index] !== undefined ? true : false, // Check if resultCheap[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);

				const jsonOutput2 = filteredPrices
					.map((entry: IPrice) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: expensiveTimeSlots.some((expensive: IPrice) => expensive.startsAt === entry.startsAt), // Check if entry is part of resultExpensive
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, JSON.stringify(jsonOutput2, null, 2), true);
				//#endregion
			}

			function calculateMinDelta(cheapTimeSlots: IPrice[], efficiencyLoss: number): number {
				const cheapTotalSum = cheapTimeSlots.reduce((sum, slot) => sum + (slot.total ?? 0), 0);
				const cheapAverage = cheapTotalSum / cheapTimeSlots.length;
				return cheapAverage * efficiencyLoss;
			}

			this.setChannelOutStates(channel, valueToSet, valueToSet2);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

	/**
	 * Executes the BestPercentage (or BestPercentageLTF) calculator logic for the given channel.
	 * Activates the output for all slots whose price is within the configured percentage above
	 * the cheapest slot price in the current time window.
	 * Writes the full price schedule with per-slot output flags to OutputJSON.
	 *
	 * @param channel - Index of the channel in `CalculatorList`.
	 * @param modeLTF - When `true`, applies Limited Time Frame boundaries from the channel config.
	 * @returns Resolves when output states and OutputJSON have been updated.
	 */
	private async executeCalculatorBestPercentage(channel: number, modeLTF = false): Promise<void> {
		const now = new Date();
		const channelConfig = this.adapter.config.CalculatorList[channel];
		let valueToSet = channelConfig.chValueOff;
		const percentage = channelConfig.chPercentage;
		try {
			if (!channelConfig.chActive) {
				// not active -> choose chValueOff
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
			} else if (modeLTF && now < channelConfig.chStartTime) {
				// chActive but before LTF -> choose chValueOff
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
				const cheapestPrice = filteredPrices[0]?.total ?? 0;
				const allowedPrices = filteredPrices.filter(entry => (entry.total ?? 0) <= cheapestPrice * (1 + percentage / 100));
				const channelResult: boolean[] = allowedPrices.map((entry: IPrice) => checkQuarterMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.shiftLTF(channel);
			} else {
				if (modeLTF && now > addDays(channelConfig.chStartTime, channelConfig.chRepeatDays)) {
					// chActive and inside LTF, but more than repeatdays after start -> shift LTF
					this.shiftLTF(channel);
				}
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => (a.total ?? 0) - (b.total ?? 0));
				const cheapestPrice = filteredPrices[0]?.total ?? 0;
				const allowedPrices = filteredPrices.filter(entry => (entry.total ?? 0) <= cheapestPrice * (1 + percentage / 100));
				const channelResult: boolean[] = allowedPrices.map((entry: IPrice) => checkQuarterMatch(entry));

				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: entry.startsAt ? new Date(entry.startsAt).getHours() : null, // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt ?? 0).getTime() - new Date(b.startsAt ?? 0).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			}
			this.setChannelOutStates(channel, valueToSet);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

	/**
	 * Sets the output state(s) for a specific calculator channel.
	 *
	 * Depending on the configuration of the channel, the function sets either a custom target state or a default state for the specified channel.
	 * Optionally, a second value can also be set.
	 *
	 * @param channel - The index of the channel in the configuration list (`CalculatorList`).
	 * @param valueToSet - The primary value to set for the channel's output state.
	 * @param valueToSet2 - An optional secondary value to set for the channel's second output state. Defaults to `EMPTY`.
	 *
	 * ### Function Behavior:
	 * - If a custom `chTargetState` is defined for the channel (length > 10 and does not start with "choose your state to drive"),
	 *   the function sets this custom target state using `setForeignStateAsync`.
	 * - Otherwise, it sets a default state for the channel in the format `Homes.{chHomeID}.Calculations.{channel}.Output`.
	 * - Logs debug information about the state being set, including the channel type and the value.
	 * - If `valueToSet2` is not `EMPTY`, the function repeats the process for a secondary target state.
	 */
	private setChannelOutStates(channel: number, valueToSet: string, valueToSet2 = `EMPTY`): void {
		let sOutState = ``;
		const channelConfig = this.adapter.config.CalculatorList[channel];
		if (channelConfig?.chTargetState?.length > 10 && !channelConfig.chTargetState.startsWith("choose your state to drive")) {
			sOutState = channelConfig.chTargetState;
			void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
		} else {
			sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
			void this.adapter.setState(sOutState, convertValue(valueToSet), true);
		}
		this.adapter.log.debug(
			`[tibberCalculator]: channel ${channel} - ${getCalcTypeDescription(channelConfig.chType)}; setting state: ${sOutState} to ${valueToSet}`,
		);
		if (valueToSet2 != `EMPTY`) {
			sOutState = ``; // reinit for output 2
			if (channelConfig?.chTargetState2?.length > 10 && !channelConfig.chTargetState2.startsWith("choose your state to drive")) {
				sOutState = channelConfig.chTargetState2;
				void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet2));
			} else {
				sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output2`;
				void this.adapter.setState(sOutState, convertValue(valueToSet2), true);
			}
			this.adapter.log.debug(
				`[tibberCalculator]: channel ${channel} - ${getCalcTypeDescription(channelConfig.chType)}; setting state 2: ${sOutState} to ${valueToSet2}`,
			);
		}
	}

	/**
	 * Retrieves price data for a specific channel, optionally limited to a defined time frame.
	 * The function fetches price information for today, and if Limited Time Frame (LTF) mode is enabled, it merges the data from yesterday, today, and tomorrow,
	 * filtering it according to the specified start and stop times.
	 *
	 * @param channel - The index representing the channel in the configuration.
	 * @param modeLTF - A boolean indicating whether Limited Time Frame mode is active.
	 * @param modeTwoDays - A boolean indicating whether also tomorrow should be added to non LTF channels. Default false.
	 * @returns An array of price objects (`IPrice[]`) relevant to the specified channel and time frame.
	 *          - If `modeLTF` is false, returns today's prices as-is.
	 *          - If `modeLTF` is true, merges price data from yesterday, today, and tomorrow,
	 *            and filters it to include only prices within the specified time frame.
	 */
	async getPricesLTF(channel: number, modeLTF: boolean, modeTwoDays = false): Promise<IPrice[]> {
		const { chHomeID, chStartTime, chStopTime } = this.adapter.config.CalculatorList[channel];
		const pricesToday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesToday.json`));
		const pricesTomorrow: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesTomorrow.json`));
		let mergedPrices: IPrice[] = pricesToday;
		// Merge prices if pricesTomorrow is not empty
		if (pricesTomorrow.length !== 0) {
			mergedPrices = [...pricesToday, ...pricesTomorrow];
		}
		if (!modeLTF) {
			if (!modeTwoDays) {
				return pricesToday;
			}
			// TwoDays needed for e.g. non LTF best cost channel
			return mergedPrices;
		}
		// Limited Time Frame mode
		const pricesYesterday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesYesterday.json`));
		const startTime: Date = chStartTime;
		const stopTime: Date = chStopTime;

		// Merge prices if pricesYesterday is not empty
		if (pricesYesterday.length !== 0) {
			mergedPrices = [...pricesYesterday, ...mergedPrices];
		}

		// filter objects to time frame
		const filteredPrices = mergedPrices.filter(price => {
			const priceDate = new Date(price.startsAt ?? 0);
			return priceDate >= startTime && priceDate < stopTime;
		});
		return filteredPrices;
	}

	/**
	 * Handles the actions to be performed after a LTF has completed for a specific channel.
	 * This function updates the active state, start time, and stop time of a calculation based on the
	 * provided channel configuration. If no repeat days are specified, the calculation is deactivated.
	 * Otherwise, the start and stop times are adjusted according to the repeat days parameter.
	 *
	 * @param channel - The number representing the channel to process.
	 */
	shiftLTF(channel: number): void {
		const { chHomeID, chRepeatDays, chStartTime, chStopTime } = this.adapter.config.CalculatorList[channel];
		if (chRepeatDays == 0) {
			void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.Active`, false, true);
			return;
		}
		// chRepeatDays present, change start and stop time accordingly
		const newStartTime = addDays(chStartTime, chRepeatDays);
		const newStopTime = addDays(chStopTime, chRepeatDays);

		void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.StartTime`, format(newStartTime, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
		void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.StopTime`, format(newStopTime, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);

		this.adapter.config.CalculatorList[channel].chStartTime = addDays(chStartTime, chRepeatDays);
		this.adapter.config.CalculatorList[channel].chStopTime = addDays(chStopTime, chRepeatDays);
	}
}

/**
 * Checks if the current time is within the 15-minute interval of the given entry's start time.
 *
 * @param entry - An object of type `IPrice` containing a `startsAt` property (ISO date string).
 * @returns True if the current time is within the 15-minute block, otherwise false.
 */
function checkQuarterMatch(entry: IPrice): boolean {
	const now = new Date();
	const start = parseISO(entry.startsAt ?? "");
	const end = addMinutes(start, 15);
	return now >= start && now < end;
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
	}
	const numericValue = parseFloat(Value);
	return isNaN(numericValue) ? Value : numericValue;
}
