import type * as utils from "@iobroker/adapter-core";
import { addHours, differenceInHours, format, parseISO } from "date-fns";
import type { IPrice } from "tibber-api/lib/src/models/IPrice";
import { enCalcType, ProjectUtils, type IHomeInfo } from "./projectUtils";

// https://echarts.apache.org/examples/en/index.html
// https://github.com/MyHomeMyData/ioBroker.flexcharts

/**
 * TibberCalculator
 */
export class TibberCharts extends ProjectUtils {
	/**
	 * constructor
	 *
	 * @param adapter - ioBroker adapter instance
	 */
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
	}

	/**
	 * updates FlexChart JSONs of all homes
	 *
	 * @param homeInfoList - homeInfo list object
	 * @returns Promise<void> - Resolves when the price data is successfully fetched and updated.
	 */
	async generateFlexChartJSONAllHomes(homeInfoList: IHomeInfo[]): Promise<void> {
		for (const curHomeInfo of homeInfoList) {
			if (!curHomeInfo.PriceDataPollActive) {
				continue;
			}
			await this.generateFlexChartJSON(curHomeInfo.ID);
		}
	}

	private async generateFlexChartJSON(homeID: string): Promise<void> {
		try {
			const exPricesToday: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${homeID}.PricesToday.json`));
			const exPricesTomorrow: IPrice[] = JSON.parse(await this.getStateValue(`Homes.${homeID}.PricesTomorrow.json`));
			let mergedPrices: IPrice[] = exPricesToday;
			if (exPricesTomorrow.length !== 0) {
				mergedPrices = [...exPricesToday, ...exPricesTomorrow];
			}

			// double last item and raise hour by one
			const lastItem = mergedPrices[mergedPrices.length - 1];
			const lastStartsAt = new Date(lastItem.startsAt);
			const newStartsAt = addHours(lastStartsAt, 1);
			const duplicatedItem = {
				...lastItem,
				startsAt: newStartsAt.toISOString(),
			};

			mergedPrices.push(duplicatedItem);

			// build data-rows
			const totalValues = mergedPrices.map(item => item.total);
			const startsAtValues = mergedPrices.map(item => {
				const date = new Date(item.startsAt);
				return format(date, "dd.MM.'\n'HH:mm");
			});

			let jsonFlexCharts = this.adapter.config.FlexGraphJSON || "";
			if (jsonFlexCharts) {
				jsonFlexCharts = jsonFlexCharts.replace("%%xAxisData%%", JSON.stringify(startsAtValues));
				jsonFlexCharts = jsonFlexCharts.replace("%%yAxisData%%", JSON.stringify(totalValues));

				if (this.adapter.config.UseCalculator && jsonFlexCharts.includes("%%CalcChannelsData%%")) {
					const allowedTypes = [
						enCalcType.BestCost,
						enCalcType.BestCostLTF,
						enCalcType.BestSingleHours,
						enCalcType.BestSingleHoursLTF,
						enCalcType.BestHoursBlock,
						enCalcType.BestHoursBlockLTF,
						enCalcType.BestPercentage,
						enCalcType.BestPercentageLTF,
						enCalcType.SmartBatteryBuffer,
					]; // list of supported channel types
					const filteredEntries = this.adapter.config.CalculatorList.filter(
						entry => entry.chActive == true && entry.chHomeID == homeID && allowedTypes.includes(entry.chType),
					);
					let calcChannelsData = "";
					if (filteredEntries.length > 0) {
						for (const entry of filteredEntries) {
							const jsonOutput = JSON.parse(await this.getStateValue(`Homes.${homeID}.Calculations.${entry.chChannelID}.OutputJSON`));

							const filteredData = jsonOutput.filter(entry => entry.output); // only output = true
							let startIndex = 0;
							for (let i = 1; i <= filteredData.length; i++) {
								// check: connected hours?
								const current = filteredData[i - 1];
								const next = filteredData[i];
								const isContinuous = next && differenceInHours(parseISO(next.startsAt), parseISO(current.startsAt)) === 1;
								if (!isContinuous || i === filteredData.length) {
									// end of block or last iteration
									const startTime = parseISO(filteredData[startIndex].startsAt);
									const endTime = addHours(parseISO(current.startsAt), 1);
									switch (entry.chType) {
										case enCalcType.BestCost:
										case enCalcType.BestCostLTF:
											calcChannelsData += `[{name: "${entry.chName}", xAxis: "${format(startTime, "dd.MM.'\\n'HH:mm")}"}, {xAxis: "${format(endTime, "dd.MM.'\\n'HH:mm")}", yAxis: ${entry.chTriggerPrice}}],\n`;
											break;
										case enCalcType.SmartBatteryBuffer:
											calcChannelsData += `[{name: "${entry.chName}", xAxis: "${format(startTime, "dd.MM.'\\n'HH:mm")}"}, {xAxis: "${format(endTime, "dd.MM.'\\n'HH:mm")}"}],\n`;
											break;
										default:
											calcChannelsData += `[{name: "${entry.chName}", xAxis: "${format(startTime, "dd.MM.'\\n'HH:mm")}"}, {xAxis: "${format(endTime, "dd.MM.'\\n'HH:mm")}"}],\n`;
									}
									startIndex = i; // start next group
								}
							}
						}
					}
					if (calcChannelsData == "") {
						calcChannelsData = `[{xAxis: ""}, {xAxis: ""}]`;
					}
					jsonFlexCharts = jsonFlexCharts.replace("%%CalcChannelsData%%", calcChannelsData);
				} else if (jsonFlexCharts.includes("%%CalcChannelsData%%")) {
					jsonFlexCharts = jsonFlexCharts.replace("%%CalcChannelsData%%", `[{xAxis: ""}, {xAxis: ""}]`);
				}
			}

			void this.checkAndSetValue(
				`Homes.${homeID}.PricesTotal.jsonFlexCharts`,
				jsonFlexCharts,
				"JSON string to be used for FlexCharts adapter for Apache ECharts",
				"json",
			);
		} catch (error: unknown) {
			this.adapter.log.error(this.generateErrorMessage(error, `generate FlexChart JSON `));
		}
	}
}
