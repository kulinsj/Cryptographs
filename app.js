var mongoose = require('mongoose');
var http = require('http');
var express = require('express');
var app = express();
var uristring =
    process.env.MONGOLAB_URI ||
    process.env.MONGOHQ_URL ||
    'mongodb://localhost/Markets2';
var theport = process.env.PORT || 2500;

app.use('/', express.static(__dirname + '/public'));

var WDC_Market_url = 'http://pubapi.cryptsy.com/api.php?method=singlemarketdata&marketid=14';
mongoose.connect(uristring);
//var allURL = 'http://pubapi.cryptsy.com/api.php?method=marketdatav2';

var MarketSchema = mongoose.Schema({
    	marketid: Number,
    	label: String,
    	lasttradeprice: Number,
    	volume: Number,
    	lasttradetime: Date,
		primaryname: String,
		primarycode: String,
		secondaryname: String,
		secondaryCode: String,
		recenttrades: [{
			id: Number,
	    	time: Date,
	    	price: Number,
	    	quantity: Number,
	    	total: Number
		}],
		sellorders: [{
			price: Number,
	    	quantity: Number,
	    	total: Number
		}],
		buyorders: [{
			price: Number,
	    	quantity: Number,
	    	total: Number
	    }]
    });
var Market = mongoose.model('Market', MarketSchema);

var TradeSchema = mongoose.Schema({
    marketid: Number,
    date: Date,
    price: Number,
    amount: Number,
    tradeid: Number
});

var Trades = mongoose.model('Trades', TradeSchema);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.on('open', function callback(){
    console.log('connected to mongoose');

    var waiting = false;
    //setInterval(function(){
        if (!waiting) {
            waiting = true;
            var d = new Date();
            console.log('running GET '+ d.toLocaleTimeString());

            http.get(WDC_Market_url, function(res) {
                d = new Date();
                console.log('got response '+ d.toLocaleTimeString());
                waiting = false;
                // Buffer the body entirely for processing as a whole.
                var bodyChunks = [];
                res.on('data', function(chunk) {
                    // You can process streamed parts here...
                    bodyChunks.push(chunk);
                }).on('end', function() {
                    var body = Buffer.concat(bodyChunks);
                    try {
                        var data = JSON.parse(body);
                        var name = data.return.markets;
                        for (var key in name) {
                            parseTrades(name[key]);
                            //runUpdate(name[key]);
                        }
                    }
                    catch(e) {
                        console.log('caught error: '+e);
                    }
                    //console.log('BODY: ' + body);
                    // ...and/or process the entire body here.
                })
            });
        }
    //}, 20000);

    app.get('/', function(request, response){
        var timeInterval = 60000;
        var intervalCount = 360;
        var now = new Date();
        var start = now.getTime()- timeInterval*(intervalCount+1);

        Market.findOne({'label':'WDC/BTC'}, function(err, foundMarket){
            //var toSend = formatDataToSend(foundMarket, 60000, 360);
            response.send('Hello World');
            response.end();
        });
    });

    app.get('/WDC', function(request, response){
        Market.findOne({'label':'WDC/BTC'}, function(err, foundMarket){
            var toSend = formatDataToSend(foundMarket, 60000, 360);
            response.send('Hello World'+JSON.stringify(toSend));
            response.end();
        });
    });

    app.get('/helloData', function(request, response){
        response.send("All your base are belong to us.");
        response.end();
    });

    app.listen(theport);

    /*var server = http.createServer(function (request, response) {
        response.writeHead(200, {'Content-Type': 'text/plain'});
        console.log(request);
        response.write('hello world');
        response.end();
        }).listen(8124);*/

	// });
	// http.createServer(function (request, response) {
	// 	response.writeHead(200, {'Content-Type': 'text/plain'});
	// 	response.end(JSON.stringify(data));
	// }).listen(8124);
});

var parseTrades = function(data){
    var mID = data.marketid;
    var trades = data.recenttrades;
    Trades.findOne({'marketid':mID}).sort('-tradeid').exec(function(err, lastTrade){
        var newLeanTrades = [];
        if (lastTrade) {
            var stopID = lastTrade.tradeid;
            for (var i = 0; i < trades.length; i++) {
                if (trades[i].id > stopID) {
                    newLeanTrades.push({
                        "marketid":mID,
                        "price":trades[i].price,
                        "date":trades[i].time,
                        "amount":trades[i].total,
                        "tradeid":trades[i].id
                    });
                }
                else {
                    console.log("breaking");
                    break;
                }
            }
            //console.log("# of new = "+ newLeanTrades.length);
            if (newLeanTrades.length > 0) {
                Trades.create(newLeanTrades, function(err){
                    if (err)
                        console.log("Error "+ err);
                    else
                        console.log("saved "+ newLeanTrades.length +" new trades for mID "+ mID);
                });

            }
        }
        else {
            //console.log("nothing found");
            for (var i = 0; i < trades.length; i++) {
                newLeanTrades.push({
                    "marketid":mID,
                    "price":trades[i].price,
                    "date":trades[i].time,
                    "amount":trades[i].total,
                    "tradeid":trades[i].id
                });
            }
            //console.log("# of new = "+ newLeanTrades.length);
            Trades.create(newLeanTrades, function(err){
                if (err) console.log("Error "+ err);
                else console.log("saved "+ newLeanTrades.length +"new trades for mID "+ mID);
            });
        }
    });

}

