"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberCalculator = void 0;
const date_fns_1 = require("date-fns");
const projectUtils_1 = require("./projectUtils");
/**
 * TibberCalculator
 */
class TibberCalculator extends projectUtils_1.ProjectUtils {
    numBestCost;
    numBestSingleHours;
    numBestHoursBlock;
    numBestCostLTF;
    numBestSingleHoursLTF;
    numBestHoursBlockLTF;
    numSmartBatteryBuffer;
    numBestPercentage;
    numBestPercentageLTF;
    /**
     * constructor
     *
     * @param adapter - ioBroker adapter instance
     */
    constructor(adapter) {
        super(adapter);
        this.numBestCost = 0;
        this.numBestSingleHours = 0;
        this.numBestHoursBlock = 0;
        this.numBestCostLTF = 0;
        this.numBestSingleHoursLTF = 0;
        this.numBestHoursBlockLTF = 0;
        this.numSmartBatteryBuffer = 0;
    }
    /**
     * initStats
     */
    initStats() {
        this.numBestCost = 0;
        this.numBestSingleHours = 0;
        this.numBestHoursBlock = 0;
        this.numBestCostLTF = 0;
        this.numBestSingleHoursLTF = 0;
        this.numBestHoursBlockLTF = 0;
        this.numSmartBatteryBuffer = 0;
        this.numBestPercentage = 0;
        this.numBestPercentageLTF = 0;
    }
    increaseStatsValueByOne(type) {
        switch (type) {
            case projectUtils_1.enCalcType.BestCost:
                this.numBestCost++;
                break;
            case projectUtils_1.enCalcType.BestSingleHours:
                this.numBestSingleHours++;
                break;
            case projectUtils_1.enCalcType.BestHoursBlock:
                this.numBestHoursBlock++;
                break;
            case projectUtils_1.enCalcType.BestCostLTF:
                this.numBestCostLTF++;
                break;
            case projectUtils_1.enCalcType.BestSingleHoursLTF:
                this.numBestSingleHoursLTF++;
                break;
            case projectUtils_1.enCalcType.BestHoursBlockLTF:
                this.numBestHoursBlockLTF++;
                break;
            case projectUtils_1.enCalcType.SmartBatteryBuffer:
                this.numSmartBatteryBuffer++;
                break;
            case projectUtils_1.enCalcType.BestPercentage:
                this.numBestPercentage++;
                break;
            case projectUtils_1.enCalcType.BestPercentageLTF:
                this.numBestPercentageLTF++;
        }
    }
    /**
     *
     * @param homeId - ID of the home
     * @param channel - ID of the calculator channel
     */
    async setupCalculatorStates(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (channelConfig.chName === undefined) {
                channelConfig.chName = `Channel Name`;
            }
            //#region *** setup calculation channels folder ***
            const typeDesc = (0, projectUtils_1.getCalcTypeDescription)(channelConfig.chType);
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
            void this.checkAndSetValueBoolean(`Homes.${homeId}.Calculations.${channel}.Active`, channelConfig.chActive, `Whether the calculation channel is active`, true, true);
            const valueActive = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.Active`);
            if (typeof valueActive === "boolean") {
                channelConfig.chActive = valueActive;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to Active: ${channelConfig.chActive}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chActive: ${valueActive}`);
            }
            //#endregion
            //#region *** setup and delete channel states according to channel type ***
            /*	"best cost"				| Input state: "TriggerPrice"
                                        | Output state: "Output"
                "best single hours" 	| Input state: "AmountHours"
                                        | Output state: "Output"
                "best hours block"		| Input state: "AmountHours"
                                        | Output state: "Output", "AverageTotalCost", "BlockStartFullHour", "BlockEndFullHour", "BlockStart", "BlockEnd"
                "best cost LTF"			| Input state: "TriggerPrice", "StartTime", "StopTime", "RepeatDays"
                                        | Output state: "Output"
                "best single hours LTF"	| Input state: "AmountHours", "StartTime", "StopTime", "RepeatDays"
                                        | Output state: "Output"
                "best hours block LTF"	| Input state: "AmountHours", "StartTime", "StopTime", "RepeatDays"
                                        | Output state: "Output"
                "smart battery buffer"	| Input state: "AmountHours", "EfficiencyLoss"
                                        | Output state: "Output", "Output2"
                "best percentage"	 	| Input state: "Percentage"
                                        | Output state: "Output"
                "best percentage LTF" 	| Input state: "Percentage", "StartTime", "StopTime", "RepeatDays"
                                        | Output state: "Output"
            */
            switch (channelConfig.chType) {
                case projectUtils_1.enCalcType.BestCost:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
                    await this.setup_chTriggerPrice(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.BestSingleHours:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
                    await this.setup_chAmountHours(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.BestHoursBlock:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
                    await this.setup_chAmountHours(homeId, channel);
                    this.setup_chAverageTotalCost(homeId, channel);
                    this.setup_chBlockStartFullHour(homeId, channel);
                    this.setup_chBlockEndFullHour(homeId, channel);
                    this.setup_chBlockStart(homeId, channel);
                    this.setup_chBlockEnd(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.BestCostLTF:
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
                case projectUtils_1.enCalcType.BestSingleHoursLTF:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
                    await this.setup_chAmountHours(homeId, channel);
                    await this.setup_chStartTime(homeId, channel);
                    await this.setup_chStopTime(homeId, channel);
                    await this.setup_chRepeatDays(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.BestHoursBlockLTF:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Percentage`);
                    await this.setup_chAmountHours(homeId, channel);
                    await this.setup_chStartTime(homeId, channel);
                    await this.setup_chStopTime(homeId, channel);
                    await this.setup_chRepeatDays(homeId, channel);
                    this.setup_chAverageTotalCost(homeId, channel);
                    this.setup_chBlockStartFullHour(homeId, channel);
                    this.setup_chBlockEndFullHour(homeId, channel);
                    this.setup_chBlockStart(homeId, channel);
                    this.setup_chBlockEnd(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.SmartBatteryBuffer:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
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
                    break;
                case projectUtils_1.enCalcType.BestPercentage:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.StopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStart`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStop`);
                    await this.setup_chPercentage(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
                    break;
                case projectUtils_1.enCalcType.BestPercentageLTF:
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AmountHours`); // INPUTS
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStartTime`);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.BlockStopTime`);
                    await this.setup_chStartTime(homeId, channel);
                    await this.setup_chStopTime(homeId, channel);
                    await this.setup_chRepeatDays(homeId, channel);
                    await this.setup_chPercentage(homeId, channel);
                    await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`); // OUTPUTS
                    await this.setup_chOutput(homeId, channel);
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
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of states for calculator`));
        }
    }
    async setup_chOutput(homeId, channel) {
        const channelConfig = this.adapter.config.CalculatorList[channel];
        if (channelConfig?.chTargetState && channelConfig.chTargetState.length > 10 && !channelConfig.chTargetState.startsWith("choose your state to drive")) {
            await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output`);
        }
        else {
            try {
                void this.checkAndSetValueBoolean(`Homes.${homeId}.Calculations.${channel}.Output`, false, `standard output if no special one selected in config`, true, true);
            }
            catch (error) {
                this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output for calculator for Home ${homeId}, Channel ${channel}`));
            }
        }
    }
    async setup_chOutput2(homeId, channel) {
        const channelConfig = this.adapter.config.CalculatorList[channel];
        if (channelConfig?.chTargetState2 &&
            channelConfig.chTargetState2.length > 10 &&
            !channelConfig.chTargetState2.startsWith("choose your state to drive")) {
            await this.adapter.delObjectAsync(`Homes.${homeId}.Calculations.${channel}.Output2`);
        }
        else {
            try {
                void this.checkAndSetValueBoolean(`Homes.${homeId}.Calculations.${channel}.Output2`, false, `standard output2 if no special one selected in config`, true, true);
            }
            catch (error) {
                this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Output2 for calculator for Home ${homeId}, Channel ${channel}`));
            }
        }
    }
    async setup_chTriggerPrice(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (channelConfig.chTriggerPrice === undefined) {
                channelConfig.chTriggerPrice = 0;
            }
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`, channelConfig.chTriggerPrice, `pricelevel to trigger this channel at`, undefined, true, true);
            const valueTriggerPrice = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.TriggerPrice`);
            if (typeof valueTriggerPrice === "number") {
                channelConfig.chTriggerPrice = valueTriggerPrice;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to TriggerPrice: ${channelConfig.chTriggerPrice}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chTriggerPrice: ${valueTriggerPrice}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state TriggerPrice for calculator`));
        }
    }
    async setup_chAmountHours(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chAmountHours  ***
            if (channelConfig.chAmountHours === undefined) {
                channelConfig.chAmountHours = 0;
            }
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.AmountHours`, channelConfig.chAmountHours, `amount of hours to trigger this channel`, undefined, true, true);
            const valueAmountHours = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.AmountHours`);
            if (typeof valueAmountHours === "number") {
                channelConfig.chAmountHours = valueAmountHours;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to AmountHours: ${channelConfig.chAmountHours}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chAmountHours: ${valueAmountHours}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AmountHours for calculator`));
        }
    }
    async setup_chPercentage(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chPercentage  ***
            if (channelConfig.chPercentage === undefined) {
                channelConfig.chPercentage = 0;
            }
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.Percentage`, channelConfig.chPercentage, `amount of percentage to trigger this channel`, undefined, true, true);
            const valuePercentage = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.Percentage`);
            if (typeof valuePercentage === "number") {
                channelConfig.chPercentage = valuePercentage;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to percentage: ${channelConfig.chPercentage}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chPercentage: ${valuePercentage}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state Percentage for calculator`));
        }
    }
    async setup_chStartTime(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chStartTime  ***
            if (channelConfig.chStartTime === undefined) {
                const today = new Date();
                today.setHours(0, 0, 0, 0); // sets clock to 0:00
                channelConfig.chStartTime = today;
            }
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.StartTime`, channelConfig.chStartTime.toISOString(), `Start time for this channel`, true, true);
            const valueStartTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StartTime`);
            if (typeof valueStartTime === "string") {
                channelConfig.chStartTime.setTime(Date.parse(valueStartTime));
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to StartTime: ${channelConfig.chStartTime.toISOString()}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chStartTime: ${valueStartTime}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StartTime for calculator`));
        }
    }
    async setup_chStopTime(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chStopTime  ***
            if (channelConfig.chStopTime === undefined) {
                const today = new Date();
                today.setHours(23, 59, 0, 0); // sets clock to 0:00
                channelConfig.chStopTime = today;
            }
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.StopTime`, channelConfig.chStopTime.toISOString(), `Stop time for this channel`, true, true);
            const valueStopTime = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.StopTime`);
            if (typeof valueStopTime === "string") {
                channelConfig.chStopTime.setTime(Date.parse(valueStopTime));
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to StopTime: ${channelConfig.chStopTime.toISOString()}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chStopTime: ${valueStopTime}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state StopTime for calculator`));
        }
    }
    async setup_chRepeatDays(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chRepeatDays  ***
            if (channelConfig.chRepeatDays === undefined) {
                channelConfig.chRepeatDays = 0;
            }
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.RepeatDays`, channelConfig.chRepeatDays, `number of days to shift this LTF channel for repetition`, undefined, true, true);
            const valueRepeatDays = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.RepeatDays`);
            if (typeof valueRepeatDays === "number") {
                channelConfig.chRepeatDays = valueRepeatDays;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to RepeatDays: ${channelConfig.chRepeatDays}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chTriggerPrice: ${valueRepeatDays}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state RepeatDays for calculator`));
        }
    }
    async setup_chEfficiencyLoss(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            //***  chEfficiencyLoss  ***
            if (channelConfig.chEfficiencyLoss === undefined) {
                channelConfig.chEfficiencyLoss = 0;
            }
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`, channelConfig.chEfficiencyLoss, `efficiency loss between charge and discharge of battery system`, undefined, true, true);
            const valueEfficiencyLoss = await this.getStateValue(`Homes.${homeId}.Calculations.${channel}.EfficiencyLoss`);
            if (typeof valueEfficiencyLoss === "number") {
                channelConfig.chAmountHours = valueEfficiencyLoss;
                this.adapter.log.debug(`setup calculator settings state in home: ${homeId} - channel: ${channel}-${channelConfig.chName} - set to EfficiencyLoss: ${channelConfig.chEfficiencyLoss}`);
            }
            else {
                this.adapter.log.debug(`Wrong type for chEfficiencyLoss: ${valueEfficiencyLoss}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state EfficiencyLoss for calculator`));
        }
    }
    setup_chAverageTotalCost(homeId, channel) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            void this.checkAndSetValueNumber(`Homes.${homeId}.Calculations.${channel}.AverageTotalCost`, 0, `average total cost in determined block`, undefined, false, false);
            this.adapter.log.debug(`setup calculator output state AverageTotalCost in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `setup of state AverageTotalCost for calculator`));
        }
    }
    setup_chBlockStartFullHour(homeId, channel, delMode = false) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockStartFullHour`, `-`, `first hour of determined block`, false, false);
            if (!delMode) {
                this.adapter.log.debug(`setup calculator output state BlockStartFullHour in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStartFullHour for calculator`));
        }
    }
    setup_chBlockEndFullHour(homeId, channel, delMode = false) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockEndFullHour`, `-`, `end hour of determined block`, false, false);
            if (!delMode) {
                this.adapter.log.debug(`setup calculator output state BlockEndFullHour in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEndFullHour for calculator`));
        }
    }
    setup_chBlockStart(homeId, channel, delMode = false) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockStart`, `-`, `start date string of determined block`, false, false);
            if (!delMode) {
                this.adapter.log.debug(`setup calculator output state BlockStart in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockStart for calculator`));
        }
    }
    setup_chBlockEnd(homeId, channel, delMode = false) {
        try {
            const channelConfig = this.adapter.config.CalculatorList[channel];
            void this.checkAndSetValue(`Homes.${homeId}.Calculations.${channel}.BlockEnd`, `-`, `stop date string of determined block`, false, false);
            if (!delMode) {
                this.adapter.log.debug(`setup calculator output state BlockEnd in home: ${homeId} - channel: ${channel}-${channelConfig.chName}`);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `write state BlockEnd for calculator`));
        }
    }
    /**
     * startCalculatorTasks
     *
     * @param onStateChange - Optional onStateChange mode (default = false)
     * @param firstRun - Optional firstRun mode (default = false)
     */
    startCalculatorTasks(onStateChange = false, firstRun = false) {
        if (!this.adapter.config.UseCalculator) {
            return;
        }
        const badComponents = ["tibberlink", "Homes", "Calculations"]; // we must not use an input as output!!
        for (const channel in this.adapter.config.CalculatorList) {
            //#region *** first run checks ***
            if (firstRun) {
                if (!this.adapter.config.CalculatorList[channel] ||
                    !this.adapter.config.CalculatorList[channel].chTargetState ||
                    !this.adapter.config.CalculatorList[channel].chTargetState.trim()) {
                    this.adapter.log.warn(`Empty destination state in calculator channel ${channel} defined - provide correct external state - channel will use internal state OUTPUT`);
                }
                if (this.adapter.config.CalculatorList[channel].chTargetState != null &&
                    typeof this.adapter.config.CalculatorList[channel].chTargetState === "string" &&
                    this.adapter.config.CalculatorList[channel].chTargetState !== "") {
                    const chTargetStateComponents = this.adapter.config.CalculatorList[channel].chTargetState.split(".");
                    let foundAllBadComponents = true;
                    badComponents.forEach(badComponent => {
                        if (!chTargetStateComponents.includes(badComponent)) {
                            foundAllBadComponents = false;
                        }
                    });
                    if (foundAllBadComponents) {
                        this.adapter.log.error(`Invalid destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`);
                        continue; // skip channel
                    }
                }
                else {
                    this.adapter.log.debug(`chTargetState is null or undefined in calculator channel ${channel}. Skipping channel execution.`);
                    continue; // skip channel
                }
                //checks for SmartBatteryBuffer only...
                if (this.adapter.config.CalculatorList[channel].chType === projectUtils_1.enCalcType.SmartBatteryBuffer) {
                    if (!this.adapter.config.CalculatorList[channel] ||
                        !this.adapter.config.CalculatorList[channel].chTargetState2 ||
                        !this.adapter.config.CalculatorList[channel].chTargetState2.trim()) {
                        this.adapter.log.warn(`Empty second destination state in calculator channel ${channel} defined - provide correct external state 2 - upon this, channel will use internal state OUTPUT2`);
                    }
                    if (this.adapter.config.CalculatorList[channel].chTargetState2 != null &&
                        typeof this.adapter.config.CalculatorList[channel].chTargetState2 === "string" &&
                        this.adapter.config.CalculatorList[channel].chTargetState2 !== "") {
                        const chTargetState2Components = this.adapter.config.CalculatorList[channel].chTargetState2.split(".");
                        let foundAllBadComponents = true;
                        badComponents.forEach(badComponent => {
                            if (!chTargetState2Components.includes(badComponent)) {
                                foundAllBadComponents = false;
                            }
                        });
                        if (foundAllBadComponents) {
                            this.adapter.log.error(`Invalid second destination state defined in calculator channel ${channel}. Please avoid specifying the activation state of this channel as the destination. Skipping channel execution.`);
                            continue; //skip channel
                        }
                    }
                    else {
                        this.adapter.log.debug(`chTargetState2 is null or undefined in calculator channel ${channel}. Skipping channel execution.`);
                        continue; // skip channel
                    }
                    if (this.adapter.config.CalculatorList[channel].chValueOn2 == null ||
                        this.adapter.config.CalculatorList[channel].chValueOn2 === "" ||
                        this.adapter.config.CalculatorList[channel].chValueOff2 == null ||
                        this.adapter.config.CalculatorList[channel].chValueOff2 === "") {
                        this.adapter.log.error(`"Value YES 2" or "Value NO 2" is null or undefined in calculator channel ${channel}. Please provide usable values in config.`);
                        continue; // skip channel
                    }
                }
            }
            //#endregion first run checks
            try {
                if (this.adapter.config.CalculatorList[channel].chActive || onStateChange) {
                    // If Active=false been set just now - or still active then act - else just produce debug log in the following runs
                    switch (this.adapter.config.CalculatorList[channel].chType) {
                        case projectUtils_1.enCalcType.BestCost:
                            void this.executeCalculatorBestCost(parseInt(channel));
                            break;
                        case projectUtils_1.enCalcType.BestSingleHours:
                            void this.executeCalculatorBestSingleHours(parseInt(channel));
                            break;
                        case projectUtils_1.enCalcType.BestHoursBlock:
                            void this.executeCalculatorBestHoursBlock(parseInt(channel));
                            break;
                        case projectUtils_1.enCalcType.BestCostLTF:
                            void this.executeCalculatorBestCost(parseInt(channel), true);
                            break;
                        case projectUtils_1.enCalcType.BestSingleHoursLTF:
                            void this.executeCalculatorBestSingleHours(parseInt(channel), true);
                            break;
                        case projectUtils_1.enCalcType.BestHoursBlockLTF:
                            void this.executeCalculatorBestHoursBlock(parseInt(channel), true);
                            break;
                        case projectUtils_1.enCalcType.SmartBatteryBuffer:
                            void this.executeCalculatorSmartBatteryBuffer(parseInt(channel));
                            break;
                        case projectUtils_1.enCalcType.BestPercentage:
                            void this.executeCalculatorBestPercentage(parseInt(channel));
                            break;
                        case projectUtils_1.enCalcType.BestPercentageLTF:
                            void this.executeCalculatorBestPercentage(parseInt(channel), true);
                            break;
                        default:
                            this.adapter.log.debug(`unknown value for calculator type: ${this.adapter.config.CalculatorList[channel].chType}`);
                    }
                }
                else {
                    this.adapter.log.debug(`calculator channel: ${channel} - ${(0, projectUtils_1.getCalcTypeDescription)(this.adapter.config.CalculatorList[channel].chType)}; execution skipped because channel not set to active in channel states`);
                }
            }
            catch (error) {
                this.adapter.log.warn(`unhandled error ${error} while executing calculator channel ${channel}`);
            }
        }
    }
    /**
     * updateCalculatorUsageStats
     */
    updateCalculatorUsageStats() {
        if (!this.adapter.config.UseCalculator) {
            return;
        }
        this.initStats();
        for (const channel in this.adapter.config.CalculatorList) {
            try {
                this.increaseStatsValueByOne(this.adapter.config.CalculatorList[channel].chType);
            }
            catch (error) {
                this.adapter.log.debug(`unhandled error ${error} in calculator usage scan for channel ${channel}`);
            }
        }
    }
    async executeCalculatorBestCost(channel, modeLTF = false) {
        try {
            let valueToSet = "";
            const now = new Date();
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (!channelConfig.chActive) {
                // not active
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now < channelConfig.chStartTime) {
                // chActive but before LTF
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now > channelConfig.chStopTime) {
                // chActive but after LTF
                valueToSet = channelConfig.chValueOff;
                this.handleAfterLTF(channel);
                /* WIP
                if (channelConfig.chRepeatDays == 0) {
                    void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.Active`, false, true);
                } else {
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StartTime`,
                        format(addDays(channelConfig.chStartTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStartTime = addDays(channelConfig.chStartTime, channelConfig.chRepeatDays);
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StopTime`,
                        format(addDays(channelConfig.chStopTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStopTime = addDays(channelConfig.chStopTime, channelConfig.chRepeatDays);
                }
                */
            }
            else {
                // chActive and inside LTF -> choose desired value
                const currentPrice = await this.getStateValue(`Homes.${channelConfig.chHomeID}.CurrentPrice.total`);
                if (channelConfig.chTriggerPrice > currentPrice) {
                    valueToSet = channelConfig.chValueOn;
                }
                else {
                    valueToSet = channelConfig.chValueOff;
                }
            }
            //set value to foreign state, if defined
            let sOutState = "";
            if (channelConfig?.chTargetState &&
                channelConfig.chTargetState.length > 10 &&
                !channelConfig.chTargetState.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
                void this.adapter.setState(sOutState, convertValue(valueToSet), true);
            }
            this.adapter.log.debug(`calculator channel: ${channel} - best price ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best price ${modeLTF ? "LTF " : ""}in channel ${channel}`));
        }
    }
    async executeCalculatorBestSingleHours(channel, modeLTF = false) {
        try {
            let valueToSet = "";
            const now = new Date();
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (!channelConfig.chActive) {
                // not active -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now < channelConfig.chStartTime) {
                // chActive but before LTF -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now > channelConfig.chStopTime) {
                // chActive, modeLTF but after LTF -> choose chValueOff and disable channel
                valueToSet = channelConfig.chValueOff;
                this.handleAfterLTF(channel);
                /*  WIP
                if (channelConfig.chRepeatDays == 0) {
                    void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.Active`, false, true);
                } else {
                    // chRepeatDays present, change start and stop time accordingly
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StartTime`,
                        format(addDays(channelConfig.chStartTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStartTime = addDays(channelConfig.chStartTime, channelConfig.chRepeatDays);
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StopTime`,
                        format(addDays(channelConfig.chStopTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStopTime = addDays(channelConfig.chStopTime, channelConfig.chRepeatDays);
                }
                */
            }
            else {
                // chActive and inside LTF -> choose desired value
                // WIP
                const filteredPrices = await this.getPricesLTF(channel, modeLTF);
                /* WIP
                const pricesToday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesToday.json`));
                let filteredPrices: IPrice[] = pricesToday;
                if (modeLTF) {
                    // Limited Time Frame mode
                    const pricesTomorrow: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesTomorrow.json`));
                    const pricesYesterday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesYesterday.json`));
                    const startTime: Date = channelConfig.chStartTime;
                    const stopTime: Date = channelConfig.chStopTime;

                    // Merge prices if pricesTomorrow is not empty
                    let mergedPrices: IPrice[] = pricesToday;
                    if (pricesTomorrow.length !== 0) {
                        mergedPrices = [...pricesToday, ...pricesTomorrow];
                    }
                    if (pricesYesterday.length !== 0) {
                        mergedPrices = [...pricesYesterday, ...mergedPrices];
                    }

                    // filter objects to time frame
                    filteredPrices = mergedPrices.filter(price => {
                        const priceDate = new Date(price.startsAt);
                        return priceDate >= startTime && priceDate < stopTime;
                    });
                }
                */
                filteredPrices.sort((a, b) => a.total - b.total);
                // get first n entries und test for matching hour
                const n = channelConfig.chAmountHours;
                const result = filteredPrices.slice(0, n).map((entry) => checkHourMatch(entry));
                // identify if any element is true
                if (result.some(value => value)) {
                    valueToSet = channelConfig.chValueOn;
                }
                else {
                    valueToSet = channelConfig.chValueOff;
                }
                // WIP
                // mark the entries with the result and create JSON output
                ///*
                const jsonOutput = filteredPrices
                    //.slice(0, n)
                    .map((entry, index) => ({
                    hour: new Date(entry.startsAt).getHours(), // extract the hour from startsAt
                    //startsAt: entry.startsAt,
                    total: entry.total,
                    //output: result[index], // add the matching result for each entry
                    output: index !== -1 ? true : false, // always true if in first n entries, otherwise false
                }));
                //.sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime()); // Sort by startsAt
                //.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()); // Sort by startsAt
                jsonOutput.sort((a, b) => new Date(a.hour).getTime() - new Date(b.hour).getTime()); // Sort by startsAt
                //*/
                // log or use the generated JSON output
                this.adapter.log.warn(`calculator channel: ${channel} - best single hours ${modeLTF ? "LTF" : ""}: ${JSON.stringify(jsonOutput, null, 2)}`);
            }
            //set value to foreign state, if defined
            let sOutState = "";
            if (channelConfig?.chTargetState &&
                channelConfig.chTargetState.length > 10 &&
                !channelConfig.chTargetState.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
                void this.adapter.setState(sOutState, convertValue(valueToSet), true);
            }
            this.adapter.log.debug(`calculator channel: ${channel} - best single hours ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best single hours ${modeLTF ? "LTF " : ""}in channel ${channel}`));
        }
    }
    async executeCalculatorBestHoursBlock(channel, modeLTF = false) {
        try {
            let valueToSet = "";
            const now = new Date();
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (!channelConfig.chActive) {
                // not active -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
                this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
            }
            else if (modeLTF && now < channelConfig.chStartTime) {
                // chActive but before LTF -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
                this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
            }
            else if (modeLTF && now > channelConfig.chStopTime) {
                // chActive but after LTF -> choose chValueOff and disable channel or generate new running period
                valueToSet = channelConfig.chValueOff;
                this.setup_chBlockStartFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEndFullHour(channelConfig.chHomeID, channel, true);
                this.setup_chBlockStart(channelConfig.chHomeID, channel, true);
                this.setup_chBlockEnd(channelConfig.chHomeID, channel, true);
                this.handleAfterLTF(channel);
                /* WIP
                if (channelConfig.chRepeatDays == 0) {
                    void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.Active`, false, true);
                } else {
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StartTime`,
                        format(addDays(channelConfig.chStartTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStartTime = addDays(channelConfig.chStartTime, channelConfig.chRepeatDays);
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StopTime`,
                        format(addDays(channelConfig.chStopTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStopTime = addDays(channelConfig.chStopTime, channelConfig.chRepeatDays);
                }
                */
            }
            else {
                // chActive and inside LTF -> choose desired value
                //WIP
                const filteredPrices = await this.getPricesLTF(channel, modeLTF);
                /*
                const pricesToday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesToday.json`));
                let filteredPrices: IPrice[] = pricesToday;
                if (modeLTF) {
                    // Limited Time Frame mode, modify filteredPrices accordingly
                    const pricesTomorrow: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesTomorrow.json`));
                    const pricesYesterday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesYesterday.json`));
                    const startTime: Date = channelConfig.chStartTime;
                    const stopTime: Date = channelConfig.chStopTime;

                    // Merge prices if pricesTomorrow is not empty
                    let mergedPrices: IPrice[] = pricesToday;
                    if (pricesTomorrow.length !== 0) {
                        mergedPrices = [...pricesToday, ...pricesTomorrow];
                    }
                    if (pricesYesterday.length !== 0) {
                        mergedPrices = [...pricesYesterday, ...mergedPrices];
                    }

                    // filter objects to time frame
                    filteredPrices = mergedPrices.filter(price => {
                        const priceDate = new Date(price.startsAt);
                        return priceDate >= startTime && priceDate < stopTime;
                    });
                }
                */
                //#region *** Find cheapest block ***
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
                const minSumEntries = filteredPrices.slice(startIndex, startIndex + n).map((entry) => checkHourMatch(entry));
                // identify if any element is true
                if (minSumEntries.some(value => value)) {
                    valueToSet = channelConfig.chValueOn;
                }
                else {
                    valueToSet = channelConfig.chValueOff;
                }
                //#endregion
                // calculate average cost of determined block of hours, write to data point
                void this.checkAndSetValueNumber(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AverageTotalCost`, Math.round(1000 * (minSum / n)) / 1000, `average total cost in determined block`, undefined, false, false);
                //#region *** Write start and stop time of determined block to data points ***
                const beginDate = new Date(filteredPrices[startIndex].startsAt);
                void this.checkAndSetValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStartFullHour`, (0, date_fns_1.format)(beginDate, "H"), `first hour of determined block`, false, false);
                void this.checkAndSetValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockStart`, filteredPrices[startIndex].startsAt, `start date string of determined block`, false, false);
                const endDate = new Date(filteredPrices[startIndex + n - 1].startsAt);
                void this.checkAndSetValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEndFullHour`, (0, date_fns_1.format)((0, date_fns_1.addHours)(endDate, 1), "H"), `end hour of determined block`, false, false);
                void this.checkAndSetValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.BlockEnd`, filteredPrices[startIndex + n].startsAt, `stop date string of determined block`, false, false);
                //#endregion
            }
            //#region *** set value to foreign state, if defined, or use internal Output ***
            let sOutState = "";
            if (channelConfig?.chTargetState &&
                channelConfig.chTargetState.length > 10 &&
                !channelConfig.chTargetState.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
                void this.adapter.setState(sOutState, convertValue(valueToSet), true);
            }
            this.adapter.log.debug(`calculator channel: ${channel} - best hours block ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
            //#endregion
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best hours block ${modeLTF ? "LTF " : ""}in channel ${channel}`));
        }
    }
    async executeCalculatorSmartBatteryBuffer(channel) {
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
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (!channelConfig.chActive) {
                // Not Active - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
                valueToSet = channelConfig.chValueOff;
                valueToSet2 = channelConfig.chValueOff2;
            }
            else {
                // chActive -> choose desired values
                const pricesToday = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesToday.json`));
                const maxCheapCount = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.AmountHours`);
                const efficiencyLoss = await this.getStateValue(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.EfficiencyLoss`);
                // sort by total price
                pricesToday.sort((a, b) => a.total - b.total);
                const cheapHours = [];
                const normalHours = [];
                const expensiveHours = [];
                let cheapIndex = 0;
                let minDelta = 0;
                while (cheapIndex < pricesToday.length && cheapHours.length < maxCheapCount) {
                    const currentHour = pricesToday[cheapIndex];
                    if (currentHour.total < pricesToday[pricesToday.length - 1].total - minDelta) {
                        cheapHours.push(currentHour);
                        minDelta = calculateMinDelta(cheapHours, efficiencyLoss);
                    }
                    else {
                        break;
                    }
                    cheapIndex++;
                }
                const maxCheapTotal = Math.max(...cheapHours.map(hour => hour.total));
                for (const hour of pricesToday) {
                    if (!cheapHours.includes(hour)) {
                        if (hour.total > minDelta + maxCheapTotal) {
                            expensiveHours.push(hour);
                        }
                        else {
                            normalHours.push(hour);
                        }
                    }
                }
                this.adapter.log.debug(`calculator channel ${channel} SBB-type result - cheap hours: ${cheapHours.map(hour => hour.total).join(", ")}`);
                this.adapter.log.debug(`calculator channel ${channel} SBB-type result - normal hours: ${normalHours.map(hour => hour.total).join(", ")}`);
                this.adapter.log.debug(`calculator channel ${channel} SBB-type result - expensive hours: ${expensiveHours.map(hour => hour.total).join(", ")}`);
                const resultCheap = cheapHours.map((entry) => checkHourMatch(entry));
                const resultNormal = normalHours.map((entry) => checkHourMatch(entry));
                const resultExpensive = expensiveHours.map((entry) => checkHourMatch(entry));
                // identify if an element is true and generate output
                if (resultCheap.some(value => value)) {
                    // Cheap Hours - enable battery charging (ON-1) and disable feed into home energy system (OFF-2)
                    valueToSet = channelConfig.chValueOn;
                    valueToSet2 = channelConfig.chValueOff2;
                }
                else if (resultNormal.some(value => value)) {
                    // Normal Hours - disable battery charging (OFF-1) and also disable feed into home energy system (OFF-2)
                    valueToSet = channelConfig.chValueOff;
                    valueToSet2 = channelConfig.chValueOff2;
                }
                else if (resultExpensive.some(value => value)) {
                    // Expensive Hours - disable battery charging (OFF-1) and enable feed into home energy system (ON-2)
                    valueToSet = channelConfig.chValueOff;
                    valueToSet2 = channelConfig.chValueOn2;
                }
                else {
                    this.adapter.log.warn(this.generateErrorMessage(`no result found for SBB`, `execute calculator for smart battery buffer in channel ${channel}`));
                }
                function calculateMinDelta(cheapHours, efficiencyLoss) {
                    const cheapTotalSum = cheapHours.reduce((sum, hour) => sum + hour.total, 0);
                    const cheapAverage = cheapTotalSum / cheapHours.length;
                    return cheapAverage * efficiencyLoss;
                }
            }
            //set value to foreign states, if defined
            let sOutState = "";
            if (channelConfig?.chTargetState &&
                channelConfig.chTargetState.length > 10 &&
                !channelConfig.chTargetState.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
                void this.adapter.setState(sOutState, convertValue(valueToSet), true);
            }
            sOutState = ""; // reinit for output 2
            if (channelConfig.chTargetState2.length > 10 && !channelConfig.chTargetState2.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState2;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet2));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output2`;
                void this.adapter.setState(sOutState, convertValue(valueToSet2), true);
            }
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for smart battery buffer in channel ${channel}`));
        }
    }
    async executeCalculatorBestPercentage(channel, modeLTF = false) {
        try {
            let valueToSet = "";
            const now = new Date();
            const channelConfig = this.adapter.config.CalculatorList[channel];
            if (!channelConfig.chActive) {
                // not active -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now < channelConfig.chStartTime) {
                // chActive but before LTF -> choose chValueOff
                valueToSet = channelConfig.chValueOff;
            }
            else if (modeLTF && now > channelConfig.chStopTime) {
                // chActive, modeLTF but after LTF -> choose chValueOff and disable channel
                valueToSet = channelConfig.chValueOff;
                this.handleAfterLTF(channel);
                /* WIP
                if (channelConfig.chRepeatDays == 0) {
                    void this.adapter.setState(`Homes.${channelConfig.chHomeID}.Calculations.${channel}.Active`, false, true);
                } else {
                    // chRepeatDays present, change start and stop time accordingly
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StartTime`,
                        format(addDays(channelConfig.chStartTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStartTime = addDays(channelConfig.chStartTime, channelConfig.chRepeatDays);
                    void this.adapter.setState(
                        `Homes.${channelConfig.chHomeID}.Calculations.${channel}.StopTime`,
                        format(addDays(channelConfig.chStopTime, channelConfig.chRepeatDays), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"),
                        true,
                    );
                    channelConfig.chStopTime = addDays(channelConfig.chStopTime, channelConfig.chRepeatDays);
                }*/
            }
            else {
                // chActive and inside LTF -> choose desired value
                //WIP
                const filteredPrices = await this.getPricesLTF(channel, modeLTF);
                /*
                const pricesToday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesToday.json`));
                let filteredPrices: IPrice[] = pricesToday;
                if (modeLTF) {
                    // Limited Time Frame mode
                    const pricesTomorrow: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesTomorrow.json`));
                    const pricesYesterday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${channelConfig.chHomeID}.PricesYesterday.json`));
                    const startTime: Date = channelConfig.chStartTime;
                    const stopTime: Date = channelConfig.chStopTime;

                    // Merge prices if pricesTomorrow is not empty
                    let mergedPrices: IPrice[] = pricesToday;
                    if (pricesTomorrow.length !== 0) {
                        mergedPrices = [...pricesToday, ...pricesTomorrow];
                    }
                    if (pricesYesterday.length !== 0) {
                        mergedPrices = [...pricesYesterday, ...mergedPrices];
                    }

                    // filter objects to time frame
                    filteredPrices = mergedPrices.filter(price => {
                        const priceDate = new Date(price.startsAt);
                        return priceDate >= startTime && priceDate < stopTime;
                    });
                }
                */
                filteredPrices.sort((a, b) => a.total - b.total);
                const cheapestPrice = filteredPrices[0]?.total;
                const percentage = channelConfig.chPercentage;
                const allowedPrices = filteredPrices.filter(entry => entry.total <= cheapestPrice * (1 + percentage / 100));
                const result = allowedPrices.map((entry) => checkHourMatch(entry));
                // identify if any element is true
                if (result.some(value => value)) {
                    valueToSet = channelConfig.chValueOn;
                }
                else {
                    valueToSet = channelConfig.chValueOff;
                }
            }
            //set value to foreign state, if defined
            let sOutState = "";
            if (channelConfig?.chTargetState &&
                channelConfig.chTargetState.length > 10 &&
                !channelConfig.chTargetState.startsWith("choose your state to drive")) {
                sOutState = channelConfig.chTargetState;
                void this.adapter.setForeignStateAsync(sOutState, convertValue(valueToSet));
            }
            else {
                sOutState = `Homes.${channelConfig.chHomeID}.Calculations.${channel}.Output`;
                void this.adapter.setState(sOutState, convertValue(valueToSet), true);
            }
            this.adapter.log.debug(`calculator channel: ${channel} - best percentage ${modeLTF ? "LTF" : ""}; setting state: ${sOutState} to ${valueToSet}`);
        }
        catch (error) {
            this.adapter.log.warn(this.generateErrorMessage(error, `execute calculator for best percantage ${modeLTF ? "LTF " : ""}in channel ${channel}`));
        }
    }
    /**
     * Retrieves price data for a specific channel, optionally limited to a defined time frame.
     * The function fetches price information for today, and if Limited Time Frame (LTF) mode is enabled, it merges the data from yesterday, today, and tomorrow,
     * filtering it according to the specified start and stop times.
     *
     * @param channel - The index representing the channel in the configuration.
     * @param modeLTF - A boolean indicating whether Limited Time Frame mode is active.
     * @returns An array of price objects (`IPrice[]`) relevant to the specified channel and time frame.
     *          - If `modeLTF` is false, returns today's prices as-is.
     *          - If `modeLTF` is true, merges price data from yesterday, today, and tomorrow,
     *            and filters it to include only prices within the specified time frame.
     */
    async getPricesLTF(channel, modeLTF) {
        const { chHomeID, chStartTime, chStopTime } = this.adapter.config.CalculatorList[channel];
        const pricesToday = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesToday.json`));
        if (!modeLTF) {
            return pricesToday;
        }
        // Limited Time Frame mode
        const pricesTomorrow = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesTomorrow.json`));
        const pricesYesterday = JSON.parse(await this.getStateValue(`Homes.${chHomeID}.PricesYesterday.json`));
        const startTime = chStartTime;
        const stopTime = chStopTime;
        // Merge prices if pricesTomorrow is not empty
        let mergedPrices = pricesToday;
        if (pricesTomorrow.length !== 0) {
            mergedPrices = [...pricesToday, ...pricesTomorrow];
        }
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
    handleAfterLTF(channel) {
        const { chHomeID, chRepeatDays, chStartTime, chStopTime } = this.adapter.config.CalculatorList[channel];
        if (chRepeatDays == 0) {
            void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.Active`, false, true);
            return;
        }
        // chRepeatDays present, change start and stop time accordingly
        const newStartTime = (0, date_fns_1.addDays)(chStartTime, chRepeatDays);
        const newStopTime = (0, date_fns_1.addDays)(chStopTime, chRepeatDays);
        void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.StartTime`, (0, date_fns_1.format)(newStartTime, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
        void this.adapter.setState(`Homes.${chHomeID}.Calculations.${channel}.StopTime`, (0, date_fns_1.format)(newStopTime, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"), true);
        this.adapter.config.CalculatorList[channel].chStartTime = (0, date_fns_1.addDays)(chStartTime, chRepeatDays);
        this.adapter.config.CalculatorList[channel].chStopTime = (0, date_fns_1.addDays)(chStopTime, chRepeatDays);
    }
}
exports.TibberCalculator = TibberCalculator;
/**
 * Checks if the current hour matches the hour of a given entry's start time.
 * This method compares the hour of the current date and time with the hour extracted from the `startsAt` property of the provided `entry` object.
 * If the hours match, the function returns `true`, otherwise `false`.
 *
 * @param entry - An object of type `IPrice` containing a `startsAt` property that represents the start time as a date string.
 * @returns A boolean indicating whether the current hour matches the hour of the `startsAt` time.
 */
function checkHourMatch(entry) {
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
function convertValue(Value) {
    if (Value.toLowerCase() === "true") {
        return true;
    }
    else if (Value.toLowerCase() === "false") {
        return false;
    }
    const numericValue = parseFloat(Value);
    return isNaN(numericValue) ? Value : numericValue;
}
//# sourceMappingURL=tibberCalculator.js.map