// This file extends the AdapterConfig type from "@types/iobroker"

// TibberAPIToken: string;

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			HomesList: [
				{
					feedActive: boolean;
					homeID: string;
				},
			];
			FeedConfigLastMeterConsumption: boolean;
			FeedConfigAccumulatedConsumption: boolean;
			FeedConfigAccumulatedProduction: boolean;
			FeedConfigAccumulatedConsumptionLastHour: boolean;
			FeedConfigAccumulatedProductionLastHour: boolean;
			FeedConfigAccumulatedCost: boolean;
			FeedConfigAccumulatedReward: boolean;
			FeedConfigCurrency: boolean;
			FeedConfigMinPower: boolean;
			FeedConfigAveragePower: boolean;
			FeedConfigMaxPower: boolean;
			FeedConfigPowerProduction: boolean;
			FeedConfigMinPowerProduction: boolean;
			FeedConfigMaxPowerProduction: boolean;
			FeedConfigLastMeterProduction: boolean;
			FeedConfigPowerFactor: boolean;
			FeedConfigVoltagePhase1: boolean;
			FeedConfigVoltagePhase2: boolean;
			FeedConfigVoltagePhase3: boolean;
			FeedConfigCurrentL1: boolean;
			FeedConfigCurrentL2: boolean;
			FeedConfigCurrentL3: boolean;
			FeedConfigSignalStrength: boolean;
			CalCh01Configured: boolean; // configs for calculator channel 01
			CalculatorList: [
				{
					chHomeID: string;
					chType: string;
					chActive: boolean;
					chTargetState: string;
					chValueOn: string;
					chValueOff: string;
				},
			];
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
