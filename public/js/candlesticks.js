var width = 900;
var height = 500;

var end = new Date();
var start = new Date(end.getTime() - 1000 * 60 * 60 * 24 * 60);
var theData = [];

var baseurl = 'http://cryptographs.herokuapp.com';
//var baseurl = 'http://localhost:2500';

$updateBtn = $("#updateBtn");
$mid = $("#mid");
$chartContainer = $("#chart");

initial();

//var socket = io.connect(baseurl);
//socket.on('connect', function(){
//    socket.emit('ask',{ marketid: 14 });
//});
//
//socket.on('newTrades', function(data){
//    console.log(data);
//});

$updateBtn.click(function(){
    $chartContainer.html('');
    initial();
});

function initial(){
    var requestData = { mID: $mid.val() };
    $.get(baseurl+'/SingleMarket',requestData, function(data, status){
        theData = JSON.parse(data);
        theData.sort(function(a,b){
            return new Date(a.time).getTime() - new Date(b.time).getTime();
        });
        //check for gaps in the data
        var currentMinute = new Date(theData[0].time).getMinutes();
        for (var i = 0; i < theData.length; i++){
            if (currentMinute != new Date(theData[i].time).getMinutes())
                console.log("Data minute Gap");
            currentMinute++;
            if (currentMinute == 60)
                currentMinute = 0;
        }
        buildChart(theData);
    });
}

function min(a, b){ return a < b ? a : b ; }

function max(a, b){ return a > b ? a : b; }

function buildChart(data){
    var timeRange = Math.abs((new Date(data[0].time).getTime()) - (new Date(data[data.length-1].time).getTime()));
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
            return new Date(d.time).getTime();
        })), d3.max(data.map(function(d){
            return new Date(d.time).getTime();
        }))])
        .range([margin,width-margin-40]);
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
        .attr("x2", width - margin-40)
        .attr("y1", y)
        .attr("y2", y)
        .attr("stroke", "#ccc");

    //TODO: adjust ticks based on time range
    chart.selectAll("text.xrule")
        .data(x.ticks(10))
        .enter().append("svg:text")
        .attr("class", "xrule")
        .attr("x", x)
        .attr("y", height - margin)
        .attr("dy", 20)
        .attr("text-anchor", "middle")
        .text(function(d){
            var date = new Date(d);
            if (timeRange < 1000*60*60*24) {
                //less than 6 hours, format to minutes
                var mins = date.getMinutes();
                if (mins < 10)
                    mins = "0"+mins;
                return(date.getHours()+":"+mins);
            }
            else if (timeRange < 1000*60*60*24*7) {
                //less than a week, format hours and days
                var mins = date.getMinutes();
                if (mins < 10)
                    mins = "0"+mins;
                return(date.getHours()+":"+mins+"/"+date.getDate());

            }
            else {
                //todo
                //more than a week, format day/month
            }
            return (date.getMonth() + 1)+"/"+date.getDate();
        });

    chart.selectAll("text.yrule")
        .data(y.ticks(10))
        .enter().append("svg:text")
        .attr("class", "yrule")
        .attr("x", width - margin-15)
        .attr("y", y)
        .attr("dy", 0)
        .attr("dx", 20)
        .attr("text-anchor", "middle")
        .text(function(d){
            return d.toFixed(8);
        });
        //.text(String);

    chart.selectAll("rect")
        .data(data)
        .enter().append("svg:rect")
        .attr("x", function(d) {
            return x(new Date(d.time).getTime());
        })
        .attr("y", function(d) {
            return y(max(d.open, d.close));
        })
        .attr("height", function(d) {
            return max(y(min(d.open, d.close))-y(max(d.open, d.close)),1);
        })
        .attr("width", function(d) {
            return 0.5 * (width - 2*margin)/data.length;
        })
        .attr("fill",function(d) {
            if (d.open > d.close)
                return "red";
            else if(d.open < d.close)
                return "green";
            return "black";
        });

    chart.selectAll("line.stem")
        .data(data)
        .enter().append("svg:line")
        .attr("class", "stem")
        .attr("x1", function(d) {
            return x(new Date(d.time).getTime()) + 0.25 * (width - 2 * margin)/ data.length;
        })
        .attr("x2", function(d) {
            return x(new Date(d.time).getTime()) + 0.25 * (width - 2 * margin)/ data.length;
        })
        .attr("y1", function(d) {
            return y(d.high);
        })
        .attr("y2", function(d) {
            return y(d.low);
        })
        .attr("stroke", function(d){ return d.open > d.close ? "red" : "green"; }).style("stroke-width",2);

}

function appendToData(x){
    if(data.length > 0){
        return;
    }
    data = x.query.results.quote;
    for(var i=0;i<data.length;i++){
        data[i].timestamp = (new Date(data[i].time).getTime() / 1000);
    }
    data = data.sort(function(x, y){ return x.timestamp - y.timestamp; });
    console.log(tade);
    buildChart(data);
}
