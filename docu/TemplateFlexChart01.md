## Template 01 for FlexCharts

```json
option = {
	backgroundColor: "rgb(232, 232, 232)",
	title: {
		text: "Tibber Price",
	},
	tooltip: {
		trigger: "axis",
		axisPointer: {
			type: "cross"
		}
	},
	grid: { // Randabstände
		left: "10%", right: "4%", top: "8%", bottom: "8%"
	},
	xAxis: {
		type: "category",
		boundaryGap: false,
		data: %%xAxisData%%.map(function (str) {
		return str.replace("T", "\n");
		})
	},
	yAxis: {
		type: "value",
		axisLabel: {formatter: "{value} ct/kWh"},
		axisPointer: {
			snap: true
		}
	},
	visualMap: {
		min: 0.2,
		max: 0.3,
		inRange: {
			color: ["green", "yellow", "red"] // Verlauf von grün über gelb nach rot
		},
		show: false
	},
	series: [
		{
			name: "Total",
			type: "line",
			step: "end",
			symbol: "none",
			data: %%yAxisData%%,

			markArea: {
				itemStyle: {
					color: "rgba(120, 200, 120, 0.2)"
				},
				data: [
					[{name: "Car Charging", xAxis: "29.12.\n04:00"}, {xAxis: "29.12.\n07:00"}],
					[{name: "Battery", xAxis: "29.12.\n21:00"}, {xAxis: "30.12.\n00:00"}]
				]
			}
		}
	]
};
```
