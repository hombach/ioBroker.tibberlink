"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberCharts = void 0;
const date_fns_1 = require("date-fns");
const projectUtils_1 = require("./projectUtils");
// https://echarts.apache.org/examples/en/index.html
// https://github.com/MyHomeMyData/ioBroker.flexcharts
/**
 * TibberCalculator
 */
class TibberCharts extends projectUtils_1.ProjectUtils {
    /**
     * constructor
     *
     * @param adapter - ioBroker adapter instance
     */
    constructor(adapter) {
        super(adapter);
    }
    /**
     * updates FlexChart JSONs of all homes
     *
     * @param homeInfoList - homeInfo list object
     * @returns Promise<void> - Resolves when the price data is successfully fetched and updated.
     */
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
            // double last item and raise hour by one
            const lastItem = mergedPrices[mergedPrices.length - 1];
            const lastStartsAt = new Date(lastItem.startsAt);
            const newStartsAt = (0, date_fns_1.addHours)(lastStartsAt, 1);
            const duplicatedItem = {
                ...lastItem,
                startsAt: newStartsAt.toISOString(),
            };
            mergedPrices.push(duplicatedItem);
            // build data-rows
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
                    const allowedTypes = [1, 2, 3, 4, 5, 6, 8, 9]; // list of supported channel types
                    const filteredEntries = this.adapter.config.CalculatorList.filter(entry => entry.chActive == true && entry.chHomeID == homeID && allowedTypes.includes(entry.chType));
                    let calcsValues = "";
                    if (filteredEntries.length > 0) {
                        for (const entry of filteredEntries) {
                            const jsonOutput = JSON.parse(await this.getStateValue(`Homes.${homeID}.Calculations.${entry.chChannelID}.OutputJSON`));
                            const filteredData = jsonOutput.filter(entry => entry.output); // only output = true
                            let startIndex = 0;
                            for (let i = 1; i <= filteredData.length; i++) {
                                // check: connected hours?
                                const current = filteredData[i - 1];
                                const next = filteredData[i];
                                const isContinuous = next && (0, date_fns_1.differenceInHours)((0, date_fns_1.parseISO)(next.startsAt), (0, date_fns_1.parseISO)(current.startsAt)) === 1;
                                if (!isContinuous || i === filteredData.length) {
                                    // end of block or last iteration
                                    const startTime = (0, date_fns_1.parseISO)(filteredData[startIndex].startsAt);
                                    const endTime = (0, date_fns_1.addHours)((0, date_fns_1.parseISO)(current.startsAt), 1);
                                    switch (entry.chType) {
                                        case projectUtils_1.enCalcType.BestCost:
                                        case projectUtils_1.enCalcType.BestCostLTF:
                                            calcsValues += `[{name: "${entry.chName}", xAxis: "${(0, date_fns_1.format)(startTime, "dd.MM.'\\n'HH:mm")}"}, {xAxis: "${(0, date_fns_1.format)(endTime, "dd.MM.'\\n'HH:mm")}", yAxis: ${entry.chTriggerPrice}}],\n`;
                                            break;
                                        default:
                                            calcsValues += `[{name: "${entry.chName}", xAxis: "${(0, date_fns_1.format)(startTime, "dd.MM.'\\n'HH:mm")}"}, {xAxis: "${(0, date_fns_1.format)(endTime, "dd.MM.'\\n'HH:mm")}"}],\n`;
                                    }
                                    startIndex = i; // start next group
                                }
                            }
                        }
                    }
                    if (calcsValues == "") {
                        calcsValues = `[{xAxis: ""}, {xAxis: ""}]`;
                    }
                    jsonFlexCharts = jsonFlexCharts.replace("%%CalcChannelsData%%", calcsValues);
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