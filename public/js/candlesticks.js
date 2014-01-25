console.log('yoyo');
var width = 900;
var height = 500;
String.prototype.format = function() {
    var formatted = this;
    for (var i = 0; i < arguments.length; i++) {
        var regexp = new RegExp('\\{'+i+'\\}', 'gi');
        formatted = formatted.replace(regexp, arguments[i]);
    }
    return formatted;
};

var end = new Date();
var start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 60);
var data = [];

//var baseurl = 'http://cryptographs.herokuapp.com';
var baseurl = 'http://localhost:2500';

$.get(baseurl+'/WDC', function(data, status){

    var array = JSON.parse(data);
    buildChart(array);

//    var pickyPicky = [];
//    for (var key in array){
//        var omg = [5];
//        omg[0] = array[key].date;
//        omg[1] = array[key].open;
//        omg[2] = array[key].high;
//        omg[3] = array[key].low;
//        omg[4] = array[key].close;
//        pickyPicky.push(omg);
//    }
    //console.log(pickyPicky);
    //buildOtherChart(pickyPicky);
});

//$.get(baseurl+'/helloData', function(data, status){
//    console.log(data);
//});

function min(a, b){ return a < b ? a : b ; }

function max(a, b){ return a > b ? a : b; }

function buildChart(data){
    //console.log(data);
    var margin = 50;
    var chart = d3.select("#chart")
        .append("svg:svg")
        .attr("class", "chart")
        .attr("width", width)
        .attr("height", height);

    var y = d3.scale.linear()
        .domain([d3.min(data.map(function(x) {return x["low"];})), d3.max(data.map(function(x){return x["high"];}))])
        .range([height-margin, margin]);
    var x = d3.scale.linear()
        .domain([d3.min(data.map(function(d){
            return new Date(d.date).getTime();
        })), d3.max(data.map(function(d){
            return new Date(d.date).getTime();
        }))])
        .range([margin,width-margin]);
    chart.selectAll("line.x")
        .data(x.ticks(10))
        .enter().append("svg:line")
        .attr("class", "x")
        .attr("x1", x)
        .attr("x2", x)
        .attr("y1", margin)
        .attr("y2", height - margin)
        .attr("stroke", "#ccc");

    chart.selectAll("line.y")
        .data(y.ticks(10))
        .enter().append("svg:line")
        .attr("class", "y")
        .attr("x1", margin)
        .attr("x2", width - margin)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "#ccc");

    chart.selectAll("text.xrule")
        .data(x.ticks(10))
        .enter().append("svg:text")
        .attr("class", "xrule")
        .attr("x", x)
        .attr("y", height - margin)
        .attr("dy", 20)
        .attr("text-anchor", "middle")
        .text(function(d){ var date = new Date(d * 1000);  return (date.getMonth() + 1)+"/"+date.getDate(); });

    chart.selectAll("text.yrule")
        .data(y.ticks(10))
        .enter().append("svg:text")
        .attr("class", "yrule")
        .attr("x", width - margin)
        .attr("y", y)
        .attr("dy", 0)
        .attr("dx", 20)
        .attr("text-anchor", "middle")
        .text(String);

    chart.selectAll("rect")
        .data(data)
        .enter().append("svg:rect")
        .attr("x", function(d) {
            var thing = x(new Date(d.date).getTime());
            //console.log(thing);
            return thing;
        })
        .attr("y", function(d) {
            //console.log(y(max(d.open, d.close)));
            console.log("open = "+ d.open+"  close = "+ d.close);
            return y(max(d.open, d.close));
        })
        .attr("height", function(d) { return y(min(d.open, d.close))-y(max(d.open, d.close));})
        .attr("width", function(d) { return 0.5 * (width - 2*margin)/data.length; })
        .attr("fill",function(d) { return d.open > d.close ? "red" : "green" ;})
        .style("stroke", "#000000").style("stroke-width", 1);


    //todo: lines
