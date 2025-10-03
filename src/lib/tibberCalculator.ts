import type * as utils from "@iobroker/adapter-core";
import { addDays, addHours, format } from "date-fns";
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
	 * initStats
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
	 *
	 * @param homeId - ID of the home
	 * @param channel - ID of the calculator channel
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
					await this.setup_chAmountHours(homeId, channel);
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
					await this.setup_chAmountHours(homeId, channel);
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
					await this.setup_chAmountHours(homeId, channel);
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
					await this.setup_chAmountHours(homeId, channel);
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
					await this.setup_chAmountHours(homeId, channel);
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
	private async deleteLTFInputs(homeId: string, channel: number): Promise<void> {
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
		await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
	}

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
				`amount of hours to trigger this channel`,
				undefined,
				`level`,
				true,
				true,
			);
			const valueAmountHours = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
			if (typeof valueAmountHours === "number") {
				channelConfig.chAmountHours = valueAmountHours;
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
				channelConfig.chAmountHours = valueEfficiencyLoss;
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
	private setup_chBlockStartFullHour(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(
				`Homes.${homeId}.Calculations.${channel}.BlockStartFullHour`,
				`-`,
				`first hour of determined block`,
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
	private setup_chBlockEndFullHour(homeId: string, channel: number, delMode = false): void {
		try {
			const channelConfig = this.adapter.config.CalculatorList[channel];
			void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockEndFullHour`, `-`, `end hour of determined block`, `value`, false, false);
			if (!delMode) {
				this.adapter.log.debug(
					`[tibberCalculator]: setup output state BlockEndFullHour in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`,
				);
			}
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEndFullHour for calculator`));
		}
	}
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
				this.adapter.log.warn(`unhandled error ${error} while executing calculator channel ${channel}`);
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
				this.adapter.log.debug(`[tibberCalculator]: unhandled error ${error} in calculator usage scan`);
			}
		});
	}

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
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelConfig.chTriggerPrice > entry.total ? true : false, // mark all cheap hours
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.handleAfterLTF(channel);
			} else {
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
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelConfig.chTriggerPrice > entry.total ? true : false, // mark all cheap hours
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
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
				filteredPrices.sort((a, b) => a.total - b.total);
				// get first chAmountHours entries und test for matching hour
				const channelResult: boolean[] = filteredPrices.slice(0, channelConfig.chAmountHours).map((entry: IPrice) => checkHourMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.handleAfterLTF(channel);
			} else {
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => a.total - b.total);
				// get first chAmountHours entries und test for matching hour
				const channelResult: boolean[] = filteredPrices.slice(0, channelConfig.chAmountHours).map((entry: IPrice) => checkHourMatch(entry));
				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
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
						sum += filteredPrices[j].total;
					}
					if (sum < minSum) {
						minSum = sum;
						startIndex = i;
					}
				}
				const channelResult: boolean[] = filteredPrices.slice(startIndex, startIndex + n).map((entry: IPrice) => checkHourMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index - startIndex] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
				this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
				this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
				this.handleAfterLTF(channel);
			} else {
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				let minSum = Number.MAX_VALUE;
				let startIndex = 0;
				const n = Math.min(channelConfig.chAmountHours, filteredPrices.length);
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
				const channelResult: boolean[] = filteredPrices.slice(startIndex, startIndex + n).map((entry: IPrice) => checkHourMatch(entry));
				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index - startIndex] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion

				// calculate average cost of determined block of hours, write to data point
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AverageTotalCost`,
					Math.round(1000 * (minSum / n)) / 1000,
					true,
				);

				//#region *** Write start and stop time of determined block to data points ***
				const beginDate = new Date(filteredPrices[startIndex].startsAt);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStartFullHour`, format(beginDate, "H"), true);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStart`, filteredPrices[startIndex].startsAt, true);
				const endDate = new Date(filteredPrices[startIndex + n - 1].startsAt);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEndFullHour`, format(addHours(endDate, 1), "H"), true);
				void this.adapter.setState(
					`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEnd`,
					format(addHours(endDate, 1), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
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
				const maxCheapCount: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AmountHours`);
				const efficiencyLoss: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.EfficiencyLoss`);
				const cheapHours: IPrice[] = [];
				const normalHours: IPrice[] = [];
				const expensiveHours: IPrice[] = [];
				let cheapIndex = 0;
				let minDelta = 0;

				//#region *** Find channel result ***
				// sort by total price
				filteredPrices.sort((a, b) => a.total - b.total);

				while (cheapIndex < filteredPrices.length && cheapHours.length < maxCheapCount) {
					const currentHour = filteredPrices[cheapIndex];
					if (currentHour.total < filteredPrices[filteredPrices.length - 1].total - minDelta) {
						cheapHours.push(currentHour);
						minDelta = calculateMinDelta(cheapHours, efficiencyLoss);
					} else {
						break;
					}
					cheapIndex++;
				}

				const maxCheapTotal = Math.max(...cheapHours.map(hour => hour.total));

				for (const hour of filteredPrices) {
					if (!cheapHours.includes(hour)) {
						if (hour.total > minDelta + maxCheapTotal) {
							expensiveHours.push(hour);
						} else {
							normalHours.push(hour);
						}
					}
				}

				this.adapter.log.debug(`[tibberCalculator]: channel ${channel} SBB-type result - cheap: ${cheapHours.map(hour => hour.total).join(", ")}`);
				this.adapter.log.debug(`[tibberCalculator]: channel ${channel} SBB-type result - normal: ${normalHours.map(hour => hour.total).join(", ")}`);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - expensive: ${expensiveHours.map(hour => hour.total).join(", ")}`,
				);

				const resultCheap: boolean[] = cheapHours.map((entry: IPrice) => checkHourMatch(entry));
				//const resultNormal: boolean[] = normalHours.map((entry: IPrice) => checkHourMatch(entry));
				//const resultExpensive: boolean[] = expensiveHours.map((entry: IPrice) => checkHourMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: resultCheap[index] !== undefined ? true : false, // Check if resultCheap[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				const jsonOutput2 = filteredPrices
					.map((entry: IPrice) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: expensiveHours.some((expensive: IPrice) => expensive.startsAt === entry.startsAt), // Check if entry is part of resultExpensive
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, JSON.stringify(jsonOutput2, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff, channelOff2 and disable channels or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, `[]`, true);
				this.handleAfterLTF(channel);
			} else {
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);
				const maxCheapCount: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AmountHours`);
				const efficiencyLoss: number = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.EfficiencyLoss`);
				const cheapHours: IPrice[] = [];
				const normalHours: IPrice[] = [];
				const expensiveHours: IPrice[] = [];
				let cheapIndex = 0;
				let minDelta = 0;

				//#region *** Find channel result ***
				// sort by total price
				filteredPrices.sort((a, b) => a.total - b.total);

				while (cheapIndex < filteredPrices.length && cheapHours.length < maxCheapCount) {
					const currentHour = filteredPrices[cheapIndex];
					if (currentHour.total < filteredPrices[filteredPrices.length - 1].total - minDelta) {
						cheapHours.push(currentHour);
						minDelta = calculateMinDelta(cheapHours, efficiencyLoss);
					} else {
						break;
					}
					cheapIndex++;
				}

				const maxCheapTotal = Math.max(...cheapHours.map(hour => hour.total));

				for (const hour of filteredPrices) {
					if (!cheapHours.includes(hour)) {
						if (hour.total > minDelta + maxCheapTotal) {
							expensiveHours.push(hour);
						} else {
							normalHours.push(hour);
						}
					}
				}

				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - cheap prices: ${cheapHours.map(hour => hour.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - normal prices: ${normalHours.map(hour => hour.total).join(", ")}`,
				);
				this.adapter.log.debug(
					`[tibberCalculator]: channel ${channel} SBB-type result - expensive prices: ${expensiveHours.map(hour => hour.total).join(", ")}`,
				);
				const resultCheap: boolean[] = cheapHours.map((entry: IPrice) => checkHourMatch(entry));
				const resultNormal: boolean[] = normalHours.map((entry: IPrice) => checkHourMatch(entry));
				const resultExpensive: boolean[] = expensiveHours.map((entry: IPrice) => checkHourMatch(entry));
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
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: resultCheap[index] !== undefined ? true : false, // Check if resultCheap[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);

				const jsonOutput2 = filteredPrices
					.map((entry: IPrice) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: expensiveHours.some((expensive: IPrice) => expensive.startsAt === entry.startsAt), // Check if entry is part of resultExpensive
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON2`, JSON.stringify(jsonOutput2, null, 2), true);
				//#endregion
			}

			function calculateMinDelta(cheapHours: IPrice[], efficiencyLoss: number): number {
				const cheapTotalSum = cheapHours.reduce((sum, hour) => sum + hour.total, 0);
				const cheapAverage = cheapTotalSum / cheapHours.length;
				return cheapAverage * efficiencyLoss;
			}

			this.setChannelOutStates(channel, valueToSet, valueToSet2);
		} catch (error) {
			this.adapter.log.warn(
				this.generateErrorMessage(error, `execute calculator for ${getCalcTypeDescription(channelConfig.chType)} in channel ${channel}`),
			);
		}
	}

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
				filteredPrices.sort((a, b) => a.total - b.total);
				const cheapestPrice = filteredPrices[0]?.total;
				const allowedPrices = filteredPrices.filter(entry => entry.total <= cheapestPrice * (1 + percentage / 100));
				const channelResult: boolean[] = allowedPrices.map((entry: IPrice) => checkHourMatch(entry));
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, JSON.stringify(jsonOutput, null, 2), true);
				//#endregion
			} else if (modeLTF && now > channelConfig.chStopTime) {
				// chActive but after LTF -> choose chValueOff and disable channel or generate new running period
				void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.OutputJSON`, `[]`, true);
				this.handleAfterLTF(channel);
			} else {
				// chActive and inside LTF -> choose desired value
				const filteredPrices: IPrice[] = await this.getPricesLTF(channel, modeLTF);

				//#region *** Find channel result ***
				// sort by total cost
				filteredPrices.sort((a, b) => a.total - b.total);
				const cheapestPrice = filteredPrices[0]?.total;
				const allowedPrices = filteredPrices.filter(entry => entry.total <= cheapestPrice * (1 + percentage / 100));
				const channelResult: boolean[] = allowedPrices.map((entry: IPrice) => checkHourMatch(entry));

				// identify if any element is true
				if (channelResult.some(value => value)) {
					valueToSet = channelConfig.chValueOn;
				}
				//#endregion

				//#region *** Mark the entries with the result and create JSON output ***
				const jsonOutput = filteredPrices
					.map((entry: IPrice, index: number) => ({
						hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
						startsAt: entry.startsAt,
						total: entry.total,
						output: channelResult[index] !== undefined ? true : false, // Check if channelResult[index] is defined
					}))
					.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
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
			const priceDate = new Date(price.startsAt);
			return priceDate >= startTime && priceDate < stopTime;
		});
		return filteredPrices;
	}

	/**
	 * Handles the actions to be performed after a LTF has completed for a specific channel.
	 * This function updates the active state, start time, and stop time of a calculation
	 * based on the provided channel configuration. If no repeat days are specified, the calculation
	 * is deactivated. Otherwise, the start and stop times are adjusted according to the repeat days.
	 *
	 * @param channel - The number representing the channel to process.
	 */
	handleAfterLTF(channel: number): void {
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
	}
	const numericValue = parseFloat(Value);
	return isNaN(numericValue) ? Value : numericValue;
}
