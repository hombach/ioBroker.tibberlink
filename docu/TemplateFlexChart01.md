## Template 01 for FlexCharts

```typescript
{
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
		type: "time",
		boundaryGap: false
	},
	yAxis: {
		type: "value",
		axisLabel: {formatter: "{value} €/kWh"},
		axisPointer: {
			snap: true
		}
	},
	visualMap: {
		min: 0.2,
		max: 0.35,
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
			data: %%seriesData%%,

			markArea: {
				itemStyle: {
					color: "rgba(120, 200, 120, 0.2)"
				},
				data: [
					%%CalcChannelsData%%
				]
			},

	        markLine: { // Markierung des aktuellen Zeitblocks
                data: [
                    {
                        name: "now",
                        xAxis: (function() {
                            const now = new Date();
                            const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
                            now.setMinutes(roundedMinutes, 0, 0);
                            return now.getTime();
                        })()
                    }
                ],
                symbol: ["arrow", "none"],
                label: {
                    show: false,
                }
            }

        }
    ]

};
```