//    chart.selectAll("line.stem")
//        .data(data)
//        .enter().append("svg:line")
//        .attr("class", "stem")
//        .attr("x1", function(d) { return x(d.date) + 0.25 * (width - 2 * margin)/ data.length;})
//        .attr("x2", function(d) { return x(d.date) + 0.25 * (width - 2 * margin)/ data.length;})
//        .attr("y1", function(d) { return y(d.high);})
//        .attr("y2", function(d) { return y(d.low); })
//        .attr("stroke", function(d){ return d.open > d.close ? "red" : "green"; })

}
var buildOtherChart = function(data) {
    //console.log(data);
    var $playground = $("#chart");
    var COL={date:0,open:1,high:2,low:3,close:4};
    var min=Math.min.apply(Math,data.map(shorty(COL.low))),
        max=Math.max.apply(Math,data.map(shorty(COL.high))),
        vscale=($playground.offsetHeight-20)/(max-min);

    console.log("min = "+ min + "  and max = "+ max);

//    var vol     = data.map(ƒ(COL.volume));
//    var volMin  = Math.min.apply(Math,vol),
//        volDiff = Math.max.apply(Math,vol)-volMin;

    var boxes = d3.select("#playground").selectAll("div.box").data(data);

    boxes.enter()
      .append('div').attr('class','box')
        .append('div').attr('class','range');

    boxes
      .sort(function(a,b){ return a[0]<b[0]?-1:a[0]>b[0]?1:0 })
      .attr('title',function(d){ return d[COL.date]+" open:"+d[COL.open]+", close:"+d[COL.close]+" ("+d[COL.low]+"–"+d[COL.high]+")" })
      .style('height',function(d){ return (d[COL.high]-d[COL.low])*vscale+'px' })
      .style('margin-bottom',function(d){ return (d[COL.low]-min)*vscale+'px'})
      .select('.range')
        .classed('fall',function(d){ return d[COL.open]>d[COL.close] })
        .style('height',function(d){ return Math.abs(d[COL.open]-d[COL.close])*vscale+'px' })
        .style('bottom',function(d){ return (Math.min(d[COL.close],d[COL.open])-d[COL.low])*vscale+'px'});
        //.style('opacity',function(d){ return (d[COL.volume]-volMin)/volDiff });

    boxes.exit().remove();
}

function appendToData(x){
    if(data.length > 0){
        return;
    }
    data = x.query.results.quote;
    for(var i=0;i<data.length;i++){
        data[i].timestamp = (new Date(data[i].Date).getTime() / 1000);
    }
    data = data.sort(function(x, y){ return x.timestamp - y.timestamp; });
    console.log(tade);
    buildChart(data);
}

//function buildQuery(){
//    var symbol = window.location.hash;
//    if(symbol === ""){
//        symbol = "AMZN";
//    }
//    symbol = symbol.replace("#", "");
//    var base = "select * from yahoo.finance.historicaldata where symbol = \"{0}\" and startDate = \"{1}\" and endDate = \"{2}\"";
//    var getDateString = d3.time.format("%Y-%m-%d");
//    var query = base.format(symbol, getDateString(start), getDateString(end));
//    query = encodeURIComponent(query);
//    var url = "http://query.yahooapis.com/v1/public/yql?q={0}&format=json&env=store%3A%2F%2Fdatatables.org%2Falltableswithkeys&callback=appendToData".format(query);
//    return url;
//}
//function fetchData(){
//    console.log('fecth');
//    url = buildQuery();
//    scriptElement = document.createElement("SCRIPT");
//    scriptElement.type = "text/javascript";
//    // i add to the url the call back function
//    scriptElement.src = url;
//    document.getElementsByTagName("HEAD")[0].appendChild(scriptElement);
//}
//$(document).ready(fetchData);


// Create a function that returns a particular property of its parameter.
// If that property is a function, invoke it (and pass optional params).
function shorty(name){
  var v,params=Array.prototype.slice.call(arguments,1);
  return function(o){
    return (typeof (v=o[name])==='function' ? v.apply(o,params) : v );
  };
}

// Return the first argument passed in
function I(d){ return d }