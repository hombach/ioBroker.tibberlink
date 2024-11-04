"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TibberHelper = exports.enCalcType = void 0;
exports.getCalcTypeDescription = getCalcTypeDescription;
var enCalcType;
(function (enCalcType) {
    enCalcType[enCalcType["BestCost"] = 1] = "BestCost";
    enCalcType[enCalcType["BestSingleHours"] = 2] = "BestSingleHours";
    enCalcType[enCalcType["BestHoursBlock"] = 3] = "BestHoursBlock";
    enCalcType[enCalcType["BestCostLTF"] = 4] = "BestCostLTF";
    enCalcType[enCalcType["BestSingleHoursLTF"] = 5] = "BestSingleHoursLTF";
    enCalcType[enCalcType["BestHoursBlockLTF"] = 6] = "BestHoursBlockLTF";
    enCalcType[enCalcType["SmartBatteryBuffer"] = 7] = "SmartBatteryBuffer";
    //BestCostMaxHours = 8,
})(enCalcType || (exports.enCalcType = enCalcType = {}));
function getCalcTypeDescription(calcType) {
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
class TibberHelper {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
}
exports.TibberHelper = TibberHelper;
//# sourceMappingURL=tibberHelper.js.map