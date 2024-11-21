export enum enCalcType {
	BestCost = 1,
	BestSingleHours = 2,
	BestHoursBlock = 3,
	BestCostLTF = 4,
	BestSingleHoursLTF = 5,
	BestHoursBlockLTF = 6,
	SmartBatteryBuffer = 7,
	//BestCostMaxHours = 8,
}

export function getCalcTypeDescription(calcType: enCalcType): string {
	switch (calcType) {
		case enCalcType.BestCost:
			return `best cost`;
		case enCalcType.BestSingleHours:
			return `best single hours`;
		case enCalcType.BestHoursBlock:
			return `best hours block`;
		case enCalcType.BestCostLTF:
			return `best cost LTF`;
		case enCalcType.BestSingleHoursLTF:
			return `best single hours LTF`;
		case enCalcType.BestHoursBlockLTF:
			return `best hours block LTF`;
		case enCalcType.SmartBatteryBuffer:
			return `smart battery buffer`;
		//case enCalcType.BestCostMaxHours:
		//return "best cost max hours";
		default:
			return "Unknown";
	}
}

export interface IHomeInfo {
	ID: string;
	NameInApp: string;
	RealTime: boolean;
	FeedActive: boolean;
	PriceDataPollActive: boolean;
}
