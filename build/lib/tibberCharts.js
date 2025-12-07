"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberCharts = void 0;
const date_fns_1 = require("date-fns");
const projectUtils_js_1 = require("./projectUtils.js");
class TibberCharts extends projectUtils_js_1.ProjectUtils {
    constructor(adapter) {
        super(adapter);
    }
    async generateFlexChartJSONAllHomes(homeInfoList) {
        for (const curHomeInfo of homeInfoList) {
            if (!curHomeInfo.PriceDataPollActive) {
                continue;
            }
            await this.generateFlexChartJSON(curHomeInfo.ID);
        }
    }
    async generateFlexChartJSON(homeID) {
        try {
            const exPricesToday = JSON.parse(await this.getStateValue(`Homes.${homeID}.PricesToday.json`));
            const exPricesTomorrow = JSON.parse(await this.getStateValue(`Homes.${homeID}.PricesTomorrow.json`));
            let mergedPrices = exPricesToday;
            if (exPricesTomorrow.length !== 0) {
                mergedPrices = [...exPricesToday, ...exPricesTomorrow];
            }
            if (typeof this.adapter.config.FlexGraphPastCutOff === "number" && typeof this.adapter.config.FlexGraphFutureCutOff === "number") {
                const now = new Date();
                const pastCutoff = (0, date_fns_1.subHours)(now, this.adapter.config.FlexGraphPastCutOff + 1);
                const futureCutoff = (0, date_fns_1.addHours)(now, this.adapter.config.FlexGraphFutureCutOff - 1);
                mergedPrices = mergedPrices.filter(price => {
                    const priceTime = (0, date_fns_1.parseISO)(price.startsAt);
                    return (0, date_fns_1.isAfter)(priceTime, pastCutoff) && (0, date_fns_1.isBefore)(priceTime, futureCutoff);
                });
            }
            const lastItem = mergedPrices[mergedPrices.length - 1];
            const lastStartsAt = new Date(lastItem.startsAt);
            const newStartsAt = (0, date_fns_1.addMinutes)(lastStartsAt, 15);
            const duplicatedItem = {
                ...lastItem,
                startsAt: newStartsAt.toISOString(),
            };
            mergedPrices.push(duplicatedItem);
            const timeSeriesData = mergedPrices.map(item => [new Date(item.startsAt).getTime(), item.total]);
            let jsonFlexCharts = this.adapter.config.FlexGraphJSON || "";
            if (jsonFlexCharts) {
                jsonFlexCharts = jsonFlexCharts.replace("%%seriesData%%", JSON.stringify(timeSeriesData));
                if (this.adapter.config.UseCalculator && jsonFlexCharts.includes("%%CalcChannelsData%%")) {
                    const allowedTypes = [
                        projectUtils_js_1.enCalcType.BestCost,
                        projectUtils_js_1.enCalcType.BestCostLTF,
                        projectUtils_js_1.enCalcType.BestSingleHours,
                        projectUtils_js_1.enCalcType.BestSingleHoursLTF,
                        projectUtils_js_1.enCalcType.BestHoursBlock,
                        projectUtils_js_1.enCalcType.BestHoursBlockLTF,
                        projectUtils_js_1.enCalcType.BestPercentage,
                        projectUtils_js_1.enCalcType.BestPercentageLTF,
                        projectUtils_js_1.enCalcType.SmartBatteryBuffer,
                        projectUtils_js_1.enCalcType.SmartBatteryBufferLTF,
                    ];
                    const filteredCalcChannels = this.adapter.config.CalculatorList.filter(entry => entry.chActive && entry.chHomeID === homeID && allowedTypes.includes(entry.chType)).map(entry => ({
                        ...entry,
                        markAreaY1: 0.15,
                        markAreaY2: 0.16,
                    }));
                    let calcChannelsData = "";
                    const maxVisibleY = Math.max(...mergedPrices.map(item => item.total));
                    const maxMarkAreaY = maxVisibleY * 0.95;
                    if (filteredCalcChannels.length > 0) {
                        this.adapter.log.debug(`[tibberCharts]: found ${filteredCalcChannels.length} channels to potentialy draw FlexCharts`);
                        let entryCount = 0;
                        for (const entry of filteredCalcChannels) {
                            if (!entry.chGraphEnabled) {
                                continue;
                            }
                            entryCount++;
                            entry.markAreaY1 = (maxMarkAreaY / filteredCalcChannels.length) * (filteredCalcChannels.length + 1 - entryCount);
                            entry.markAreaY2 = (maxMarkAreaY / filteredCalcChannels.length) * (filteredCalcChannels.length + 1.35 - entryCount);
                            this.adapter.log.debug(`[tibberCharts]: found channel ${entry.chName} to draw FlexCharts`);
                            const jsonOutput = JSON.parse(await this.getStateValue(`Homes.${homeID}.Calculations.${entry.chChannelID}.OutputJSON`));
                            const filteredData = jsonOutput.filter(entry => entry.output);
                            let startIndex = 0;
                            for (let i = 1; i <= filteredData.length; i++) {
                                const current = filteredData[i - 1];
                                const next = filteredData[i];
                                const isContinuous = next && (0, date_fns_1.differenceInMinutes)((0, date_fns_1.parseISO)(next.startsAt), (0, date_fns_1.parseISO)(current.startsAt)) === 15;
                                if (!isContinuous || i === filteredData.length) {
                                    const startTime = (0, date_fns_1.parseISO)(filteredData[startIndex].startsAt);
                                    const endTime = (0, date_fns_1.addMinutes)((0, date_fns_1.parseISO)(current.startsAt), 15);
                                    switch (entry.chType) {
                                        case projectUtils_js_1.enCalcType.BestCost:
                                        case projectUtils_js_1.enCalcType.BestCostLTF:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: ${startTime.getTime()}}, {xAxis: ${endTime.getTime()}, yAxis: ${entry.chTriggerPrice}}],\n`;
                                            break;
                                        case projectUtils_js_1.enCalcType.SmartBatteryBuffer:
                                        case projectUtils_js_1.enCalcType.SmartBatteryBufferLTF:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: ${startTime.getTime()}}, {xAxis: ${endTime.getTime()}, yAxis: ${entry.markAreaY1}}],\n`;
                                            break;
                                        default:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: ${startTime.getTime()}}, {xAxis: ${endTime.getTime()}, yAxis: ${entry.markAreaY1}}],\n`;
                                    }
                                    startIndex = i;
                                }
                            }
                            if (entry.chType === projectUtils_js_1.enCalcType.SmartBatteryBuffer || entry.chType === projectUtils_js_1.enCalcType.SmartBatteryBufferLTF) {
                                this.adapter.log.debug(`[tibberCharts]: channel ${entry.chName} is of type SmartBatteryBuffer, additional handling may be required`);
                                const jsonOutput2 = JSON.parse(await this.getStateValue(`Homes.${homeID}.Calculations.${entry.chChannelID}.OutputJSON2`));
                                const filteredData2 = jsonOutput2.filter((entry) => entry.output);
                                let startIndex2 = 0;
                                for (let j = 1; j <= filteredData2.length; j++) {
                                    const current = filteredData2[j - 1];
                                    const next = filteredData2[j];
                                    const isContinuous = next && (0, date_fns_1.differenceInMinutes)((0, date_fns_1.parseISO)(next.startsAt), (0, date_fns_1.parseISO)(current.startsAt)) === 15;
                                    if (!isContinuous || j === filteredData2.length) {
                                        const startTime = (0, date_fns_1.parseISO)(filteredData2[startIndex2].startsAt);
                                        const endTime = (0, date_fns_1.addMinutes)((0, date_fns_1.parseISO)(current.startsAt), 15);
                                        calcChannelsData += `[{name: "${entry.chName}-2", xAxis: ${startTime.getTime()}}, {xAxis: ${endTime.getTime()}, yAxis: ${entry.markAreaY2}}],\n`;
                                    }
                                    startIndex2 = j;
                                }
                            }
                        }
                    }
                    if (calcChannelsData == "") {
                        calcChannelsData = `[{xAxis: ""}, {xAxis: ""}]`;
                    }
                    jsonFlexCharts = jsonFlexCharts.replace("%%CalcChannelsData%%", calcChannelsData);
                }
                else if (jsonFlexCharts.includes("%%CalcChannelsData%%")) {
                    jsonFlexCharts = jsonFlexCharts.replace("%%CalcChannelsData%%", `[{xAxis: ""}, {xAxis: ""}]`);
                }
            }
            void this.checkAndSetValue(`Homes.${homeID}.PricesTotal.jsonFlexCharts`, jsonFlexCharts, "JSON string to be used for FlexCharts adapter for Apache ECharts", "json");
        }
        catch (error) {
            this.adapter.log.error(this.generateErrorMessage(error, `generate FlexChart JSON `));
        }
    }
}
exports.TibberCharts = TibberCharts;
//# sourceMappingURL=tibberCharts.js.map