## Template 01 for FlexCharts

```typescript
option = {
	backgroundColor: "rgb(232, 232, 232)",
	title: {
		text: "Tibber Price",
		textStyle: {
			color: "#ffffff"
		}
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
		data: %%xAxisData%%
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
					%%CalcChannelsData%%
				]
			}
		}
	]
};
```