var runUpdate = function (thisMarket) {
    Market.findOne({'label':thisMarket.label}, function(err, foundMarket){
        if (err) console.log(err);
        if (foundMarket) {
            //update
            var temp = new Market({
                recenttrades: thisMarket.recenttrades,
                buyorders: thisMarket.buyorders,
                sellorders: thisMarket.sellorders
            });

            var oldTrades = foundMarket.recenttrades;
            var newTrades = temp.recenttrades;
            var dupeMerge = oldTrades.concat(newTrades);

            var existingIDs = [];
            var merged = [];
            for (var ind in dupeMerge) {
                var id = dupeMerge[ind].id;
                if (existingIDs.indexOf(id)==-1){
                    existingIDs.push(id);
                    merged.push(dupeMerge[ind]);
                }
            }
            merged.sort(function(a, b) {
                var akey = a.time, bkey = b.time;
                if(akey < bkey) return 1;
                if(akey > bkey) return -1;
                return 0;
            });
            var newCount = merged.length - oldTrades.length;
            if (newCount > 0)
                console.log(newCount + " new trade(s) for " + foundMarket.label);

            var oldBuys = foundMarket.buyorders;
            var newBuys = temp.buyorders;
            //TODO: identify which orders are added/removed
            var oldSells = foundMarket.sellorders;
            var newSells = temp.sellorders;

            foundMarket.recenttrades = merged;
            foundMarket.sellorders = newSells;
            foundMarket.buyorders = newBuys;
            foundMarket.lasttradeprice = merged[0].price;
            foundMarket.save(function(err){
                if (err) console.log('failed to update: ' + err);
            });
        }
        else {
            //create new DB entry
            console.log(thisMarket.label + " not found, creating new entry");

            var toSave = new Market({
                marketid: thisMarket.marketid,
                label: thisMarket.label,
                lasttradeprice: thisMarket.lasttradeprice,
                volume: thisMarket.volume,
                lasttradetime: thisMarket.lasttradetime,
                primaryname: thisMarket.primaryname,
                primarycode: thisMarket.primarycode,
                secondaryname: thisMarket.secondaryname,
                secondaryCode: thisMarket.secondaryCode,
                recenttrades: thisMarket.recenttrades,
                buyorders: thisMarket.buyorders,
                sellorders: thisMarket.sellorders
            });
            toSave.save(function(err){
                if (err)
                    console.log('failed to save: ' + err);
                else
                    console.log('saved new market');
            });
        }
    });
}


function formatDataToSend(rawData, timeInterval, intervalCount) {
    var allTrades = rawData.recenttrades;
    if (!allTrades[0])
        return('no recenttrades found');
    var now = new Date();
    var roundedStart = new Date(Math.floor(now.getTime()- timeInterval*(intervalCount)/timeInterval)*timeInterval);
    var build = true;
    var times = [];
    times.push(roundedStart.getTime());
    var nextTime = roundedStart.getTime() + timeInterval;
    while (nextTime < roundedStart.getTime()) {
        times.push(nextTime);
        nextTime += timeInterval;
    }
    times = times.reverse();

    var cont = true;
    var tradeIndex = 0;
    var timeIndex = 0;
    var maxTimeIndex = times.length - 1;

    var output = [];
    var currentSet = [];
    for( var i = 0; i < allTrades.length; i++) {
        if (new Date(allTrades[i].time).getTime() > times[timeIndex]){
            currentSet.push(allTrades[i])
        }
        else {
            prices = [];
            for (var j = 0; j < currentSet.length; j++) {
                prices.push(currentSet.price);
            }
            var high = Math.max(prices);
            var low = Math.min(prices);
            var close = currentSet[0].price;
            var open = currentSet[currentSet.length-1].price;
            output.push({
                "High":high,
                "Low":low,
                "Open": open,
                "Close": close
            });
            currentSet = [];
            timeIndex++;

            //TODO: increment timeIndex as many times as necessary to push this trade
        }
    }



    return allTrades[0];
}