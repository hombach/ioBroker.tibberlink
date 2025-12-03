## Template 02 for FlexCharts

```typescript
{
	backgroundColor: "rgb(0, 0, 0)",
	title: {
		text: "Tibber Price",
		textStyle: {
			color: "#ffffff"
		}
	},
	dataZoom: [
		{
			"show": true,
			"start": 0,
			"end": 100,
			"bottom": "3%",
			"height": "7%"
		}
	],
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
		axisLabel: {formatter: "{value} Uhr"},
		boundaryGap: false,
		dataZoom: {id: 'dataZoomX',
            type: 'slider',
            xAxisIndex: [0],
            filterMode: 'filter',   // Set as 'filter' so that the modification
                                    // of window of xAxis will effect the
                                    // window of yAxis.
            start: 20,
            end: 40},
		data: %%xAxisData%%,
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
		max: 0.35,
		inRange: {
			color: ["green", "yellow", "red"] // Verlauf von grün über gelb nach rot
		},
		show: true
	},
	series: [
		{
			name: "Total",
			type: "bar",
			step: "end",
			symbol: "none",
			label: {
	            show: true, // Zeigt die Labels an
    	        position: 'top', // Positioniert die Labels über den Balken
        	    formatter: function(params) {
            	    // Kürze das Label auf 2 Stellen
                	return params.value.toString().substring(0, 4);
            	}
        	},
			data: %%yAxisData%%,

			markPoint: {
		        data: [
					{ type: 'max', name: 'Max', itemStyle: { color: 'red' } },
					{ type: 'min', name: 'Min', itemStyle: { color: 'green' } }
				]
			},
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
