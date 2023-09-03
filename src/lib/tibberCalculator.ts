import * as utils from "@iobroker/adapter-core";
import { TibberHelper } from "./tibberHelper";

export class TibberCalculator extends TibberHelper {
	constructor(adapter: utils.AdapterInstance) {
		super(adapter);
	}

	async setupCalculatorStates(homeId: string, channel: number): Promise<void> {
		try {
			this.checkAndSetValueNumber(
				this.getStatePrefix(homeId, `Calculations.${channel}`, "TriggerPrice"),
				0.0,
				"pricelevel to trigger this channel at",
				true,
			);
			this.checkAndSetValueBoolean(
				this.getStatePrefix(homeId, `Calculations.${channel}`, "Active"),
				false,
				"Whether the calculation channel is active",
			);
		} catch (error) {
			this.adapter.log.warn(this.generateErrorMessage(error, "setup of states for calculator"));
		}
	}
}
