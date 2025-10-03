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
            const newStartsAt = (0, date_fns_1.addHours)(lastStartsAt, 1);
            const duplicatedItem = {
                ...lastItem,
                startsAt: newStartsAt.toISOString(),
            };
            mergedPrices.push(duplicatedItem);
            const totalValues = mergedPrices.map(item => item.total);
            const startsAtValues = mergedPrices.map(item => {
                const date = new Date(item.startsAt);
                return (0, date_fns_1.format)(date, "dd.MM.'\n'HH:mm");
            });
            let jsonFlexCharts = this.adapter.config.FlexGraphJSON || "";
            if (jsonFlexCharts) {
                jsonFlexCharts = jsonFlexCharts.replace("%%xAxisData%%", JSON.stringify(startsAtValues));
                jsonFlexCharts = jsonFlexCharts.replace("%%yAxisData%%", JSON.stringify(totalValues));
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
                    const filteredEntries = this.adapter.config.CalculatorList.filter(entry => entry.chActive == true && entry.chHomeID == homeID && allowedTypes.includes(entry.chType));
                    let calcChannelsData = "";
                    if (filteredEntries.length > 0) {
                        this.adapter.log.debug(`[tibberCharts]: found ${filteredEntries.length} channels to potentialy draw FlexCharts`);
                        for (const entry of filteredEntries) {
                            if (!entry.chGraphEnabled) {
                                continue;
                            }
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
                                    const endTime = (0, date_fns_1.addHours)((0, date_fns_1.parseISO)(current.startsAt), 1);
                                    switch (entry.chType) {
                                        case projectUtils_js_1.enCalcType.BestCost:
                                        case projectUtils_js_1.enCalcType.BestCostLTF:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: "${(0, date_fns_1.format)(startTime, "dd.MM.'\n'HH:mm")}"}, {xAxis: "${(0, date_fns_1.format)(endTime, "dd.MM.'\n'HH:mm")}", yAxis: ${entry.chTriggerPrice}}],\n`;
                                            break;
                                        case projectUtils_js_1.enCalcType.SmartBatteryBuffer:
                                        case projectUtils_js_1.enCalcType.SmartBatteryBufferLTF:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: "${(0, date_fns_1.format)(startTime, "dd.MM.'\n'HH:mm")}"}, {xAxis: "${(0, date_fns_1.format)(endTime, "dd.MM.'\n'HH:mm")}"}],\n`;
                                            break;
                                        default:
                                            calcChannelsData += `[{name: "${entry.chName}", xAxis: "${(0, date_fns_1.format)(startTime, "dd.MM.'\n'HH:mm")}"}, {xAxis: "${(0, date_fns_1.format)(endTime, "dd.MM.'\n'HH:mm")}"}],\n`;
                                    }
                                    startIndex = i;
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