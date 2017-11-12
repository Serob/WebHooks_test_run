/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 10800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 10800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 42.0, "minX": 0.0, "maxY": 1856.0, "series": [{"data": [[0.0, 42.0], [0.1, 49.0], [0.2, 56.0], [0.3, 60.0], [0.4, 61.0], [0.5, 62.0], [0.6, 65.0], [0.7, 67.0], [0.8, 69.0], [0.9, 70.0], [1.0, 72.0], [1.1, 73.0], [1.2, 73.0], [1.3, 74.0], [1.4, 76.0], [1.5, 77.0], [1.6, 80.0], [1.7, 81.0], [1.8, 82.0], [1.9, 82.0], [2.0, 83.0], [2.1, 83.0], [2.2, 84.0], [2.3, 85.0], [2.4, 86.0], [2.5, 87.0], [2.6, 88.0], [2.7, 89.0], [2.8, 90.0], [2.9, 90.0], [3.0, 91.0], [3.1, 92.0], [3.2, 93.0], [3.3, 94.0], [3.4, 95.0], [3.5, 96.0], [3.6, 97.0], [3.7, 99.0], [3.8, 100.0], [3.9, 101.0], [4.0, 103.0], [4.1, 104.0], [4.2, 105.0], [4.3, 105.0], [4.4, 105.0], [4.5, 106.0], [4.6, 107.0], [4.7, 108.0], [4.8, 108.0], [4.9, 109.0], [5.0, 110.0], [5.1, 111.0], [5.2, 112.0], [5.3, 112.0], [5.4, 113.0], [5.5, 114.0], [5.6, 114.0], [5.7, 116.0], [5.8, 116.0], [5.9, 117.0], [6.0, 117.0], [6.1, 119.0], [6.2, 120.0], [6.3, 121.0], [6.4, 122.0], [6.5, 123.0], [6.6, 126.0], [6.7, 127.0], [6.8, 128.0], [6.9, 130.0], [7.0, 132.0], [7.1, 134.0], [7.2, 135.0], [7.3, 137.0], [7.4, 138.0], [7.5, 139.0], [7.6, 140.0], [7.7, 141.0], [7.8, 142.0], [7.9, 143.0], [8.0, 144.0], [8.1, 145.0], [8.2, 146.0], [8.3, 147.0], [8.4, 147.0], [8.5, 148.0], [8.6, 149.0], [8.7, 150.0], [8.8, 150.0], [8.9, 151.0], [9.0, 151.0], [9.1, 152.0], [9.2, 152.0], [9.3, 153.0], [9.4, 154.0], [9.5, 154.0], [9.6, 155.0], [9.7, 155.0], [9.8, 156.0], [9.9, 156.0], [10.0, 157.0], [10.1, 158.0], [10.2, 158.0], [10.3, 159.0], [10.4, 159.0], [10.5, 159.0], [10.6, 160.0], [10.7, 160.0], [10.8, 161.0], [10.9, 161.0], [11.0, 162.0], [11.1, 162.0], [11.2, 163.0], [11.3, 163.0], [11.4, 163.0], [11.5, 164.0], [11.6, 164.0], [11.7, 165.0], [11.8, 165.0], [11.9, 166.0], [12.0, 166.0], [12.1, 166.0], [12.2, 167.0], [12.3, 168.0], [12.4, 168.0], [12.5, 169.0], [12.6, 170.0], [12.7, 171.0], [12.8, 172.0], [12.9, 172.0], [13.0, 173.0], [13.1, 174.0], [13.2, 175.0], [13.3, 177.0], [13.4, 178.0], [13.5, 180.0], [13.6, 181.0], [13.7, 182.0], [13.8, 183.0], [13.9, 184.0], [14.0, 185.0], [14.1, 187.0], [14.2, 187.0], [14.3, 188.0], [14.4, 189.0], [14.5, 189.0], [14.6, 190.0], [14.7, 191.0], [14.8, 191.0], [14.9, 192.0], [15.0, 193.0], [15.1, 194.0], [15.2, 194.0], [15.3, 195.0], [15.4, 196.0], [15.5, 197.0], [15.6, 199.0], [15.7, 199.0], [15.8, 199.0], [15.9, 200.0], [16.0, 201.0], [16.1, 201.0], [16.2, 202.0], [16.3, 202.0], [16.4, 203.0], [16.5, 203.0], [16.6, 204.0], [16.7, 206.0], [16.8, 206.0], [16.9, 208.0], [17.0, 209.0], [17.1, 211.0], [17.2, 212.0], [17.3, 213.0], [17.4, 213.0], [17.5, 213.0], [17.6, 214.0], [17.7, 215.0], [17.8, 216.0], [17.9, 217.0], [18.0, 218.0], [18.1, 219.0], [18.2, 221.0], [18.3, 222.0], [18.4, 225.0], [18.5, 227.0], [18.6, 227.0], [18.7, 228.0], [18.8, 230.0], [18.9, 231.0], [19.0, 232.0], [19.1, 232.0], [19.2, 234.0], [19.3, 235.0], [19.4, 236.0], [19.5, 237.0], [19.6, 238.0], [19.7, 238.0], [19.8, 239.0], [19.9, 241.0], [20.0, 241.0], [20.1, 242.0], [20.2, 242.0], [20.3, 244.0], [20.4, 245.0], [20.5, 246.0], [20.6, 247.0], [20.7, 249.0], [20.8, 250.0], [20.9, 251.0], [21.0, 252.0], [21.1, 252.0], [21.2, 253.0], [21.3, 254.0], [21.4, 254.0], [21.5, 255.0], [21.6, 256.0], [21.7, 257.0], [21.8, 257.0], [21.9, 259.0], [22.0, 260.0], [22.1, 261.0], [22.2, 261.0], [22.3, 262.0], [22.4, 262.0], [22.5, 262.0], [22.6, 263.0], [22.7, 263.0], [22.8, 263.0], [22.9, 264.0], [23.0, 264.0], [23.1, 264.0], [23.2, 265.0], [23.3, 265.0], [23.4, 266.0], [23.5, 268.0], [23.6, 270.0], [23.7, 272.0], [23.8, 273.0], [23.9, 274.0], [24.0, 276.0], [24.1, 278.0], [24.2, 279.0], [24.3, 281.0], [24.4, 282.0], [24.5, 286.0], [24.6, 286.0], [24.7, 288.0], [24.8, 289.0], [24.9, 290.0], [25.0, 291.0], [25.1, 292.0], [25.2, 294.0], [25.3, 295.0], [25.4, 297.0], [25.5, 297.0], [25.6, 298.0], [25.7, 298.0], [25.8, 299.0], [25.9, 302.0], [26.0, 304.0], [26.1, 304.0], [26.2, 305.0], [26.3, 307.0], [26.4, 308.0], [26.5, 310.0], [26.6, 313.0], [26.7, 314.0], [26.8, 316.0], [26.9, 317.0], [27.0, 318.0], [27.1, 320.0], [27.2, 322.0], [27.3, 324.0], [27.4, 324.0], [27.5, 325.0], [27.6, 325.0], [27.7, 326.0], [27.8, 326.0], [27.9, 327.0], [28.0, 330.0], [28.1, 331.0], [28.2, 333.0], [28.3, 334.0], [28.4, 336.0], [28.5, 338.0], [28.6, 339.0], [28.7, 340.0], [28.8, 341.0], [28.9, 342.0], [29.0, 342.0], [29.1, 343.0], [29.2, 344.0], [29.3, 345.0], [29.4, 346.0], [29.5, 349.0], [29.6, 349.0], [29.7, 349.0], [29.8, 350.0], [29.9, 350.0], [30.0, 352.0], [30.1, 352.0], [30.2, 353.0], [30.3, 354.0], [30.4, 357.0], [30.5, 358.0], [30.6, 360.0], [30.7, 364.0], [30.8, 365.0], [30.9, 366.0], [31.0, 367.0], [31.1, 368.0], [31.2, 369.0], [31.3, 370.0], [31.4, 371.0], [31.5, 371.0], [31.6, 372.0], [31.7, 373.0], [31.8, 374.0], [31.9, 374.0], [32.0, 374.0], [32.1, 374.0], [32.2, 374.0], [32.3, 375.0], [32.4, 376.0], [32.5, 376.0], [32.6, 376.0], [32.7, 377.0], [32.8, 377.0], [32.9, 378.0], [33.0, 379.0], [33.1, 380.0], [33.2, 380.0], [33.3, 381.0], [33.4, 381.0], [33.5, 382.0], [33.6, 383.0], [33.7, 384.0], [33.8, 385.0], [33.9, 386.0], [34.0, 388.0], [34.1, 390.0], [34.2, 391.0], [34.3, 393.0], [34.4, 395.0], [34.5, 400.0], [34.6, 404.0], [34.7, 406.0], [34.8, 408.0], [34.9, 410.0], [35.0, 411.0], [35.1, 413.0], [35.2, 416.0], [35.3, 419.0], [35.4, 421.0], [35.5, 424.0], [35.6, 425.0], [35.7, 426.0], [35.8, 426.0], [35.9, 427.0], [36.0, 428.0], [36.1, 428.0], [36.2, 429.0], [36.3, 430.0], [36.4, 430.0], [36.5, 430.0], [36.6, 432.0], [36.7, 433.0], [36.8, 434.0], [36.9, 435.0], [37.0, 435.0], [37.1, 436.0], [37.2, 436.0], [37.3, 437.0], [37.4, 438.0], [37.5, 438.0], [37.6, 439.0], [37.7, 439.0], [37.8, 440.0], [37.9, 441.0], [38.0, 441.0], [38.1, 442.0], [38.2, 442.0], [38.3, 442.0], [38.4, 443.0], [38.5, 444.0], [38.6, 445.0], [38.7, 445.0], [38.8, 447.0], [38.9, 448.0], [39.0, 450.0], [39.1, 452.0], [39.2, 452.0], [39.3, 453.0], [39.4, 453.0], [39.5, 455.0], [39.6, 456.0], [39.7, 457.0], [39.8, 457.0], [39.9, 458.0], [40.0, 458.0], [40.1, 458.0], [40.2, 459.0], [40.3, 459.0], [40.4, 460.0], [40.5, 461.0], [40.6, 462.0], [40.7, 463.0], [40.8, 464.0], [40.9, 464.0], [41.0, 465.0], [41.1, 466.0], [41.2, 466.0], [41.3, 467.0], [41.4, 468.0], [41.5, 468.0], [41.6, 468.0], [41.7, 469.0], [41.8, 469.0], [41.9, 470.0], [42.0, 470.0], [42.1, 471.0], [42.2, 472.0], [42.3, 472.0], [42.4, 473.0], [42.5, 473.0], [42.6, 474.0], [42.7, 474.0], [42.8, 474.0], [42.9, 475.0], [43.0, 476.0], [43.1, 476.0], [43.2, 477.0], [43.3, 478.0], [43.4, 479.0], [43.5, 479.0], [43.6, 479.0], [43.7, 480.0], [43.8, 481.0], [43.9, 481.0], [44.0, 482.0], [44.1, 482.0], [44.2, 483.0], [44.3, 484.0], [44.4, 485.0], [44.5, 485.0], [44.6, 485.0], [44.7, 486.0], [44.8, 487.0], [44.9, 487.0], [45.0, 488.0], [45.1, 488.0], [45.2, 489.0], [45.3, 489.0], [45.4, 489.0], [45.5, 489.0], [45.6, 490.0], [45.7, 490.0], [45.8, 490.0], [45.9, 491.0], [46.0, 491.0], [46.1, 491.0], [46.2, 492.0], [46.3, 492.0], [46.4, 492.0], [46.5, 492.0], [46.6, 493.0], [46.7, 493.0], [46.8, 493.0], [46.9, 494.0], [47.0, 494.0], [47.1, 495.0], [47.2, 495.0], [47.3, 495.0], [47.4, 496.0], [47.5, 496.0], [47.6, 496.0], [47.7, 497.0], [47.8, 497.0], [47.9, 497.0], [48.0, 498.0], [48.1, 498.0], [48.2, 498.0], [48.3, 498.0], [48.4, 499.0], [48.5, 499.0], [48.6, 499.0], [48.7, 499.0], [48.8, 500.0], [48.9, 500.0], [49.0, 500.0], [49.1, 501.0], [49.2, 501.0], [49.3, 501.0], [49.4, 502.0], [49.5, 502.0], [49.6, 502.0], [49.7, 502.0], [49.8, 503.0], [49.9, 503.0], [50.0, 503.0], [50.1, 504.0], [50.2, 504.0], [50.3, 504.0], [50.4, 505.0], [50.5, 505.0], [50.6, 505.0], [50.7, 506.0], [50.8, 506.0], [50.9, 507.0], [51.0, 507.0], [51.1, 507.0], [51.2, 508.0], [51.3, 508.0], [51.4, 509.0], [51.5, 509.0], [51.6, 509.0], [51.7, 510.0], [51.8, 510.0], [51.9, 511.0], [52.0, 511.0], [52.1, 511.0], [52.2, 512.0], [52.3, 512.0], [52.4, 512.0], [52.5, 513.0], [52.6, 514.0], [52.7, 514.0], [52.8, 515.0], [52.9, 516.0], [53.0, 516.0], [53.1, 517.0], [53.2, 517.0], [53.3, 520.0], [53.4, 522.0], [53.5, 522.0], [53.6, 523.0], [53.7, 524.0], [53.8, 526.0], [53.9, 527.0], [54.0, 529.0], [54.1, 531.0], [54.2, 533.0], [54.3, 534.0], [54.4, 535.0], [54.5, 535.0], [54.6, 537.0], [54.7, 537.0], [54.8, 537.0], [54.9, 538.0], [55.0, 539.0], [55.1, 539.0], [55.2, 540.0], [55.3, 541.0], [55.4, 542.0], [55.5, 544.0], [55.6, 546.0], [55.7, 547.0], [55.8, 548.0], [55.9, 550.0], [56.0, 552.0], [56.1, 552.0], [56.2, 553.0], [56.3, 557.0], [56.4, 558.0], [56.5, 562.0], [56.6, 563.0], [56.7, 563.0], [56.8, 566.0], [56.9, 567.0], [57.0, 569.0], [57.1, 570.0], [57.2, 573.0], [57.3, 574.0], [57.4, 577.0], [57.5, 580.0], [57.6, 581.0], [57.7, 583.0], [57.8, 584.0], [57.9, 584.0], [58.0, 585.0], [58.1, 585.0], [58.2, 586.0], [58.3, 586.0], [58.4, 587.0], [58.5, 587.0], [58.6, 587.0], [58.7, 588.0], [58.8, 588.0], [58.9, 589.0], [59.0, 589.0], [59.1, 589.0], [59.2, 589.0], [59.3, 590.0], [59.4, 590.0], [59.5, 590.0], [59.6, 591.0], [59.7, 592.0], [59.8, 592.0], [59.9, 593.0], [60.0, 594.0], [60.1, 594.0], [60.2, 595.0], [60.3, 596.0], [60.4, 598.0], [60.5, 598.0], [60.6, 599.0], [60.7, 599.0], [60.8, 601.0], [60.9, 601.0], [61.0, 601.0], [61.1, 602.0], [61.2, 603.0], [61.3, 604.0], [61.4, 605.0], [61.5, 607.0], [61.6, 608.0], [61.7, 611.0], [61.8, 613.0], [61.9, 614.0], [62.0, 616.0], [62.1, 621.0], [62.2, 623.0], [62.3, 624.0], [62.4, 627.0], [62.5, 629.0], [62.6, 631.0], [62.7, 633.0], [62.8, 634.0], [62.9, 635.0], [63.0, 636.0], [63.1, 637.0], [63.2, 637.0], [63.3, 639.0], [63.4, 640.0], [63.5, 641.0], [63.6, 642.0], [63.7, 643.0], [63.8, 643.0], [63.9, 644.0], [64.0, 646.0], [64.1, 649.0], [64.2, 652.0], [64.3, 655.0], [64.4, 657.0], [64.5, 658.0], [64.6, 660.0], [64.7, 662.0], [64.8, 663.0], [64.9, 665.0], [65.0, 667.0], [65.1, 668.0], [65.2, 669.0], [65.3, 671.0], [65.4, 672.0], [65.5, 673.0], [65.6, 675.0], [65.7, 676.0], [65.8, 676.0], [65.9, 677.0], [66.0, 677.0], [66.1, 678.0], [66.2, 678.0], [66.3, 679.0], [66.4, 679.0], [66.5, 681.0], [66.6, 681.0], [66.7, 684.0], [66.8, 685.0], [66.9, 686.0], [67.0, 688.0], [67.1, 688.0], [67.2, 689.0], [67.3, 691.0], [67.4, 692.0], [67.5, 693.0], [67.6, 694.0], [67.7, 695.0], [67.8, 695.0], [67.9, 695.0], [68.0, 696.0], [68.1, 696.0], [68.2, 697.0], [68.3, 698.0], [68.4, 699.0], [68.5, 699.0], [68.6, 700.0], [68.7, 700.0], [68.8, 701.0], [68.9, 701.0], [69.0, 703.0], [69.1, 704.0], [69.2, 705.0], [69.3, 706.0], [69.4, 707.0], [69.5, 708.0], [69.6, 708.0], [69.7, 710.0], [69.8, 710.0], [69.9, 711.0], [70.0, 714.0], [70.1, 717.0], [70.2, 719.0], [70.3, 719.0], [70.4, 721.0], [70.5, 722.0], [70.6, 725.0], [70.7, 727.0], [70.8, 730.0], [70.9, 733.0], [71.0, 737.0], [71.1, 738.0], [71.2, 741.0], [71.3, 746.0], [71.4, 750.0], [71.5, 754.0], [71.6, 756.0], [71.7, 758.0], [71.8, 770.0], [71.9, 775.0], [72.0, 780.0], [72.1, 786.0], [72.2, 797.0], [72.3, 800.0], [72.4, 802.0], [72.5, 807.0], [72.6, 817.0], [72.7, 821.0], [72.8, 826.0], [72.9, 832.0], [73.0, 833.0], [73.1, 835.0], [73.2, 837.0], [73.3, 840.0], [73.4, 843.0], [73.5, 844.0], [73.6, 848.0], [73.7, 857.0], [73.8, 863.0], [73.9, 865.0], [74.0, 870.0], [74.1, 874.0], [74.2, 875.0], [74.3, 880.0], [74.4, 883.0], [74.5, 885.0], [74.6, 888.0], [74.7, 889.0], [74.8, 890.0], [74.9, 892.0], [75.0, 895.0], [75.1, 898.0], [75.2, 905.0], [75.3, 912.0], [75.4, 925.0], [75.5, 932.0], [75.6, 942.0], [75.7, 944.0], [75.8, 945.0], [75.9, 947.0], [76.0, 948.0], [76.1, 949.0], [76.2, 949.0], [76.3, 949.0], [76.4, 951.0], [76.5, 952.0], [76.6, 954.0], [76.7, 960.0], [76.8, 962.0], [76.9, 964.0], [77.0, 967.0], [77.1, 968.0], [77.2, 969.0], [77.3, 970.0], [77.4, 971.0], [77.5, 972.0], [77.6, 972.0], [77.7, 973.0], [77.8, 974.0], [77.9, 975.0], [78.0, 976.0], [78.1, 978.0], [78.2, 979.0], [78.3, 984.0], [78.4, 987.0], [78.5, 988.0], [78.6, 990.0], [78.7, 991.0], [78.8, 992.0], [78.9, 994.0], [79.0, 995.0], [79.1, 996.0], [79.2, 997.0], [79.3, 997.0], [79.4, 1000.0], [79.5, 1003.0], [79.6, 1003.0], [79.7, 1004.0], [79.8, 1006.0], [79.9, 1007.0], [80.0, 1009.0], [80.1, 1009.0], [80.2, 1012.0], [80.3, 1013.0], [80.4, 1015.0], [80.5, 1016.0], [80.6, 1018.0], [80.7, 1020.0], [80.8, 1020.0], [80.9, 1023.0], [81.0, 1024.0], [81.1, 1025.0], [81.2, 1025.0], [81.3, 1026.0], [81.4, 1027.0], [81.5, 1029.0], [81.6, 1034.0], [81.7, 1045.0], [81.8, 1048.0], [81.9, 1050.0], [82.0, 1051.0], [82.1, 1052.0], [82.2, 1053.0], [82.3, 1054.0], [82.4, 1055.0], [82.5, 1055.0], [82.6, 1056.0], [82.7, 1056.0], [82.8, 1057.0], [82.9, 1057.0], [83.0, 1059.0], [83.1, 1061.0], [83.2, 1062.0], [83.3, 1064.0], [83.4, 1068.0], [83.5, 1069.0], [83.6, 1074.0], [83.7, 1076.0], [83.8, 1078.0], [83.9, 1082.0], [84.0, 1084.0], [84.1, 1090.0], [84.2, 1096.0], [84.3, 1099.0], [84.4, 1100.0], [84.5, 1104.0], [84.6, 1105.0], [84.7, 1108.0], [84.8, 1112.0], [84.9, 1114.0], [85.0, 1117.0], [85.1, 1120.0], [85.2, 1121.0], [85.3, 1124.0], [85.4, 1126.0], [85.5, 1128.0], [85.6, 1132.0], [85.7, 1134.0], [85.8, 1138.0], [85.9, 1142.0], [86.0, 1145.0], [86.1, 1147.0], [86.2, 1153.0], [86.3, 1160.0], [86.4, 1161.0], [86.5, 1163.0], [86.6, 1165.0], [86.7, 1178.0], [86.8, 1182.0], [86.9, 1215.0], [87.0, 1218.0], [87.1, 1220.0], [87.2, 1229.0], [87.3, 1233.0], [87.4, 1235.0], [87.5, 1238.0], [87.6, 1239.0], [87.7, 1240.0], [87.8, 1242.0], [87.9, 1245.0], [88.0, 1248.0], [88.1, 1251.0], [88.2, 1255.0], [88.3, 1259.0], [88.4, 1263.0], [88.5, 1263.0], [88.6, 1265.0], [88.7, 1271.0], [88.8, 1272.0], [88.9, 1274.0], [89.0, 1276.0], [89.1, 1280.0], [89.2, 1290.0], [89.3, 1291.0], [89.4, 1293.0], [89.5, 1296.0], [89.6, 1296.0], [89.7, 1297.0], [89.8, 1298.0], [89.9, 1299.0], [90.0, 1300.0], [90.1, 1301.0], [90.2, 1301.0], [90.3, 1302.0], [90.4, 1303.0], [90.5, 1304.0], [90.6, 1304.0], [90.7, 1305.0], [90.8, 1306.0], [90.9, 1307.0], [91.0, 1310.0], [91.1, 1313.0], [91.2, 1314.0], [91.3, 1316.0], [91.4, 1317.0], [91.5, 1318.0], [91.6, 1320.0], [91.7, 1321.0], [91.8, 1322.0], [91.9, 1323.0], [92.0, 1324.0], [92.1, 1325.0], [92.2, 1328.0], [92.3, 1330.0], [92.4, 1331.0], [92.5, 1336.0], [92.6, 1339.0], [92.7, 1343.0], [92.8, 1345.0], [92.9, 1347.0], [93.0, 1348.0], [93.1, 1349.0], [93.2, 1349.0], [93.3, 1350.0], [93.4, 1351.0], [93.5, 1352.0], [93.6, 1353.0], [93.7, 1355.0], [93.8, 1356.0], [93.9, 1360.0], [94.0, 1362.0], [94.1, 1364.0], [94.2, 1366.0], [94.3, 1370.0], [94.4, 1374.0], [94.5, 1378.0], [94.6, 1379.0], [94.7, 1382.0], [94.8, 1386.0], [94.9, 1387.0], [95.0, 1388.0], [95.1, 1390.0], [95.2, 1390.0], [95.3, 1393.0], [95.4, 1394.0], [95.5, 1394.0], [95.6, 1396.0], [95.7, 1403.0], [95.8, 1407.0], [95.9, 1410.0], [96.0, 1417.0], [96.1, 1426.0], [96.2, 1431.0], [96.3, 1432.0], [96.4, 1434.0], [96.5, 1440.0], [96.6, 1443.0], [96.7, 1452.0], [96.8, 1459.0], [96.9, 1464.0], [97.0, 1472.0], [97.1, 1474.0], [97.2, 1489.0], [97.3, 1495.0], [97.4, 1500.0], [97.5, 1503.0], [97.6, 1504.0], [97.7, 1504.0], [97.8, 1505.0], [97.9, 1506.0], [98.0, 1507.0], [98.1, 1509.0], [98.2, 1546.0], [98.3, 1548.0], [98.4, 1570.0], [98.5, 1611.0], [98.6, 1622.0], [98.7, 1624.0], [98.8, 1628.0], [98.9, 1630.0], [99.0, 1632.0], [99.1, 1633.0], [99.2, 1635.0], [99.3, 1704.0], [99.4, 1707.0], [99.5, 1737.0], [99.6, 1755.0], [99.7, 1816.0], [99.8, 1824.0], [99.9, 1845.0], [100.0, 1856.0]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 105.0, "minX": 0.0, "maxY": 1951.0, "series": [{"data": [[0.0, 1951.0], [1500.0, 105.0], [500.0, 1222.0], [1000.0, 722.0]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 1500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 104.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1961.0, "series": [{"data": [[1.0, 1935.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 1961.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 104.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 41.43939393939393, "minX": 1.510488561E12, "maxY": 200.0, "series": [{"data": [[1.510488582E12, 41.43939393939393], [1.510488561E12, 151.28640776699027], [1.510488562E12, 200.0], [1.510488563E12, 200.0], [1.510488564E12, 200.0], [1.510488565E12, 200.0], [1.510488577E12, 200.0], [1.510488578E12, 200.0], [1.510488579E12, 198.96137339055798], [1.51048858E12, 176.7857142857143], [1.510488581E12, 126.55066079295165], [1.510488571E12, 200.0], [1.510488572E12, 200.0], [1.510488573E12, 200.0], [1.510488574E12, 200.0], [1.510488575E12, 200.0], [1.510488576E12, 200.0], [1.510488566E12, 200.0], [1.510488567E12, 200.0], [1.510488568E12, 200.0], [1.510488569E12, 200.0], [1.51048857E12, 200.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.510488582E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 218.27272727272725, "minX": 1.0, "maxY": 1221.6666666666667, "series": [{"data": [[2.0, 468.0], [4.0, 469.5], [5.0, 464.0], [6.0, 467.0], [7.0, 468.0], [8.0, 464.0], [9.0, 464.0], [10.0, 467.0], [11.0, 618.0], [12.0, 691.0], [13.0, 691.0], [14.0, 688.0], [15.0, 687.0], [16.0, 686.0], [17.0, 685.0], [18.0, 688.0], [19.0, 690.0], [20.0, 689.0], [21.0, 694.0], [22.0, 697.0], [23.0, 693.0], [24.0, 692.0], [25.0, 693.0], [26.0, 380.0], [27.0, 380.0], [28.0, 377.0], [29.0, 375.0], [30.0, 376.0], [31.0, 376.0], [33.0, 376.0], [32.0, 374.0], [35.0, 376.0], [34.0, 376.0], [37.0, 374.0], [36.0, 375.0], [39.0, 374.0], [38.0, 374.0], [41.0, 521.0], [40.0, 522.0], [43.0, 523.0], [42.0, 517.0], [45.0, 523.0], [44.0, 524.0], [47.0, 520.0], [46.0, 522.0], [49.0, 537.0], [48.0, 532.0], [51.0, 533.0], [50.0, 534.0], [53.0, 533.0], [52.0, 534.0], [55.0, 531.0], [54.0, 530.0], [57.0, 529.0], [56.0, 531.0], [59.0, 523.0], [58.0, 527.0], [61.0, 522.0], [60.0, 522.0], [63.0, 218.27272727272725], [62.0, 517.0], [64.0, 327.5], [65.0, 261.5], [67.0, 271.0833333333333], [70.0, 354.5], [71.0, 499.0], [69.0, 504.0], [68.0, 505.0], [75.0, 487.0], [74.0, 488.0], [73.0, 491.0], [72.0, 498.0], [77.0, 343.5], [78.0, 382.4], [79.0, 407.875], [76.0, 485.0], [80.0, 281.8], [81.0, 330.5], [83.0, 480.0], [82.0, 479.0], [86.0, 473.0], [85.0, 474.0], [84.0, 475.0], [91.0, 468.0], [90.0, 471.0], [89.0, 472.0], [88.0, 469.0], [95.0, 468.0], [94.0, 469.0], [93.0, 469.0], [92.0, 469.0], [99.0, 699.0], [98.0, 700.0], [97.0, 695.0], [96.0, 468.0], [103.0, 1046.1818181818182], [102.0, 700.0], [101.0, 701.0], [100.0, 704.0], [106.0, 336.0], [107.0, 522.0], [105.0, 341.0], [104.0, 324.0], [111.0, 537.0], [110.0, 537.0], [109.0, 527.0], [108.0, 527.0], [115.0, 548.0], [114.0, 541.0], [113.0, 540.0], [112.0, 542.0], [119.0, 547.0], [118.0, 549.0], [117.0, 547.0], [116.0, 548.0], [123.0, 585.0], [122.0, 545.0], [121.0, 544.0], [120.0, 544.0], [127.0, 590.5], [125.0, 590.0], [124.0, 590.0], [135.0, 383.0], [134.0, 383.0], [133.0, 384.0], [132.0, 387.5], [131.0, 390.0], [130.0, 1132.758620689655], [129.0, 1021.5], [128.0, 601.6666666666667], [143.0, 501.5217391304348], [142.0, 431.0], [141.0, 437.38461538461536], [140.0, 437.3], [139.0, 381.0], [138.0, 382.0], [137.0, 382.0], [136.0, 382.0], [144.0, 490.61538461538464], [145.0, 789.0], [146.0, 683.0], [148.0, 584.0], [149.0, 585.3333333333334], [150.0, 682.25], [151.0, 371.5], [147.0, 991.0], [155.0, 501.1428571428571], [157.0, 466.5], [159.0, 472.0], [158.0, 552.0], [156.0, 551.3333333333334], [154.0, 844.2666666666665], [153.0, 1221.6666666666667], [152.0, 1037.6], [161.0, 479.5], [167.0, 525.0], [165.0, 506.5], [164.0, 317.0], [163.0, 261.5], [162.0, 1022.8648648648646], [160.0, 553.0], [168.0, 457.0], [169.0, 447.75], [172.0, 464.5], [173.0, 455.3333333333333], [175.0, 500.0], [174.0, 504.0], [171.0, 508.0], [170.0, 516.0], [176.0, 460.3333333333333], [177.0, 488.0], [178.0, 458.0], [183.0, 488.0], [182.0, 489.0], [181.0, 493.0], [180.0, 493.3333333333333], [179.0, 495.0], [189.0, 966.5000000000001], [190.0, 531.5], [191.0, 372.0], [188.0, 523.0], [187.0, 537.0], [186.0, 538.0], [185.0, 537.0], [184.0, 538.0], [192.0, 516.0], [193.0, 450.25], [194.0, 419.1428571428571], [195.0, 460.5], [197.0, 469.75], [198.0, 489.3333333333333], [199.0, 494.3333333333333], [196.0, 402.0], [200.0, 615.1800521890405], [1.0, 469.0]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}, {"data": [[189.83375000000024, 615.2025000000014]], "isOverall": false, "label": "Client_request(with 4 urls)-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 200.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 16962.0, "minX": 1.510488561E12, "maxY": 86111.0, "series": [{"data": [[1.510488582E12, 16962.0], [1.510488561E12, 52942.0], [1.510488562E12, 51400.0], [1.510488563E12, 34952.0], [1.510488564E12, 38807.0], [1.510488565E12, 65021.0], [1.510488577E12, 44975.0], [1.510488578E12, 47545.0], [1.510488579E12, 59881.0], [1.51048858E12, 35980.0], [1.510488581E12, 58339.0], [1.510488571E12, 51400.0], [1.510488572E12, 32382.0], [1.510488573E12, 41120.0], [1.510488574E12, 46517.0], [1.510488575E12, 43433.0], [1.510488576E12, 46774.0], [1.510488566E12, 53970.0], [1.510488567E12, 51400.0], [1.510488568E12, 51400.0], [1.510488569E12, 51400.0], [1.51048857E12, 51400.0]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.510488582E12, 22464.0], [1.510488561E12, 70067.0], [1.510488562E12, 68075.0], [1.510488563E12, 46282.0], [1.510488564E12, 51396.0], [1.510488565E12, 86111.0], [1.510488577E12, 59546.0], [1.510488578E12, 62949.0], [1.510488579E12, 79318.0], [1.51048858E12, 47631.0], [1.510488581E12, 77336.0], [1.510488571E12, 68066.0], [1.510488572E12, 42881.0], [1.510488573E12, 54463.0], [1.510488574E12, 61608.0], [1.510488575E12, 57510.0], [1.510488576E12, 61953.0], [1.510488566E12, 71475.0], [1.510488567E12, 68066.0], [1.510488568E12, 68067.0], [1.510488569E12, 68066.0], [1.51048857E12, 68068.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.510488582E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 99.87000000000005, "minX": 1.510488561E12, "maxY": 1091.8285714285707, "series": [{"data": [[1.510488582E12, 566.6666666666669], [1.510488561E12, 482.28155339805807], [1.510488562E12, 523.9200000000001], [1.510488563E12, 683.7205882352945], [1.510488564E12, 773.2119205298015], [1.510488565E12, 770.4901185770751], [1.510488577E12, 1091.8285714285707], [1.510488578E12, 919.2756756756756], [1.510488579E12, 801.4206008583687], [1.51048858E12, 630.8785714285711], [1.510488581E12, 734.7709251101319], [1.510488571E12, 241.66500000000005], [1.510488572E12, 658.1666666666663], [1.510488573E12, 861.0312499999999], [1.510488574E12, 791.4861878453039], [1.510488575E12, 835.3550295857988], [1.510488576E12, 1031.9780219780223], [1.510488566E12, 577.4952380952383], [1.510488567E12, 335.06999999999994], [1.510488568E12, 161.31999999999994], [1.510488569E12, 99.87000000000005], [1.51048857E12, 149.055]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.510488582E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 99.83500000000005, "minX": 1.510488561E12, "maxY": 1091.8057142857149, "series": [{"data": [[1.510488582E12, 566.6515151515152], [1.510488561E12, 482.2281553398059], [1.510488562E12, 523.8649999999999], [1.510488563E12, 683.6838235294119], [1.510488564E12, 773.158940397351], [1.510488565E12, 770.4426877470358], [1.510488577E12, 1091.8057142857149], [1.510488578E12, 919.2702702702704], [1.510488579E12, 801.4077253218882], [1.51048858E12, 630.8642857142856], [1.510488581E12, 734.7488986784142], [1.510488571E12, 241.62999999999997], [1.510488572E12, 658.1349206349207], [1.510488573E12, 861.0062499999999], [1.510488574E12, 791.469613259669], [1.510488575E12, 835.3017751479292], [1.510488576E12, 1031.9560439560444], [1.510488566E12, 577.4619047619051], [1.510488567E12, 335.0300000000002], [1.510488568E12, 161.28500000000022], [1.510488569E12, 99.83500000000005], [1.51048857E12, 149.01999999999998]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.510488582E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.2698412698412697, "minX": 1.510488561E12, "maxY": 33.718446601941764, "series": [{"data": [[1.510488582E12, 0.48484848484848486], [1.510488561E12, 33.718446601941764], [1.510488562E12, 0.6199999999999998], [1.510488563E12, 0.42647058823529405], [1.510488564E12, 1.655629139072848], [1.510488565E12, 0.8260869565217389], [1.510488577E12, 2.085714285714287], [1.510488578E12, 0.6972972972972974], [1.510488579E12, 0.6437768240343346], [1.51048858E12, 0.2999999999999999], [1.510488581E12, 0.5594713656387668], [1.510488571E12, 0.4], [1.510488572E12, 0.2698412698412697], [1.510488573E12, 0.8250000000000005], [1.510488574E12, 0.6243093922651932], [1.510488575E12, 0.5739644970414198], [1.510488576E12, 0.8131868131868137], [1.510488566E12, 0.9190476190476191], [1.510488567E12, 0.6999999999999996], [1.510488568E12, 0.6550000000000002], [1.510488569E12, 0.5300000000000001], [1.51048857E12, 0.695]], "isOverall": false, "label": "Client_request(with 4 urls)", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.510488582E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 42.0, "minX": 1.510488561E12, "maxY": 1856.0, "series": [{"data": [[1.510488582E12, 1102.0], [1.510488561E12, 772.0], [1.510488562E12, 973.0], [1.510488563E12, 945.0], [1.510488564E12, 1443.0], [1.510488565E12, 1398.0], [1.510488577E12, 1824.0], [1.510488578E12, 1708.0], [1.510488579E12, 1507.0], [1.51048858E12, 1275.0], [1.510488581E12, 1306.0], [1.510488571E12, 414.0], [1.510488572E12, 988.0], [1.510488573E12, 1600.0], [1.510488574E12, 1485.0], [1.510488575E12, 1353.0], [1.510488576E12, 1856.0], [1.510488566E12, 1120.0], [1.510488567E12, 695.0], [1.510488568E12, 268.0], [1.510488569E12, 172.0], [1.51048857E12, 274.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.510488582E12, 324.0], [1.510488561E12, 45.0], [1.510488562E12, 180.0], [1.510488563E12, 456.0], [1.510488564E12, 222.0], [1.510488565E12, 166.0], [1.510488577E12, 134.0], [1.510488578E12, 193.0], [1.510488579E12, 275.0], [1.51048858E12, 194.0], [1.510488581E12, 381.0], [1.510488571E12, 147.0], [1.510488572E12, 212.0], [1.510488573E12, 371.0], [1.510488574E12, 257.0], [1.510488575E12, 406.0], [1.510488576E12, 362.0], [1.510488566E12, 219.0], [1.510488567E12, 199.0], [1.510488568E12, 60.0], [1.510488569E12, 42.0], [1.51048857E12, 56.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.510488582E12, 1310.0], [1.510488561E12, 706.3], [1.510488562E12, 708.0], [1.510488563E12, 864.6], [1.510488564E12, 1045.2], [1.510488565E12, 1256.0], [1.510488577E12, 1304.0], [1.510488578E12, 1320.2000000000003], [1.510488579E12, 1320.0], [1.51048858E12, 1317.7000000000003], [1.510488581E12, 1310.4000000000005], [1.510488571E12, 874.0], [1.510488572E12, 891.6000000000001], [1.510488573E12, 1005.0], [1.510488574E12, 1087.0], [1.510488575E12, 1127.0], [1.510488576E12, 1241.2000000000003], [1.510488566E12, 1128.0], [1.510488567E12, 1104.0], [1.510488568E12, 1076.1000000000001], [1.510488569E12, 968.4000000000005], [1.51048857E12, 949.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.510488582E12, 1633.0], [1.510488561E12, 766.9900000000002], [1.510488562E12, 967.5899999999999], [1.510488563E12, 967.0], [1.510488564E12, 1324.0], [1.510488565E12, 1378.2], [1.510488577E12, 1633.0], [1.510488578E12, 1704.0], [1.510488579E12, 1635.9700000000034], [1.51048858E12, 1633.0], [1.510488581E12, 1633.0], [1.510488571E12, 1351.8200000000002], [1.510488572E12, 1346.7999999999993], [1.510488573E12, 1405.9499999999998], [1.510488574E12, 1408.0], [1.510488575E12, 1406.92], [1.510488576E12, 1465.2600000000002], [1.510488566E12, 1378.0], [1.510488567E12, 1368.7799999999993], [1.510488568E12, 1366.41], [1.510488569E12, 1364.8200000000002], [1.51048857E12, 1359.8200000000002]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.510488582E12, 1393.2999999999997], [1.510488561E12, 710.65], [1.510488562E12, 953.0], [1.510488563E12, 947.3], [1.510488564E12, 1292.8000000000002], [1.510488565E12, 1321.0], [1.510488577E12, 1405.0], [1.510488578E12, 1405.1], [1.510488579E12, 1403.0], [1.51048858E12, 1399.0], [1.510488581E12, 1394.0], [1.510488571E12, 1133.05], [1.510488572E12, 1113.8], [1.510488573E12, 1302.0], [1.510488574E12, 1313.0], [1.510488575E12, 1314.0], [1.510488576E12, 1325.1], [1.510488566E12, 1317.0], [1.510488567E12, 1309.6499999999999], [1.510488568E12, 1302.05], [1.510488569E12, 1296.0], [1.51048857E12, 1256.1499999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.510488582E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 196.0, "minX": 66.0, "maxY": 1433.0, "series": [{"data": [[136.0, 665.5], [140.0, 527.0], [151.0, 514.0], [160.0, 720.5], [169.0, 643.0], [175.0, 1433.0], [181.0, 501.0], [182.0, 1058.5], [185.0, 991.0], [206.0, 442.0], [200.0, 196.0], [210.0, 613.0], [227.0, 590.0], [233.0, 948.0], [253.0, 797.0], [66.0, 523.0], [126.0, 817.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 253.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 196.0, "minX": 66.0, "maxY": 1433.0, "series": [{"data": [[136.0, 665.5], [140.0, 527.0], [151.0, 514.0], [160.0, 720.5], [169.0, 643.0], [175.0, 1433.0], [181.0, 501.0], [182.0, 1058.5], [185.0, 991.0], [206.0, 441.5], [200.0, 196.0], [210.0, 613.0], [227.0, 590.0], [233.0, 948.0], [253.0, 797.0], [66.0, 523.0], [126.0, 817.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 253.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 59.0, "minX": 1.510488561E12, "maxY": 206.0, "series": [{"data": [[1.510488582E12, 59.0], [1.510488561E12, 206.0], [1.510488562E12, 200.0], [1.510488563E12, 200.0], [1.510488564E12, 167.0], [1.510488565E12, 183.0], [1.510488577E12, 161.0], [1.510488578E12, 169.0], [1.510488579E12, 192.0], [1.51048858E12, 202.0], [1.510488581E12, 151.0], [1.510488571E12, 200.0], [1.510488572E12, 200.0], [1.510488573E12, 161.0], [1.510488574E12, 183.0], [1.510488575E12, 196.0], [1.510488576E12, 170.0], [1.510488566E12, 200.0], [1.510488567E12, 200.0], [1.510488568E12, 200.0], [1.510488569E12, 200.0], [1.51048857E12, 200.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.510488582E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 66.0, "minX": 1.510488561E12, "maxY": 253.0, "series": [{"data": [[1.510488582E12, 66.0], [1.510488561E12, 206.0], [1.510488562E12, 200.0], [1.510488563E12, 136.0], [1.510488564E12, 151.0], [1.510488565E12, 253.0], [1.510488577E12, 175.0], [1.510488578E12, 185.0], [1.510488579E12, 233.0], [1.51048858E12, 140.0], [1.510488581E12, 227.0], [1.510488571E12, 200.0], [1.510488572E12, 126.0], [1.510488573E12, 160.0], [1.510488574E12, 181.0], [1.510488575E12, 169.0], [1.510488576E12, 182.0], [1.510488566E12, 210.0], [1.510488567E12, 200.0], [1.510488568E12, 200.0], [1.510488569E12, 200.0], [1.51048857E12, 200.0]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 1000, "maxX": 1.510488582E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 66.0, "minX": 1.510488561E12, "maxY": 253.0, "series": [{"data": [[1.510488582E12, 66.0], [1.510488561E12, 206.0], [1.510488562E12, 200.0], [1.510488563E12, 136.0], [1.510488564E12, 151.0], [1.510488565E12, 253.0], [1.510488577E12, 175.0], [1.510488578E12, 185.0], [1.510488579E12, 233.0], [1.51048858E12, 140.0], [1.510488581E12, 227.0], [1.510488571E12, 200.0], [1.510488572E12, 126.0], [1.510488573E12, 160.0], [1.510488574E12, 181.0], [1.510488575E12, 169.0], [1.510488576E12, 182.0], [1.510488566E12, 210.0], [1.510488567E12, 200.0], [1.510488568E12, 200.0], [1.510488569E12, 200.0], [1.51048857E12, 200.0]], "isOverall": false, "label": "Client_request(with 4 urls)-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 1000, "maxX": 1.510488582E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 10800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
